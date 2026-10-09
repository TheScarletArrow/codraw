package io.github.thescarletarrow.codraw.issue

import com.fasterxml.jackson.annotation.JsonValue
import org.springframework.stereotype.Component
import tools.jackson.core.JacksonException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.io.IOException
import java.net.URI
import java.net.URISyntaxException
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeParseException

/** Whether an issue is open. Stored by its name. */
enum class IssueState(@get:JsonValue val value: String) {
    OPEN("open"),
    CLOSED("closed"),
}

/** Why an issue is in its state, as GitHub says. Stored by its name. */
enum class IssueStateReason(@get:JsonValue val value: String, val gitHub: String) {
    /** Closed as done. */
    COMPLETED("completed", "completed"),

    /** Closed as not planned. */
    NOT_PLANNED("not-planned", "not_planned"),

    /** Closed as a duplicate of another issue. */
    DUPLICATE("duplicate", "duplicate"),

    /** Open again after it was closed. */
    REOPENED("reopened", "reopened"),
    ;

    companion object {
        /** The reason that GitHub names [value]; `null` for none and for a reason that GitHub adds later. */
        fun ofGitHub(value: String?): IssueStateReason? = entries.find { it.gitHub == value }
    }
}

/** An issue as the tracker shows it now. */
data class TrackerIssue(
    /** The id of the issue in the tracker, which stays when its repository is renamed or the issue is transferred. */
    val externalId: Long,
    /** `owner/name` of the repository. */
    val repository: String,
    val number: Int,
    val title: String,
    val state: IssueState,
    val stateReason: IssueStateReason?,
    /** The page of the issue in the tracker. */
    val url: String,
    val updatedAt: Instant,
)

/** A repository that a token reaches. */
data class TrackerRepository(
    /** `owner/name`. */
    val fullName: String,
    val private: Boolean,
)

/** Why the tracker did not do what it was asked. */
sealed class TrackerException(message: String) : RuntimeException(message)

/** The tracker refused the token: it expired, was revoked or never was a token. */
class TokenRejectedException : TrackerException("The tracker refused the token")

/** No such repository or issue, or the token does not reach it: GitHub answers both the same, so as not to tell. */
class TrackerNotFoundException : TrackerException("No such issue or repository, or the token does not reach it")

/** The token reaches the repository but may not do this, e.g. create issues with a token that only reads them. */
class TrackerForbiddenException : TrackerException("The token may not do this")

/** The issue was deleted, or issues of its repository were turned off. */
class IssueGoneException : TrackerException("The issue is gone")

/** The number is of a pull request, not of an issue. */
class NotAnIssueException : TrackerException("This is a pull request, not an issue")

/** The tracker did not take what was sent, e.g. an issue in a repository whose issues are turned off. */
class TrackerRejectedException : TrackerException("The tracker did not take the request")

/** No answer, a timeout, an error of the tracker or its limit of requests: worth trying again later. */
class TrackerUnavailableException(message: String) : TrackerException(message)

/**
 * The REST API of GitHub, called with the personal access token of a user. Requests go only to the API that the
 * administrator configured: a redirect is followed only within it, so the token never goes anywhere else. The token goes
 * neither into the log nor into exceptions.
 */
@Component
class GitHubClient(properties: IssueProperties, private val json: JsonMapper) {

    private val api: URI? = properties.github.apiUrl.trim().trimEnd('/').takeIf { it.isNotEmpty() }?.let { url ->
        val uri = try {
            URI(url)
        } catch (_: URISyntaxException) {
            null
        }
        require(uri != null && uri.scheme in setOf("https", "http") && uri.host != null && uri.rawUserInfo == null) {
            "codraw.issues.github.api-url: \"$url\" is not an address of the API of GitHub"
        }
        uri
    }

    private val client: HttpClient = HttpClient.newBuilder()
        .connectTimeout(CONNECT_TIMEOUT)
        .followRedirects(HttpClient.Redirect.NEVER)
        .build()

    /** Whether the administrator left the tracker on. */
    val available: Boolean
        get() = api != null

    /**
     * The site of GitHub that users open, where they create their tokens: github.com for its API, the host of the API
     * for GitHub Enterprise Server.
     */
    val webUrl: String?
        get() = api?.let { if (it.host == "api.github.com") "https://github.com" else "${it.scheme}://${it.rawAuthority}" }

    /** The login of the account that the [token] belongs to. */
    fun login(token: String): String {
        val login = get(token, "/user").path("login")
        return login.takeIf { it.isString }?.stringValue() ?: throw TrackerUnavailableException("No login in the answer")
    }

    fun repository(token: String, repository: String): TrackerRepository =
        repositoryOf(get(token, "/repos/$repository")) ?: throw TrackerUnavailableException("Not a repository in the answer")

    /** The repositories that the [token] reaches and whose issues are on, recently changed first, at most 100. */
    fun repositories(token: String): List<TrackerRepository> =
        get(token, "/user/repos?per_page=$PAGE_SIZE&sort=pushed").values()
            .filter { it.path("has_issues").let { issues -> !issues.isBoolean || issues.asBoolean() } }
            .mapNotNull(::repositoryOf)

    /** The issue [number] of the [repository]; throws [NotAnIssueException] for a pull request. */
    fun issue(token: String, repository: String, number: Int): TrackerIssue {
        val node = get(token, "/repos/$repository/issues/$number")
        if (!node.path("pull_request").isMissingNode) throw NotAnIssueException()
        return issueOf(node) ?: throw TrackerUnavailableException("Not an issue in the answer")
    }

    /** Issues of the [repository] whose title or text has the words of [text], at most 10, best first. */
    fun search(token: String, repository: String, text: String): List<TrackerIssue> {
        // Words only: a qualifier of the text, e.g. `repo:…`, would search elsewhere.
        val words = text.replace(QUALIFIER_CHARACTERS, " ").trim()
        val query = URLEncoder.encode("repo:$repository is:issue $words", Charsets.UTF_8)
        return get(token, "/search/issues?q=$query&per_page=$SEARCH_SIZE").path("items").values().mapNotNull(::issueOf)
    }

    /** Creates an issue in the [repository] with the [title] and the Markdown [body]. */
    fun create(token: String, repository: String, title: String, body: String): TrackerIssue {
        val request = json.writeValueAsString(mapOf("title" to title, "body" to body))
        return issueOf(send(token, "POST", "/repos/$repository/issues", request))
            ?: throw TrackerUnavailableException("Not an issue in the answer")
    }

    private fun get(token: String, path: String): JsonNode = send(token, "GET", path, null)

    private fun send(token: String, method: String, path: String, body: String?): JsonNode {
        val base = api ?: throw TrackerUnavailableException("The tracker is off")
        var uri = URI.create(base.toString() + path)
        repeat(MAX_REDIRECTS + 1) {
            val response = exchange(token, method, uri, body)
            val status = response.statusCode()
            if (status in REDIRECTS) {
                uri = sameApi(base, uri, response.headers().firstValue("Location").orElse(null))
                    ?: throw TrackerUnavailableException("The tracker redirected away from its API")
                // GitHub answers 301 to a GET of a renamed repository or a transferred issue and 307 to other methods.
                if (method != "GET" && status != 307 && status != 308) throw TrackerUnavailableException("The tracker answered $status")
                return@repeat
            }
            return when {
                status in 200..299 -> parse(response.body())
                status == 401 -> throw TokenRejectedException()
                status == 404 -> throw TrackerNotFoundException()
                status == 410 -> throw IssueGoneException()
                // A limit of requests, primary or secondary, passes; any other refusal is the answer to this token.
                status == 429 || (status == 403 && rateLimited(response)) ->
                    throw TrackerUnavailableException("The tracker limits the requests of the token")
                status == 403 -> throw TrackerForbiddenException()
                status == 422 -> throw TrackerRejectedException()
                else -> throw TrackerUnavailableException("The tracker answered $status")
            }
        }
        throw TrackerUnavailableException("Too many redirects")
    }

    private fun exchange(token: String, method: String, uri: URI, body: String?): HttpResponse<String> {
        val request = HttpRequest.newBuilder(uri)
            .timeout(REQUEST_TIMEOUT)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", API_VERSION)
            .header("User-Agent", USER_AGENT)
            .header("Authorization", "Bearer $token")
            .apply {
                if (body == null) {
                    method(method, HttpRequest.BodyPublishers.noBody())
                } else {
                    header("Content-Type", "application/json; charset=utf-8")
                    method(method, HttpRequest.BodyPublishers.ofString(body))
                }
            }
            .build()
        return try {
            client.send(request, HttpResponse.BodyHandlers.ofString())
        } catch (exception: IOException) {
            throw TrackerUnavailableException("The tracker did not answer: ${exception.javaClass.simpleName}")
        } catch (exception: InterruptedException) {
            Thread.currentThread().interrupt()
            throw TrackerUnavailableException("Interrupted: ${exception.javaClass.simpleName}")
        }
    }

    private fun parse(body: String): JsonNode = try {
        json.readTree(body)
    } catch (_: JacksonException) {
        throw TrackerUnavailableException("The answer of the tracker is not JSON")
    }

    private fun rateLimited(response: HttpResponse<*>): Boolean =
        response.headers().firstValue("x-ratelimit-remaining").orElse(null) == "0" ||
            response.headers().firstValue("retry-after").isPresent

    /** The issue of an answer or an event of GitHub; `null` when [node] is not one. */
    fun issueOf(node: JsonNode): TrackerIssue? {
        val updatedAt = try {
            node.text("updated_at")?.let(Instant::parse)
        } catch (_: DateTimeParseException) {
            null
        }
        return TrackerIssue(
            externalId = node.path("id").takeIf { it.isIntegralNumber && it.canConvertToLong() }?.longValue() ?: return null,
            repository = node.text("repository_url")?.let(::repositoryName) ?: return null,
            number = node.path("number").takeIf { it.isIntegralNumber }?.asInt() ?: return null,
            // GitHub keeps titles of at most 256 characters; a longer one is cut rather than refused.
            title = node.text("title")?.take(MAX_TITLE_LENGTH) ?: return null,
            state = when (node.text("state")) {
                "open" -> IssueState.OPEN
                "closed" -> IssueState.CLOSED
                else -> return null
            },
            stateReason = IssueStateReason.ofGitHub(node.text("state_reason")),
            url = node.text("html_url")?.takeIf(::isPage) ?: return null,
            updatedAt = updatedAt ?: return null,
        )
    }

    /** The repository of an answer or an event of GitHub; `null` when [node] is not one. */
    fun repositoryOf(node: JsonNode): TrackerRepository? {
        val name = node.text("full_name")?.takeIf { Repositories.isName(it) } ?: return null
        return TrackerRepository(name, node.path("private").asBoolean(true))
    }

    private fun JsonNode.text(field: String): String? = path(field).takeIf { it.isString }?.stringValue()

    /** `owner/name` from the address of a repository in the API, e.g. `https://api.github.com/repos/owner/name`. */
    private fun repositoryName(url: String): String? =
        url.substringAfterLast("/repos/", "").takeIf { Repositories.isName(it) }

    /** Only an address of a page opens in the browser: never `javascript:` or the like. */
    private fun isPage(url: String): Boolean = url.length <= MAX_URL_LENGTH &&
        (url.startsWith("https://") || url.startsWith("http://"))

    /** The address of a redirect, when it stays within the API, `null` otherwise. */
    private fun sameApi(base: URI, from: URI, location: String?): URI? {
        val target = try {
            location?.let { from.resolve(it) }
        } catch (_: IllegalArgumentException) {
            null
        } ?: return null
        val sameOrigin = target.scheme == base.scheme && target.rawAuthority == base.rawAuthority
        return target.takeIf { sameOrigin && (target.rawPath ?: "").startsWith(base.rawPath ?: "") }
    }

    private companion object {
        const val API_VERSION = "2022-11-28"
        const val USER_AGENT = "CoDraw"
        const val PAGE_SIZE = 100
        const val SEARCH_SIZE = 10
        const val MAX_REDIRECTS = 3
        const val MAX_TITLE_LENGTH = 1000
        const val MAX_URL_LENGTH = 2048
        val REDIRECTS = setOf(301, 302, 307, 308)
        val QUALIFIER_CHARACTERS = Regex("[:\"]")
        val CONNECT_TIMEOUT: Duration = Duration.ofSeconds(5)
        val REQUEST_TIMEOUT: Duration = Duration.ofSeconds(10)
    }
}

/** Names of repositories of GitHub: `owner/name`. */
object Repositories {

    private val NAME = Regex("[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}")

    /** Whether [value] is `owner/name` of a repository, which goes into a path of the API as it is. */
    fun isName(value: String): Boolean = NAME.matches(value) && value.substringAfter('/') !in setOf(".", "..")
}
