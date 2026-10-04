package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.SESSION_COOKIE
import io.github.thescarletarrow.codraw.TestcontainersConfiguration
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.signedIn
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.session.SessionRepository
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpRequest.BodyPublishers
import java.net.http.HttpResponse
import java.net.http.HttpResponse.BodyHandlers
import java.time.Duration
import java.util.Base64
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Session and CSRF cookies over real HTTP: MockMvc security helpers replace the repositories that write them. */
@SpringBootTest(
    webEnvironment = WebEnvironment.RANDOM_PORT,
    properties = ["codraw.internal-token=${IntegrationTest.INTERNAL_TOKEN}"],
)
@Import(TestcontainersConfiguration::class)
class SessionCookieTest(
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val sessions: SessionRepository<*>,
    @LocalServerPort private val port: Int,
) {

    private val http = HttpClient.newHttpClient()
    private lateinit var alice: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
    }

    @Test
    fun `does not start a session for requests without one`() {
        val response = send("GET", "/api/boards")

        assertEquals(401, response.statusCode())
        assertNull(setCookie(response, SESSION_COOKIE))
    }

    @Test
    fun `keeps the session in an HttpOnly SameSite=Lax cookie stored in PostgreSQL`() {
        val response = send("GET", "/api/oauth2/authorization/github")

        val cookie = assertNotNull(setCookie(response, SESSION_COOKIE))
        assertTrue("HttpOnly" in cookie && "SameSite=Lax" in cookie, cookie)
        val sessionId = String(Base64.getDecoder().decode(cookie.substringAfter('=').substringBefore(';')))
        val stored = jdbcClient.sql("SELECT count(*) FROM spring_session WHERE session_id = :id")
            .param("id", sessionId).query(Int::class.java).single()
        assertEquals(1, stored)
    }

    @Test
    fun `accepts changes with the token of the XSRF-TOKEN cookie in the X-XSRF-TOKEN header`() {
        val session = sessions.signedIn(alice).let { "${it.name}=${it.value}" }
        val xsrfCookie = assertNotNull(setCookie(send("GET", "/api/me", session), "XSRF-TOKEN"))
        assertTrue("HttpOnly" !in xsrfCookie, "The SPA must be able to read the token: $xsrfCookie")
        val xsrf = xsrfCookie.substringAfter('=').substringBefore(';')
        val cookies = "$session; XSRF-TOKEN=$xsrf"

        val withoutHeader = send("POST", "/api/boards", cookies, body = """{"title": "Без токена"}""")
        val withHeader = send("POST", "/api/boards", cookies, xsrf, """{"title": "С токеном"}""")

        assertEquals(403, withoutHeader.statusCode())
        assertEquals(201, withHeader.statusCode())
        assertEquals(1, jdbcClient.sql("SELECT count(*) FROM boards").query(Int::class.java).single())
    }

    @Test
    fun `ends the session on logout, after which the old cookie gets 401`() {
        val session = sessions.signedIn(alice).let { "${it.name}=${it.value}" }
        assertEquals(200, send("GET", "/api/me", session).statusCode())
        val xsrf = setCookie(send("GET", "/api/me", session), "XSRF-TOKEN")!!.substringAfter('=').substringBefore(';')

        val logout = send("POST", "/api/logout", "$session; XSRF-TOKEN=$xsrf", xsrf)

        assertEquals(204, logout.statusCode())
        assertEquals(401, send("GET", "/api/me", session).statusCode())
    }

    @Test
    fun `continues as a guest in a 30-day session with a persistent cookie`() {
        val xsrf = xsrfToken()

        val response = send("POST", "/api/guest", "XSRF-TOKEN=$xsrf", xsrf)

        assertEquals(204, response.statusCode())
        val cookie = assertNotNull(setCookie(response, SESSION_COOKIE))
        val maxAge = Regex("Max-Age=(\\d+)").find(cookie)?.groupValues?.get(1)?.toLong()
        assertTrue(maxAge != null && maxAge >= Duration.ofDays(30).toSeconds(), "The guest cookie must outlive the browser: $cookie")
        val session = cookie.substringBefore(';')
        val sessionId = String(Base64.getDecoder().decode(session.substringAfter('=')))
        val timeout = jdbcClient.sql("SELECT max_inactive_interval FROM spring_session WHERE session_id = :id")
            .param("id", sessionId).query(Int::class.java).single()
        assertEquals(Duration.ofDays(30).toSeconds().toInt(), timeout)
        val me = send("GET", "/api/me", session).body()
        assertTrue(Regex("\"name\":\"Гость \\d{1,3}\"").containsMatchIn(me) && "\"guest\":true" in me, me)
    }

    @Test
    fun `a guest who continues without a sign-in again stays the same guest`() {
        val xsrf = xsrfToken()
        val session = setCookie(send("POST", "/api/guest", "XSRF-TOKEN=$xsrf", xsrf), SESSION_COOKIE)!!.substringBefore(';')
        val guest = send("GET", "/api/me", session).body()
        val guests = guestCount()

        val again = send("POST", "/api/guest", "$session; XSRF-TOKEN=$xsrf", xsrf)

        assertEquals(204, again.statusCode())
        assertEquals(guests, guestCount())
        assertEquals(guest, send("GET", "/api/me", session).body())
    }

    @Test
    fun `continuing as a guest requires the CSRF token`() {
        val guests = guestCount()

        val response = send("POST", "/api/guest", "XSRF-TOKEN=${xsrfToken()}")

        assertEquals(403, response.statusCode())
        assertNull(setCookie(response, SESSION_COOKIE))
        assertEquals(guests, guestCount())
    }

    /** The CSRF token the backend puts into the XSRF-TOKEN cookie of every response. */
    private fun xsrfToken(): String =
        setCookie(send("GET", "/api/me"), "XSRF-TOKEN")!!.substringAfter('=').substringBefore(';')

    private fun guestCount() =
        jdbcClient.sql("SELECT count(*) FROM users WHERE provider = 'guest'").query(Int::class.java).single()

    private fun setCookie(response: HttpResponse<*>, name: String): String? =
        response.headers().allValues("Set-Cookie").firstOrNull { it.startsWith("$name=") }

    private fun send(
        method: String,
        path: String,
        cookies: String? = null,
        xsrf: String? = null,
        body: String? = null,
    ): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI.create("http://localhost:$port$path"))
            .method(method, body?.let(BodyPublishers::ofString) ?: BodyPublishers.noBody())
            .header("Content-Type", "application/json")
            .apply { cookies?.let { header("Cookie", it) } }
            .apply { xsrf?.let { header("X-XSRF-TOKEN", it) } }
            .build()
        return http.send(request, BodyHandlers.ofString())
    }
}
