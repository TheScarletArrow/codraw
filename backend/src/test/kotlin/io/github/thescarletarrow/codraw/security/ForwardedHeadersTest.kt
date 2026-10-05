package io.github.thescarletarrow.codraw.security

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.SESSION_COOKIE
import io.github.thescarletarrow.codraw.TestcontainersConfiguration
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Import
import java.net.URI
import java.net.URLDecoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpRequest.BodyPublishers
import java.net.http.HttpResponse
import java.net.http.HttpResponse.BodyHandlers
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * The backend behind nginx and a proxy that terminates TLS, over real HTTP: Tomcat applies X-Forwarded-* of trusted
 * proxies, which MockMvc does not run. The test client connects from 127.0.0.1, an internal address like the proxies.
 */
@SpringBootTest(
    webEnvironment = WebEnvironment.RANDOM_PORT,
    properties = ["codraw.internal-token=${IntegrationTest.INTERNAL_TOKEN}"],
)
@Import(TestcontainersConfiguration::class)
class ForwardedHeadersTest(@LocalServerPort private val port: Int) {

    private val http = HttpClient.newHttpClient()
    private val behindTls = mapOf("X-Forwarded-Proto" to "https", "X-Forwarded-Host" to "codraw.example.com")

    @Test
    fun `builds the OAuth callback URL from the scheme and the host that the user sees`() {
        val response = send("GET", "/api/oauth2/authorization/github", behindTls)

        assertEquals(302, response.statusCode())
        val location = URLDecoder.decode(response.headers().firstValue("Location").orElseThrow(), Charsets.UTF_8)
        assertTrue("redirect_uri=https://codraw.example.com/api/login/oauth2/code/github" in location, location)
    }

    @Test
    fun `builds the OAuth callback URL from the request itself without a proxy`() {
        val response = send("GET", "/api/oauth2/authorization/google")

        val location = URLDecoder.decode(response.headers().firstValue("Location").orElseThrow(), Charsets.UTF_8)
        assertTrue("redirect_uri=http://localhost:$port/api/login/oauth2/code/google" in location, location)
    }

    @Test
    fun `gives a secure session cookie behind a TLS proxy only`() {
        assertTrue("Secure" in guestSessionCookie(behindTls))
        assertFalse("Secure" in guestSessionCookie(emptyMap()))
    }

    private fun guestSessionCookie(headers: Map<String, String>): String {
        val xsrf = setCookie(send("GET", "/api/me", headers), "XSRF-TOKEN")!!.substringAfter('=').substringBefore(';')
        val response = send("POST", "/api/guest", headers + mapOf("Cookie" to "XSRF-TOKEN=$xsrf", "X-XSRF-TOKEN" to xsrf))
        assertEquals(204, response.statusCode())
        return assertNotNull(setCookie(response, SESSION_COOKIE))
    }

    private fun setCookie(response: HttpResponse<*>, name: String): String? =
        response.headers().allValues("Set-Cookie").firstOrNull { it.startsWith("$name=") }

    private fun send(method: String, path: String, headers: Map<String, String> = emptyMap()): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI.create("http://localhost:$port$path"))
            .method(method, BodyPublishers.noBody())
            .apply { headers.forEach(::header) }
            .build()
        return http.send(request, BodyHandlers.ofString())
    }
}
