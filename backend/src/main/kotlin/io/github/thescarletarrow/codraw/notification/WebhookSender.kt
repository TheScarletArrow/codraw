package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.schemaimport.Hosts
import org.springframework.stereotype.Component
import tools.jackson.databind.json.JsonMapper
import java.io.IOException
import java.net.URI
import java.net.URISyntaxException
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/** Why the backend does not take an address of a webhook; the `reason` of the answer. */
enum class WebhookUrlProblem(val reason: String) {
    /** Not an absolute `https` URL of at most 2048 characters without a user and a password. */
    INVALID("invalid-url"),

    /** The host is not among those that the administrator allowed. */
    HOST_NOT_ALLOWED("host-not-allowed"),
}

class InvalidWebhookUrlException(val problem: WebhookUrlProblem) : RuntimeException("The address of the webhook is not allowed")

/**
 * Posts messages to incoming webhooks of team chats as `{"text": …}`, which Slack, Mattermost and Rocket.Chat take.
 * The backend sends these requests for users to addresses they enter, so only to the hosts that the administrator
 * allowed, and never where a webhook redirects. The address of a webhook is a secret: it goes neither into the log nor
 * into exceptions.
 */
@Component
class WebhookSender(private val properties: NotificationProperties, private val json: JsonMapper) {

    private val allowedHosts: List<String> = properties.webhook.allowedHosts.map { it.trim() }.filter { it.isNotEmpty() }.map { host ->
        require(Hosts.isName(host)) { "codraw.notifications.webhook.allowed-hosts: \"$host\" is not a host name" }
        Hosts.normalize(host)
    }

    private val client: HttpClient = HttpClient.newBuilder()
        .connectTimeout(CONNECT_TIMEOUT)
        .followRedirects(HttpClient.Redirect.NEVER)
        .build()

    /** The hosts of webhooks that users may enter, as the administrator listed them. */
    val hosts: List<String>
        get() = allowedHosts

    /** Whether the administrator allowed any host. */
    val available: Boolean
        get() = allowedHosts.isNotEmpty()

    /** The address of a webhook that users may use; throws [InvalidWebhookUrlException] for any other. */
    fun check(url: String): URI {
        val uri = try {
            URI(url.trim())
        } catch (_: URISyntaxException) {
            throw InvalidWebhookUrlException(WebhookUrlProblem.INVALID)
        }
        val schemes = if (properties.webhook.allowHttp) setOf("https", "http") else setOf("https")
        if (url.length > MAX_LENGTH || uri.scheme?.lowercase() !in schemes || uri.rawUserInfo != null || uri.host == null) {
            throw InvalidWebhookUrlException(WebhookUrlProblem.INVALID)
        }
        if (Hosts.normalize(uri.host) !in allowedHosts) throw InvalidWebhookUrlException(WebhookUrlProblem.HOST_NOT_ALLOWED)
        return uri
    }

    /** What the settings show of the address of a webhook instead of the secret: its host and its last characters. */
    fun hint(url: String): String {
        val uri = check(url)
        return "${uri.scheme}://${uri.host}/…${url.trim().takeLast(HINT_LENGTH)}"
    }

    /** Posts the [text] to the webhook at [url]; throws [DeliveryException] when it did not go. */
    fun send(url: String, text: String) {
        val uri = try {
            check(url)
        } catch (_: InvalidWebhookUrlException) {
            // The administrator no longer allows the host: the user has to enter another webhook.
            throw DeliveryException(DeliveryError.REJECTED, "The host of the webhook is no longer allowed")
        }
        val request = HttpRequest.newBuilder(uri)
            .timeout(REQUEST_TIMEOUT)
            .header("Content-Type", "application/json; charset=utf-8")
            .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(mapOf("text" to text))))
            .build()
        val status = try {
            client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode()
        } catch (exception: IOException) {
            throw DeliveryException(DeliveryError.UNAVAILABLE, "The webhook did not answer: ${exception.javaClass.simpleName}")
        } catch (exception: InterruptedException) {
            Thread.currentThread().interrupt()
            throw DeliveryException(DeliveryError.UNAVAILABLE, "Interrupted: ${exception.javaClass.simpleName}")
        }
        when {
            status in 200..299 -> return
            // A timeout, too many requests or an error of the server pass; anything else, e.g. a webhook deleted in
            // the chat (404, 410) or a redirect that is not followed, is the answer of the webhook to any message.
            status == 408 || status == 429 || status >= 500 ->
                throw DeliveryException(DeliveryError.UNAVAILABLE, "The webhook answered $status")
            else -> throw DeliveryException(DeliveryError.REJECTED, "The webhook answered $status")
        }
    }

    private companion object {
        const val MAX_LENGTH = 2048
        const val HINT_LENGTH = 4
        val CONNECT_TIMEOUT: Duration = Duration.ofSeconds(5)
        val REQUEST_TIMEOUT: Duration = Duration.ofSeconds(10)
    }
}
