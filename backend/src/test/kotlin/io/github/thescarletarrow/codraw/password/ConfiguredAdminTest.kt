package io.github.thescarletarrow.codraw.password

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.SESSION_COOKIE
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import kotlin.test.assertEquals

/** The administrator of `CODRAW_ADMIN_LOGIN` and `CODRAW_ADMIN_PASSWORD`, without the sign-in with a password for others. */
@IntegrationTest
@TestPropertySource(properties = ["codraw.admin.login=Boss", "codraw.admin.password=correct horse"])
class ConfiguredAdminTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val configuredAdmin: ConfiguredAdmin,
) {

    @BeforeEach
    fun likeAtStart() {
        configuredAdmin.ensure()
    }

    @Test
    fun `makes the account at start, an administrator who signs in with the password of the settings`() {
        val session = signIn("boss", "correct horse")

        mockMvc.get("/api/me") { cookie(session) }.andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Boss") }
            jsonPath("$.admin") { value(true) }
            jsonPath("$.password") { value(true) }
            jsonPath("$.passwordFromSettings") { value(true) }
        }
        assertEquals(1, jdbcClient.sql("SELECT count(*) FROM users WHERE provider = 'password'").query(Int::class.java).single())
    }

    @Test
    fun `offers the sign-in with a password to the administrator, and no registration`() {
        mockMvc.get("/api/auth/providers").andExpect { jsonPath("$.password.signUp") { value(false) } }
        mockMvc.post(PasswordController.SIGN_UP_PATH) {
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"login": "alice", "password": "correct horse"}"""
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.reason") { value("sign-up-off") }
        }
        mockMvc.get("/api/legal").andExpect { jsonPath("$.passwords") { value(true) } }
    }

    @Test
    fun `changes the password of the administrator only through the settings`() {
        val session = signIn("boss", "correct horse")

        mockMvc.put(PasswordController.CHANGE_PATH) {
            cookie(session)
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentPassword": "correct horse", "newPassword": "battery staple"}"""
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.reason") { value("password-from-settings") }
        }
    }

    @Test
    fun `brings the password of the settings back at start, ending the sessions, and lifts a block`() {
        val session = signIn("boss", "correct horse")
        jdbcClient.sql("UPDATE password_credentials SET password_hash = :hash")
            .param("hash", "{bcrypt}" + BCryptPasswordEncoder().encode("another horse"))
            .update()
        jdbcClient.sql("UPDATE users SET blocked_at = now() WHERE provider = 'password'").update()

        configuredAdmin.ensure()

        mockMvc.get("/api/me") { cookie(session) }.andExpect { status { isUnauthorized() } }
        signIn("boss", "correct horse")
    }

    private fun signIn(login: String, password: String): Cookie {
        val response = mockMvc.post(PasswordController.SIGN_IN_PATH) {
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"login": "$login", "password": "$password"}"""
        }.andExpect { status { isNoContent() } }.andReturn().response
        return Cookie(SESSION_COOKIE, response.getCookie(SESSION_COOKIE)!!.value)
    }
}
