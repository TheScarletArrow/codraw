package io.github.thescarletarrow.codraw.security

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.SESSION_COOKIE
import jakarta.servlet.http.Cookie
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.web.util.UriComponents
import org.springframework.web.util.UriComponentsBuilder
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.utility.MountableFile
import tools.jackson.databind.json.JsonMapper
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

/**
 * Sign-in through a real server of OpenID Connect: Keycloak with two realms, `acme` (the provider `corp`, restricted to
 * domains of email and a group, with signing out at the provider) and `partner`. The browser is played by MockMvc for the
 * backend and by an HTTP client for Keycloak; the backend itself exchanges the code and checks the ID token at Keycloak.
 */
@IntegrationTest
class OidcLoginTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
) {

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM users WHERE provider LIKE 'oidc:%'").update()
    }

    @Test
    fun `the first sign-in creates the user of the issuer and the subject with the name of the profile`() {
        val session = signIn("corp", "alice")

        mockMvc.get("/api/me") { cookie(session) }.andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Alice Liddell") }
            jsonPath("$.guest") { value(false) }
        }
        assertEquals(listOf("${issuer("acme")} $ALICE_ACME"), oidcUsers())
    }

    @Test
    fun `a repeated sign-in finds the same user after the address of email and the name changed at the provider`() {
        val first = userId(signIn("corp", "alice"))
        changeUser("acme", ALICE_ACME, """{"firstName": "Alicia", "email": "a.liddell@example.org", "emailVerified": true}""")
        try {
            val again = signIn("corp", "alice")

            assertEquals(first, userId(again))
            mockMvc.get("/api/me") { cookie(again) }.andExpect { jsonPath("$.name") { value("Alicia Liddell") } }
            assertEquals(1, oidcUsers().size)
        } finally {
            changeUser("acme", ALICE_ACME, """{"firstName": "Alice", "email": "alice@example.com", "emailVerified": true}""")
        }
    }

    @Test
    fun `users of another provider are other users`() {
        val acme = userId(signIn("corp", "alice"))
        val partner = userId(signIn("partner", "alice"))

        assertNotEquals(acme, partner)
        assertEquals(setOf("${issuer("acme")} $ALICE_ACME", "${issuer("partner")} $ALICE_PARTNER"), oidcUsers().toSet())
    }

    @Test
    fun `a user that the restrictions of the provider turn away comes back to the login page and is not created`() {
        val authorization = mockMvc.get("/api/oauth2/authorization/corp").andReturn().response
        val callback = signInAtKeycloak(authorization.getHeader("Location")!!, "bob")

        callBack(callback, authorization.getCookie(SESSION_COOKIE)!!.value).andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/login?error=denied")
        }
        assertEquals(emptyList(), oidcUsers())
    }

    @Test
    fun `signing out sends the browser to the end of the session at the provider and back to the login page`() {
        val session = signIn("corp", "alice")

        val logoutUrl = mockMvc.post("/api/logout") { cookie(session); with(csrf()) }.andExpect {
            status { isOk() }
            jsonPath("$.logoutUrl") { value(startsWith("${issuer("acme")}/protocol/openid-connect/logout?")) }
            jsonPath("$.logoutUrl") { value(containsString("post_logout_redirect_uri=http://localhost/login")) }
        }.andReturn().response.contentAsString.let { JsonMapper.builder().build().readTree(it)["logoutUrl"].asString() }
        mockMvc.get("/api/me") { cookie(session) }.andExpect { status { isUnauthorized() } }

        // Keycloak accepts the ID token and the address and comes back to the login page of CoDraw.
        val atKeycloak = browser().send(HttpRequest.newBuilder(URI(logoutUrl)).build(), HttpResponse.BodyHandlers.discarding())
        assertEquals(302, atKeycloak.statusCode())
        assertEquals("http://localhost/login", atKeycloak.headers().firstValue("Location").orElseThrow())
    }

    @Test
    fun `signing out of a provider without signing out at the provider only ends the session of CoDraw`() {
        val session = signIn("partner", "alice")

        mockMvc.post("/api/logout") { cookie(session); with(csrf()) }.andExpect { status { isNoContent() } }
    }

    /** Signs in through [provider] as [username] and returns the cookie of the new session. */
    private fun signIn(provider: String, username: String): Cookie {
        val authorization = mockMvc.get("/api/oauth2/authorization/$provider").andExpect {
            status { is3xxRedirection() }
        }.andReturn().response
        val callback = signInAtKeycloak(authorization.getHeader("Location")!!, username)
        val signedIn = callBack(callback, authorization.getCookie(SESSION_COOKIE)!!.value)
            .andExpect {
                status { is3xxRedirection() }
                redirectedUrl("/")
            }.andReturn().response
        return Cookie(SESSION_COOKIE, signedIn.getCookie(SESSION_COOKIE)!!.value)
    }

    /** Comes back from Keycloak to the backend in the session that started the sign-in. */
    private fun callBack(callback: UriComponents, session: String) = mockMvc.get(callback.path!!) {
        cookie(Cookie(SESSION_COOKIE, session))
        callback.queryParams.forEach { (name, values) -> param(name, *values.map { URLDecoder.decode(it, Charsets.UTF_8) }.toTypedArray()) }
    }

    /** Fills the login form of Keycloak in a new browser and returns the callback with the code. */
    private fun signInAtKeycloak(authorizationUrl: String, username: String): UriComponents {
        val browser = browser()
        val form = browser.send(HttpRequest.newBuilder(URI(authorizationUrl)).build(), HttpResponse.BodyHandlers.ofString())
        assertEquals(200, form.statusCode(), form.body())
        val action = LOGIN_ACTION.find(form.body())!!.groupValues[1].replace("&amp;", "&")
        // Keycloak marks its cookies Secure, which the cookie manager of the JDK keeps off plain HTTP: carry them by hand.
        val cookies = form.headers().allValues("Set-Cookie").joinToString("; ") { it.substringBefore(';') }
        val body = mapOf("username" to username, "password" to username, "credentialId" to "")
            .map { (key, value) -> "$key=${URLEncoder.encode(value, Charsets.UTF_8)}" }.joinToString("&")
        val signedIn = browser.send(
            HttpRequest.newBuilder(URI(action))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Cookie", cookies)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        assertEquals(302, signedIn.statusCode(), signedIn.body())
        return UriComponentsBuilder.fromUriString(signedIn.headers().firstValue("Location").orElseThrow()).build()
    }

    private fun changeUser(realm: String, id: String, json: String) {
        val token = browser().send(
            HttpRequest.newBuilder(URI("${keycloakUrl()}/realms/master/protocol/openid-connect/token"))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString("grant_type=password&client_id=admin-cli&username=admin&password=admin"))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        ).body().let { JsonMapper.builder().build().readTree(it)["access_token"].asString() }
        val changed = browser().send(
            HttpRequest.newBuilder(URI("${keycloakUrl()}/admin/realms/$realm/users/$id"))
                .header("Authorization", "Bearer $token")
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(json))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        assertEquals(204, changed.statusCode(), changed.body())
    }

    private fun userId(session: Cookie): String =
        mockMvc.get("/api/me") { cookie(session) }.andReturn().response.contentAsString
            .let { JsonMapper.builder().build().readTree(it)["id"].asString() }

    private fun oidcUsers(): List<String> =
        jdbcClient.sql("SELECT provider, provider_user_id FROM users WHERE provider LIKE 'oidc:%' ORDER BY created_at")
            .query { rs, _ -> "${rs.getString(1).removePrefix("oidc:")} ${rs.getString(2)}" }
            .list()

    /** A browser of its own for every sign-in: no session of Keycloak carries over. */
    private fun browser(): HttpClient = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NEVER)
        .connectTimeout(Duration.ofSeconds(10))
        .build()

    companion object {
        private const val ALICE_ACME = "6d1f0c4e-0000-4000-8000-00000000a11c"
        private const val ALICE_PARTNER = "6d1f0c4e-0000-4000-8000-0000000a11ce"
        private const val KEYCLOAK_PORT = 8080
        private val LOGIN_ACTION = Regex("""action="([^"]*/login-actions/authenticate[^"]*)"""")

        private val keycloak: GenericContainer<*> by lazy {
            GenericContainer("keycloak/keycloak:26.3.3")
                .withCommand("start-dev", "--import-realm")
                .withEnv("KC_BOOTSTRAP_ADMIN_USERNAME", "admin")
                .withEnv("KC_BOOTSTRAP_ADMIN_PASSWORD", "admin")
                .withCopyFileToContainer(MountableFile.forClasspathResource("keycloak/acme-realm.json"), "/opt/keycloak/data/import/acme-realm.json")
                .withCopyFileToContainer(MountableFile.forClasspathResource("keycloak/partner-realm.json"), "/opt/keycloak/data/import/partner-realm.json")
                .withExposedPorts(KEYCLOAK_PORT)
                .waitingFor(
                    Wait.forHttp("/realms/partner/.well-known/openid-configuration")
                        .forPort(KEYCLOAK_PORT)
                        .withStartupTimeout(Duration.ofMinutes(3)),
                )
                .apply { start() }
        }

        private fun keycloakUrl() = "http://${keycloak.host}:${keycloak.getMappedPort(KEYCLOAK_PORT)}"

        private fun issuer(realm: String) = "${keycloakUrl()}/realms/$realm"

        @JvmStatic
        @DynamicPropertySource
        fun providers(registry: DynamicPropertyRegistry) {
            registry.add("codraw.auth.oidc.corp.issuer-uri") { issuer("acme") }
            registry.add("codraw.auth.oidc.corp.client-id") { "codraw" }
            registry.add("codraw.auth.oidc.corp.client-secret") { "codraw-secret" }
            registry.add("codraw.auth.oidc.corp.name") { "Keycloak компании" }
            registry.add("codraw.auth.oidc.corp.allowed-email-domains") { "example.com,example.org" }
            registry.add("codraw.auth.oidc.corp.allowed-groups") { "codraw-users" }
            registry.add("codraw.auth.oidc.corp.logout") { "true" }
            registry.add("codraw.auth.oidc.partner.issuer-uri") { issuer("partner") }
            registry.add("codraw.auth.oidc.partner.client-id") { "codraw" }
            registry.add("codraw.auth.oidc.partner.client-secret") { "codraw-secret" }
        }
    }
}
