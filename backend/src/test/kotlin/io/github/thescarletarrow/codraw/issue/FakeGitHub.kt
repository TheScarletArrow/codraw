package io.github.thescarletarrow.codraw.issue

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.test.context.DynamicPropertyRegistrar
import tools.jackson.databind.json.JsonMapper
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicLong

/**
 * The REST API of GitHub on this machine, as far as CoDraw calls it: accounts by their tokens, repositories that each
 * token reaches, and their issues. Tests change it and read the requests it got.
 */
object FakeGitHub {

    /** A request that the API got. */
    data class Request(val method: String, val path: String, val token: String?, val body: String)

    data class Issue(
        val id: Long,
        val repository: String,
        val number: Int,
        var title: String,
        var state: String = "open",
        var stateReason: String? = null,
        var updatedAt: Instant = Instant.parse("2026-01-01T00:00:00Z"),
        var body: String = "",
        val pullRequest: Boolean = false,
        var deleted: Boolean = false,
    )

    private class Account(val login: String, val repositories: MutableSet<String>, var writes: Boolean, var revoked: Boolean = false)

    private val json = JsonMapper.builder().build()
    private val accounts = ConcurrentHashMap<String, Account>()
    private val privateRepositories = ConcurrentHashMap.newKeySet<String>()
    private val issues = CopyOnWriteArrayList<Issue>()
    private val ids = AtomicLong(1000)

    /** Repositories renamed, by their old names: requests of the old name are redirected. */
    private val renamed = ConcurrentHashMap<String, String>()

    /** The requests the API got, oldest first. */
    val requests = CopyOnWriteArrayList<Request>()

    /** Answers every request with this status while set, e.g. 503. */
    @Volatile
    var failing: Int? = null

    private val server = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0).apply {
        createContext("/") { exchange ->
            try {
                handle(exchange)
            } finally {
                exchange.close()
            }
        }
        start()
    }

    val url: String
        get() = "http://localhost:${server.address.port}"

    /** Forgets every account, repository, issue and request. */
    fun reset() {
        accounts.clear()
        privateRepositories.clear()
        issues.clear()
        renamed.clear()
        requests.clear()
        failing = null
    }

    /** An account with the [token] that reaches the [repositories], and creates issues in them when it [writes]. */
    fun account(token: String, login: String, vararg repositories: String, writes: Boolean = true) {
        accounts[token] = Account(login, repositories.toMutableSet(), writes)
    }

    /** The token no longer works, e.g. its owner revoked it. */
    fun revoke(token: String) {
        accounts.getValue(token).revoked = true
    }

    /** The token no longer reaches the [repository]. */
    fun forbid(token: String, repository: String) {
        accounts.getValue(token).repositories -= repository
    }

    fun privateRepository(repository: String) {
        privateRepositories += repository
    }

    fun issue(repository: String, number: Int, title: String, pullRequest: Boolean = false): Issue =
        Issue(ids.incrementAndGet(), repository, number, title, pullRequest = pullRequest).also { issues += it }

    /** Moves the [issue] to another repository under another number and id, as GitHub transfers issues. */
    fun transfer(issue: Issue, repository: String, number: Int): Issue {
        issue.deleted = true
        renamed["${issue.repository}#${issue.number}"] = "$repository#$number"
        return issue(repository, number, issue.title).also { it.updatedAt = issue.updatedAt.plusSeconds(1) }
    }

    /** The JSON of the [issue] as the API and events of webhooks show it. */
    fun issueJson(issue: Issue): Map<String, Any?> = buildMap {
        put("id", issue.id)
        put("number", issue.number)
        put("title", issue.title)
        put("state", issue.state)
        put("state_reason", issue.stateReason)
        put("html_url", "https://github.com/${issue.repository}/issues/${issue.number}")
        put("updated_at", issue.updatedAt.toString())
        put("repository_url", "$url/repos/${issue.repository}")
        put("body", issue.body)
        if (issue.pullRequest) put("pull_request", mapOf("url" to "$url/repos/${issue.repository}/pulls/${issue.number}"))
    }

    fun repositoryJson(repository: String): Map<String, Any?> =
        mapOf("full_name" to repository, "private" to (repository in privateRepositories), "has_issues" to true)

    private fun handle(exchange: HttpExchange) {
        val method = exchange.requestMethod
        val path = exchange.requestURI.rawPath
        val query = exchange.requestURI.rawQuery.orEmpty()
        val token = exchange.requestHeaders.getFirst("Authorization")?.removePrefix("Bearer ")
        val body = exchange.requestBody.readAllBytes().toString(Charsets.UTF_8)
        requests += Request(method, if (query.isEmpty()) path else "$path?$query", token, body)
        failing?.let { return exchange.send(it, mapOf("message" to "Unavailable")) }
        val account = accounts[token]?.takeUnless { it.revoked } ?: return exchange.send(401, mapOf("message" to "Bad credentials"))
        val parts = path.trim('/').split('/')
        when {
            method == "GET" && path == "/user" -> exchange.send(200, mapOf("login" to account.login))
            method == "GET" && path == "/user/repos" -> exchange.send(200, account.repositories.sorted().map(::repositoryJson))
            method == "GET" && path == "/search/issues" -> {
                val q = URLDecoder.decode(query.substringAfter("q=").substringBefore('&'), Charsets.UTF_8)
                val repository = q.substringAfter("repo:").substringBefore(' ')
                val words = q.substringAfter("is:issue").trim().split(' ').filter { it.isNotBlank() }
                val found = issues.filter { issue ->
                    issue.repository == repository && repository in account.repositories && !issue.deleted && !issue.pullRequest &&
                        words.all { issue.title.contains(it, ignoreCase = true) }
                }
                exchange.send(200, mapOf("total_count" to found.size, "items" to found.map(::issueJson)))
            }
            parts.size == 3 && parts[0] == "repos" && method == "GET" -> {
                val repository = "${parts[1]}/${parts[2]}"
                if (repository !in account.repositories) return exchange.send(404, mapOf("message" to "Not Found"))
                exchange.send(200, repositoryJson(repository))
            }
            parts.size == 5 && parts[0] == "repos" && parts[3] == "issues" -> {
                val repository = "${parts[1]}/${parts[2]}"
                val number = parts[4].toInt()
                renamed["$repository#$number"]?.let { target ->
                    if (repository in account.repositories) {
                        val (newRepository, newNumber) = target.split('#')
                        exchange.responseHeaders.add("Location", "$url/repos/$newRepository/issues/$newNumber")
                        return exchange.send(301, mapOf("message" to "Moved Permanently"))
                    }
                }
                if (repository !in account.repositories) return exchange.send(404, mapOf("message" to "Not Found"))
                val issue = issues.find { it.repository == repository && it.number == number }
                    ?: return exchange.send(404, mapOf("message" to "Not Found"))
                if (issue.deleted) return exchange.send(410, mapOf("message" to "This issue was deleted"))
                exchange.send(200, issueJson(issue))
            }
            parts.size == 4 && parts[0] == "repos" && parts[3] == "issues" && method == "POST" -> {
                val repository = "${parts[1]}/${parts[2]}"
                if (repository !in account.repositories) return exchange.send(404, mapOf("message" to "Not Found"))
                if (!account.writes) return exchange.send(403, mapOf("message" to "Resource not accessible by personal access token"))
                val request = json.readTree(body)
                val number = (issues.filter { it.repository == repository }.maxOfOrNull { it.number } ?: 0) + 1
                val issue = issue(repository, number, request["title"].asString()).also { it.body = request["body"].asString() }
                exchange.send(201, issueJson(issue))
            }
            else -> exchange.send(404, mapOf("message" to "Not Found"))
        }
    }

    private fun HttpExchange.send(status: Int, value: Any) {
        val bytes = json.writeValueAsBytes(value)
        responseHeaders.add("Content-Type", "application/json; charset=utf-8")
        sendResponseHeaders(status, bytes.size.toLong())
        responseBody.use { it.write(bytes) }
    }
}

/** Points the backend of the tests at [FakeGitHub], with the secret of its webhook. */
@TestConfiguration(proxyBeanMethods = false)
class FakeGitHubConfiguration {

    @Bean
    fun fakeGitHubProperties() = DynamicPropertyRegistrar { registry ->
        registry.add("codraw.issues.github.api-url") { FakeGitHub.url }
        registry.add("codraw.issues.github.webhook-secret") { WEBHOOK_SECRET }
    }

    companion object {
        const val WEBHOOK_SECRET = "test-webhook-secret"
    }
}
