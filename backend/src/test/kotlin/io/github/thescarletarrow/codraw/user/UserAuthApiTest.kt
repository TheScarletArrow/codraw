package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.SESSION_COOKIE
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import jakarta.servlet.http.Cookie
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.matchesPattern
import org.hamcrest.Matchers.nullValue
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.json.JsonCompareMode
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.web.util.UriComponentsBuilder
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Sign-in and access to the API. Session and CSRF cookies are covered by `SessionCookieTest` over real HTTP. */
@IntegrationTest
class UserAuthApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
) {

    private lateinit var alice: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
    }

    @ParameterizedTest
    @ValueSource(strings = ["/api/boards", "/api/me", "/api/boards/0199a000-0000-7000-8000-000000000000"])
    fun `answers 401 instead of redirecting to API requests without a session`(path: String) {
        mockMvc.get(path).andExpect {
            status { isUnauthorized() }
            header { doesNotExist("Location") }
        }
    }

    @Test
    fun `returns the profile of the signed-in user`() {
        mockMvc.get("/api/me") { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(alice.id.toString()) }
            jsonPath("$.name") { value("Alice") }
            jsonPath("$.avatarUrl") { value("https://avatars.example.com/Alice.png") }
            jsonPath("$.guest") { value(false) }
            jsonPath("$.language") { value("ru") }
        }
    }

    @Test
    fun `remembers the language of the interface of the user`() {
        // A user of its own: users sign in again in every test and keep their language, and other tests read letters in Russian.
        val polyglot = users.gitHubUser("Polyglot")
        mockMvc.put("/api/me/language") {
            with(polyglot.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"language": "en"}"""
        }.andExpect { status { isNoContent() } }

        mockMvc.get("/api/me") { with(polyglot.session()) }.andExpect { jsonPath("$.language") { value("en") } }
        assertEquals(Language.EN, users.find(polyglot.id)!!.language)
        mockMvc.put("/api/me/language") {
            with(polyglot.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"language": "de"}"""
        }.andExpect { status { isBadRequest() } }
        assertEquals(Language.EN, users.find(polyglot.id)!!.language)
    }

    @Test
    fun `names a new guest in the language of the browser`() {
        mockMvc.post("/api/guest") {
            with(csrf())
            header("Accept-Language", "en-GB,en;q=0.9")
        }.andExpect { status { isNoContent() } }

        // Other tests create guests too, all of them Russian.
        val guest = jdbcClient.sql("SELECT name, language FROM users WHERE provider = 'guest' AND name LIKE 'Guest %'")
            .query { rs, _ -> rs.getString("name") to rs.getString("language") }.single()
        assertTrue(guest.first.matches(Regex("Guest \\d{1,3}")), guest.first)
        assertEquals("EN", guest.second)
    }

    @Test
    fun `a guest works with boards like a signed-in user`() {
        val guest = users.createGuest()
        mockMvc.get("/api/me") { with(guest.session()) }.andExpect {
            jsonPath("$.name") { value(matchesPattern("Гость \\d{1,3}")) }
            jsonPath("$.avatarUrl") { value(nullValue()) }
            jsonPath("$.guest") { value(true) }
        }
        val board = mockMvc.post("/api/boards") {
            with(guest.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Гостевая"}"""
        }.andExpect { status { isCreated() } }.andReturn().response.getHeader("Location")!!

        mockMvc.get("/api/boards") { with(guest.session()) }.andExpect { jsonPath("$[*].title") { value(contains("Гостевая")) } }
        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect { content { json("[]") } }
        mockMvc.get(board) { with(alice.session()) }.andExpect { status { isOk() } }
        mockMvc.post("$board/collab-token") {
            with(guest.session())
            with(csrf())
        }.andExpect { status { isOk() } }
    }

    @Test
    fun `rejects changes without a CSRF token`() {
        mockMvc.post("/api/boards") {
            with(alice.session())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Без токена"}"""
        }.andExpect { status { isForbidden() } }

        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM boards").query(Int::class.java).single())
    }

    @Test
    fun `offers the ways to sign in of the installation without a sign-in`() {
        mockMvc.get("/api/auth/providers").andExpect {
            status { isOk() }
            content {
                json(
                    """{"providers": [{"id": "github", "name": "GitHub"}, {"id": "google", "name": "Google"}], "guests": true}""",
                    JsonCompareMode.STRICT,
                )
            }
        }
    }

    @Test
    fun `starts the sign-in with GitHub`() {
        mockMvc.get("/api/oauth2/authorization/github").andExpect {
            status { is3xxRedirection() }
            header { string("Location", startsWith("https://github.com/login/oauth/authorize?")) }
            header { string("Location", containsString("client_id=test-github-client")) }
            header {
                string("Location", containsString("redirect_uri=http://localhost/api/login/oauth2/code/github"))
            }
        }
    }

    @Test
    fun `starts the sign-in with Google, asking for the profile only`() {
        mockMvc.get("/api/oauth2/authorization/google").andExpect {
            status { is3xxRedirection() }
            header { string("Location", startsWith("https://accounts.google.com/o/oauth2/v2/auth?")) }
            header { string("Location", containsString("scope=profile&")) }
            header {
                string("Location", containsString("redirect_uri=http://localhost/api/login/oauth2/code/google"))
            }
        }
    }

    @Test
    fun `returns to the login page with an error when the user cancels at the provider`() {
        val started = mockMvc.get("/api/oauth2/authorization/github").andReturn().response
        val session = Cookie(SESSION_COOKIE, started.getCookie(SESSION_COOKIE)!!.value)
        val state = UriComponentsBuilder.fromUriString(started.getHeader("Location")!!).build().queryParams.getFirst("state")

        mockMvc.get("/api/login/oauth2/code/github") {
            cookie(session)
            param("error", "access_denied")
            param("state", state!!)
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/login?error")
        }
    }
}
