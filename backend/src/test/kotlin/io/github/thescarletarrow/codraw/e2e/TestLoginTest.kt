package io.github.thescarletarrow.codraw.e2e

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.SESSION_COOKIE
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.notification.Email
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.UserService
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.ApplicationContext
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TestLoginTest {

    @Nested
    @IntegrationTest
    inner class DefaultProfile(
        @Autowired private val mockMvc: MockMvc,
        @Autowired private val jdbcClient: JdbcClient,
        @Autowired private val context: ApplicationContext,
        @Autowired private val users: UserService,
    ) {

        @Test
        fun `has no test login`() {
            assertTrue(context.getBeanNamesForType(TestLoginController::class.java).isEmpty())

            mockMvc.post(TestLoginController.PATH) {
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name": "Mallory"}"""
            }.andExpect {
                status { isUnauthorized() }
                cookie { doesNotExist(SESSION_COOKIE) }
            }
            mockMvc.post(TestLoginController.PATH) {
                with(users.gitHubUser("Alice").session())
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name": "Mallory"}"""
            }.andExpect { status { isNotFound() } }

            val testUsers = jdbcClient.sql("SELECT count(*) FROM users WHERE provider = 'e2e'").query(Int::class.java).single()
            assertEquals(0, testUsers)
        }

        @Test
        fun `gives letters to nobody`() {
            assertTrue(context.getBeanNamesForType(TestEmailController::class.java).isEmpty())
            mockMvc.get(TestEmailController.PATH) { param("to", "bob@example.com") }.andExpect { status { isUnauthorized() } }
        }
    }

    @Nested
    @IntegrationTest
    @ActiveProfiles("e2e")
    inner class E2eProfile(
        @Autowired private val mockMvc: MockMvc,
        @Autowired private val letters: RecordingEmailTransport,
    ) {

        @Test
        fun `keeps letters in memory and gives them to the tests without a sign-in`() {
            letters.send(Email("bob@example.com", "Тема", "Текст", "https://codraw.example.com/settings/notifications"))

            mockMvc.get(TestEmailController.PATH) { param("to", "BOB@example.com") }.andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(1) }
                jsonPath("$[0].subject") { value("Тема") }
                jsonPath("$[0].text") { value("Текст") }
            }
            mockMvc.get(TestEmailController.PATH) { param("to", "carol@example.com") }.andExpect {
                jsonPath("$.length()") { value(0) }
            }
        }

        @Test
        fun `signs in as the named test user without CSRF token`() {
            val response = mockMvc.post(TestLoginController.PATH) {
                contentType = MediaType.APPLICATION_JSON
                content = """{"name": "Алиса"}"""
            }.andExpect { status { isNoContent() } }.andReturn().response
            val session = Cookie(SESSION_COOKIE, response.getCookie(SESSION_COOKIE)!!.value)

            mockMvc.get("/api/me") { cookie(session) }.andExpect {
                status { isOk() }
                jsonPath("$.name") { value("Алиса") }
            }
        }

        @Test
        fun `rejects a blank name`() {
            mockMvc.post(TestLoginController.PATH) {
                contentType = MediaType.APPLICATION_JSON
                content = """{"name": " "}"""
            }.andExpect { status { isBadRequest() } }
        }
    }
}
