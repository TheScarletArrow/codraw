package io.github.thescarletarrow.codraw.security

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.test.context.DynamicPropertyRegistrar
import tools.jackson.databind.json.JsonMapper
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/**
 * The endpoints of Яндекс ID and VK ID that the backend calls itself, the exchange of the code and the user info, on this
 * machine. They check the requests as the providers do: Yandex wants its secret in the body and its scheme `OAuth` for
 * the token; VK ID wants the `device_id` of its callback, the `state`, its client id and the code verifier of the
 * challenge, and no secret. Tests sign users in with [yandexCode] and [vkCode] and read the [requests].
 */
object FakeSignInProviders {

    const val YANDEX_CLIENT_ID = "test-yandex-client"
    const val YANDEX_CLIENT_SECRET = "test-yandex-secret"
    const val VK_CLIENT_ID = "test-vk-client"

    /** A request that a provider got: its path with the query, the header `Authorization` and the form of the body. */
    data class Request(val path: String, val authorization: String?, val form: Map<String, String>)

    private class VkCode(val challenge: String, val state: String, val deviceId: String, val user: Map<String, Any?>?)

    private val json = JsonMapper.builder().build()
    private val yandexCodes = ConcurrentHashMap<String, Map<String, Any?>>()
    private val vkCodes = ConcurrentHashMap<String, VkCode>()
    private val yandexTokens = ConcurrentHashMap<String, Map<String, Any?>>()
    private val vkTokens = ConcurrentHashMap<String, Map<String, Any?>>()

    /** The requests the providers got, oldest first. */
    val requests = CopyOnWriteArrayList<Request>()

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

    fun reset() {
        yandexCodes.clear()
        vkCodes.clear()
        yandexTokens.clear()
        vkTokens.clear()
        requests.clear()
    }

    /** Yandex signed in the user with the user info [profile] and sends the browser back with [code]. */
    fun yandexCode(code: String, profile: Map<String, Any?>) {
        yandexCodes[code] = profile
    }

    /**
     * VK ID signed in [user] for the authorization request with the [challenge] and the [state] on the device [deviceId]
     * and sends the browser back with [code]; without a user its user info answers an error.
     */
    fun vkCode(code: String, challenge: String, state: String, deviceId: String, user: Map<String, Any?>?) {
        vkCodes[code] = VkCode(challenge, state, deviceId, user)
    }

    private fun handle(exchange: HttpExchange) {
        val path = exchange.requestURI.rawPath
        val query = exchange.requestURI.rawQuery
        val form = formOf(exchange.requestBody.readAllBytes().toString(Charsets.UTF_8))
        requests += Request(if (query == null) path else "$path?$query", exchange.requestHeaders.getFirst("Authorization"), form)
        when ("${exchange.requestMethod} $path") {
            "POST /yandex/token" -> yandexToken(exchange, form)
            "GET /yandex/info" -> {
                val profile = exchange.requestHeaders.getFirst("Authorization")?.removePrefix("OAuth ")?.let(yandexTokens::get)
                when {
                    query != "format=json" -> exchange.send(400, mapOf("error" to "unsupported format"))
                    profile == null -> exchange.send(401, mapOf("error" to "invalid_token"))
                    else -> exchange.send(200, profile)
                }
            }
            "POST /vk/oauth2/auth" -> vkToken(exchange, form)
            "POST /vk/oauth2/user_info" -> {
                val user = vkTokens[form["access_token"]]?.takeIf { form["client_id"] == VK_CLIENT_ID }
                // VK ID wraps the profile in `user`, and an error has none.
                exchange.send(200, if (user == null) mapOf("error" to "invalid_token") else mapOf("user" to user))
            }
            else -> exchange.send(404, mapOf("error" to "not found"))
        }
    }

    private fun yandexToken(exchange: HttpExchange, form: Map<String, String>) {
        if (form["client_id"] != YANDEX_CLIENT_ID || form["client_secret"] != YANDEX_CLIENT_SECRET) {
            return exchange.send(401, mapOf("error" to "invalid_client"))
        }
        if (form["grant_type"] != "authorization_code") return exchange.send(400, mapOf("error" to "unsupported_grant_type"))
        val profile = form["code"]?.let(yandexCodes::remove) ?: return exchange.send(400, mapOf("error" to "invalid_grant"))
        val token = "yandex-${UUID.randomUUID()}"
        yandexTokens[token] = profile
        exchange.send(200, mapOf("token_type" to "bearer", "access_token" to token, "expires_in" to 31536000, "refresh_token" to "r"))
    }

    private fun vkToken(exchange: HttpExchange, form: Map<String, String>) {
        val code = form["code"]?.let(vkCodes::get) ?: return exchange.send(400, mapOf("error" to "invalid_grant"))
        val problem = when {
            form["grant_type"] != "authorization_code" -> "grant_type"
            form["client_id"] != VK_CLIENT_ID -> "client_id"
            "client_secret" in form -> "client_secret"
            form["device_id"] != code.deviceId -> "device_id"
            form["state"] != code.state -> "state"
            form["redirect_uri"].isNullOrEmpty() -> "redirect_uri"
            form["code_verifier"]?.let(::challengeOf) != code.challenge -> "code_verifier"
            else -> null
        }
        if (problem != null) return exchange.send(400, mapOf("error" to "invalid_request", "error_description" to "Bad $problem"))
        vkCodes.remove(form["code"])
        val token = "vk-${UUID.randomUUID()}"
        code.user?.let { vkTokens[token] = it }
        exchange.send(
            200,
            mapOf(
                "access_token" to token,
                "refresh_token" to "r",
                "id_token" to "h.p.s",
                "token_type" to "Bearer",
                "expires_in" to 3600,
                "user_id" to (code.user?.get("user_id") ?: 0),
                "state" to code.state,
                "scope" to "vkid.personal_info",
            ),
        )
    }

    /** The challenge of PKCE with S256 for the [verifier]. */
    fun challengeOf(verifier: String): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))

    private fun formOf(body: String): Map<String, String> = body.split('&').filter { it.isNotEmpty() }.associate { pair ->
        val (name, value) = (pair.split('=', limit = 2) + "").take(2)
        URLDecoder.decode(name, Charsets.UTF_8) to URLDecoder.decode(value, Charsets.UTF_8)
    }

    private fun HttpExchange.send(status: Int, value: Any) {
        val bytes = json.writeValueAsBytes(value)
        responseHeaders.add("Content-Type", "application/json; charset=utf-8")
        sendResponseHeaders(status, bytes.size.toLong())
        responseBody.use { it.write(bytes) }
    }
}

/** Points the exchange of the code and the user info of Яндекс ID and VK ID at [FakeSignInProviders]. */
@TestConfiguration(proxyBeanMethods = false)
class FakeSignInProvidersConfiguration {

    @Bean
    fun fakeSignInProvidersProperties() = DynamicPropertyRegistrar { registry ->
        val provider = "spring.security.oauth2.client.provider"
        registry.add("$provider.yandex.token-uri") { "${FakeSignInProviders.url}/yandex/token" }
        registry.add("$provider.yandex.user-info-uri") { "${FakeSignInProviders.url}/yandex/info?format=json" }
        registry.add("$provider.vk.token-uri") { "${FakeSignInProviders.url}/vk/oauth2/auth" }
        registry.add("$provider.vk.user-info-uri") { "${FakeSignInProviders.url}/vk/oauth2/user_info" }
    }
}
