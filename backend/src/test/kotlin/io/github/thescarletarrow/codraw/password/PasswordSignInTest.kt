package io.github.thescarletarrow.codraw.password

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.SESSION_COOKIE
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import jakarta.servlet.http.Cookie
import org.hamcrest.Matchers.containsInAnyOrder
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.request.RequestPostProcessor
import java.time.Duration
import java.util.Base64
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/** Registration, sign-in and the change of passwords, against the database, with small limits. */
@IntegrationTest
@TestPropertySource(
    properties = [
        "codraw.passwords.enabled=true",
        "codraw.limits.password-failures-per-address-per-hour=5",
        "codraw.limits.password-failures-per-login-per-hour=3",
        "codraw.limits.sign-ups-per-address-per-hour=4",
    ],
)
class PasswordSignInTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val clock: MutableClock,
) {

    @BeforeEach
    fun startAfresh() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM users WHERE provider IN ('password', 'guest')").update()
        // New windows of the limits, which count in memory: every test starts with none of its attempts counted.
        clock.advance(Duration.ofHours(2))
    }

    @Test
    fun `registers an account, named by its login as typed, and signs in to it`() {
        val session = signUp("Alice", "correct horse").andExpect { status { isNoContent() } }.session()

        mockMvc.get("/api/me") { cookie(session) }.andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Alice") }
            jsonPath("$.guest") { value(false) }
            jsonPath("$.password") { value(true) }
            jsonPath("$.avatarUrl") { value(null) }
        }
        val stored = jdbcClient.sql(
            "SELECT u.provider_user_id, c.password_hash FROM users u JOIN password_credentials c ON c.user_id = u.id",
        ).query { rs, _ -> rs.getString(1) to rs.getString(2) }.single()
        assertEquals("alice", stored.first)
        assertTrue(stored.second.startsWith("{bcrypt}$2"), "the hash names its algorithm")
    }

    @Test
    fun `refuses a login that is taken, whatever its case`() {
        signUp("alice", "correct horse").andExpect { status { isNoContent() } }

        signUp("ALICE", "another horse").andExpect {
            status { isConflict() }
            jsonPath("$.reason") { value("login-taken") }
        }
        assertEquals(1, passwordUsers())
    }

    @Test
    fun `refuses a login and a password against the rules, naming the rule`() {
        signUp("алиса", "correct horse").andExpect { jsonPath("$.reason") { value("login-invalid") } }
        signUp("alice", "1234567").andExpect {
            status { isBadRequest() }
            jsonPath("$.reason") { value("password-short") }
        }
        signUp("alice", "я".repeat(37)).andExpect { jsonPath("$.reason") { value("password-long") } }
        signUp("bob.smith", "Bob.Smith").andExpect { jsonPath("$.reason") { value("password-login") } }
        assertEquals(0, passwordUsers())
    }

    @Test
    fun `keeps the login of an administrator for the administrator`() {
        signUp(IntegrationTest.RESERVED_LOGIN.uppercase(), "correct horse").andExpect {
            status { isForbidden() }
            jsonPath("$.reason") { value("login-reserved") }
        }
        assertEquals(0, passwordUsers())
    }

    @Test
    fun `signs in with the login in any case and the password`() {
        signUp("Alice", "correct horse")

        val session = signIn("aLiCe", "correct horse").andExpect { status { isNoContent() } }.session()

        mockMvc.get("/api/me") { cookie(session) }.andExpect { jsonPath("$.name") { value("Alice") } }
    }

    @Test
    fun `answers a wrong password and an unknown login alike`() {
        signUp("alice", "correct horse")

        val wrongPassword = signIn("alice", "wrong horse").andExpect { status { isUnauthorized() } }.andReturn().response
        val unknownLogin = signIn("nobody", "correct horse").andExpect { status { isUnauthorized() } }.andReturn().response

        assertEquals(wrongPassword.contentAsString, unknownLogin.contentAsString)
        assertTrue(wrongPassword.contentAsString.contains("invalid-credentials"))
    }

    @Test
    fun `refuses a blocked user with the right password only`() {
        signUp("alice", "correct horse")
        jdbcClient.sql("UPDATE users SET blocked_at = now() WHERE provider = 'password'").update()

        signIn("alice", "correct horse").andExpect {
            status { isForbidden() }
            jsonPath("$.reason") { value("blocked") }
        }
        signIn("alice", "wrong horse").andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `gives the boards of a guest to the account the guest registers`() {
        val guest = users.createGuest()
        createBoard(guest, "Доска гостя")

        val session = signUp("alice", "correct horse", guest.session()).session()

        mockMvc.get("/api/boards") { cookie(session) }.andExpect { jsonPath("$[*].title") { value(containsInAnyOrder("Доска гостя")) } }
    }

    @Test
    fun `gives the boards of a guest to the account the guest signs in to`() {
        val account = signUp("alice", "correct horse").session()
        createBoard(account, "Доска Алисы")
        val guest = users.createGuest()
        createBoard(guest, "Доска гостя")

        val session = signIn("alice", "correct horse", guest.session()).session()

        mockMvc.get("/api/boards") { cookie(session) }.andExpect {
            jsonPath("$[*].title") { value(containsInAnyOrder("Доска Алисы", "Доска гостя")) }
        }
    }

    @Test
    fun `stops the attempts at a login that failed as often as the limit, even with the right password`() {
        signUp("alice", "correct horse")
        repeat(3) { signIn("alice", "wrong horse").andExpect { status { isUnauthorized() } } }

        signIn("alice", "correct horse").andExpect {
            status { isTooManyRequests() }
            header { string("Retry-After", "3600") }
        }
        signUp("bob", "correct horse")
        signIn("bob", "correct horse").andExpect { status { isNoContent() } }
    }

    @Test
    fun `stops the attempts from an address that failed as often as the limit`() {
        repeat(5) { signIn("nobody-$it", "wrong horse").andExpect { status { isUnauthorized() } } }

        signIn("somebody", "wrong horse").andExpect { status { isTooManyRequests() } }
        signIn("somebody", "wrong horse", from("198.51.100.7")).andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `does not count successful sign-ins`() {
        signUp("alice", "correct horse")

        repeat(8) { signIn("alice", "correct horse").andExpect { status { isNoContent() } } }
    }

    @Test
    fun `stops registrations from an address beyond the limit`() {
        repeat(4) { signUp("user$it", "correct horse").andExpect { status { isNoContent() } } }

        signUp("user4", "correct horse").andExpect {
            status { isTooManyRequests() }
            header { exists("Retry-After") }
        }
        assertEquals(4, passwordUsers())
        signUp("user4", "correct horse", from("198.51.100.7")).andExpect { status { isNoContent() } }
    }

    @Test
    fun `changes the password and ends the other sessions of the user`() {
        val laptop = signUp("alice", "correct horse").session()
        val phone = signIn("alice", "correct horse").session()

        changePassword(laptop, "correct horse", "battery staple").andExpect { status { isNoContent() } }

        mockMvc.get("/api/me") { cookie(laptop) }.andExpect { status { isOk() } }
        mockMvc.get("/api/me") { cookie(phone) }.andExpect { status { isUnauthorized() } }
        signIn("alice", "correct horse").andExpect { status { isUnauthorized() } }
        signIn("alice", "battery staple").andExpect { status { isNoContent() } }
    }

    @Test
    fun `keeps the password when the current one is wrong or the new one breaks the rules`() {
        val session = signUp("alice", "correct horse").session()

        changePassword(session, "wrong horse", "battery staple").andExpect {
            status { isBadRequest() }
            jsonPath("$.reason") { value("wrong-password") }
        }
        changePassword(session, "correct horse", "short").andExpect { jsonPath("$.reason") { value("password-short") } }
        signIn("alice", "correct horse").andExpect { status { isNoContent() } }
    }

    @Test
    fun `changes no password of a user who signs in through a provider`() {
        val bob = users.gitHubUser("Bob")

        mockMvc.put(PasswordController.CHANGE_PATH) {
            with(bob.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentPassword": "anything", "newPassword": "battery staple"}"""
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.reason") { value("no-password") }
        }
        mockMvc.get("/api/me") { with(bob.session()) }.andExpect { jsonPath("$.password") { value(false) } }
    }

    @Test
    fun `deletes the password with the account, and the login is free again`() {
        val first = signUp("alice", "correct horse").session()
        val firstId = mockMvc.get("/api/me") { cookie(first) }.andReturn().response.contentAsString.let(::idOf)

        jdbcClient.sql("DELETE FROM users WHERE id = :id").param("id", firstId).update()

        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM password_credentials").query(Int::class.java).single())
        val second = signUp("alice", "another horse").andExpect { status { isNoContent() } }.session()
        val secondId = mockMvc.get("/api/me") { cookie(second) }.andReturn().response.contentAsString.let(::idOf)
        assertNotEquals(firstId, secondId)
    }

    @Test
    fun `offers the sign-in with a password and registration`() {
        mockMvc.get("/api/auth/providers").andExpect { jsonPath("$.password.signUp") { value(true) } }
        mockMvc.get("/api/legal").andExpect { jsonPath("$.passwords") { value(true) } }
    }

    @Test
    fun `starts a session of the usual lifetime after a guest's`() {
        val guest = mockMvc.post("/api/guest") { with(csrf()) }.andReturn().response.getCookie(SESSION_COOKIE)!!

        val session = signUp("alice", "correct horse") { it.setCookies(Cookie(SESSION_COOKIE, guest.value)); it }
            .andExpect { status { isNoContent() } }.session()

        assertNotEquals(guest.value, session.value, "a new id of the session against its fixation")
        // Spring Session sends the session id Base64-encoded.
        val maxInactive = jdbcClient.sql("SELECT max_inactive_interval FROM spring_session WHERE session_id = :id")
            .param("id", String(Base64.getDecoder().decode(session.value)))
            .query(Int::class.java).single()
        assertTrue(maxInactive < Duration.ofDays(30).toSeconds(), "not the lifetime of a guest session")
    }

    private fun signUp(login: String, password: String, as_: RequestPostProcessor? = null) =
        post(PasswordController.SIGN_UP_PATH, """{"login": "$login", "password": "$password"}""", as_)

    private fun signIn(login: String, password: String, as_: RequestPostProcessor? = null) =
        post(PasswordController.SIGN_IN_PATH, """{"login": "$login", "password": "$password"}""", as_)

    private fun post(path: String, body: String, as_: RequestPostProcessor?) = mockMvc.post(path) {
        as_?.let { with(it) }
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private fun changePassword(session: Cookie, current: String, new: String) = mockMvc.put(PasswordController.CHANGE_PATH) {
        cookie(session)
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"currentPassword": "$current", "newPassword": "$new"}"""
    }

    private fun createBoard(owner: User, title: String) = createBoard(owner.session(), title)

    private fun createBoard(session: Cookie, title: String) = createBoard({ it.setCookies(session); it }, title)

    private fun createBoard(as_: RequestPostProcessor, title: String) {
        mockMvc.post("/api/boards") {
            with(as_)
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "$title"}"""
        }.andExpect { status { isCreated() } }
    }

    private fun from(address: String) = RequestPostProcessor { it.remoteAddr = address; it }

    private fun ResultActionsDsl.session(): Cookie =
        Cookie(SESSION_COOKIE, andReturn().response.getCookie(SESSION_COOKIE)!!.value)

    private fun passwordUsers() =
        jdbcClient.sql("SELECT count(*) FROM users WHERE provider = 'password'").query(Int::class.java).single()

    private fun idOf(me: String): UUID = UUID.fromString(Regex(""""id"\s*:\s*"([^"]+)"""").find(me)!!.groupValues[1])
}
