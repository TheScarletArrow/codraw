package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.e2e.RecordingEmailTransport
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.UserService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** An installation that did not tell the address of its app: letters and chats would have nothing to link to. */
@IntegrationTest
@TestPropertySource(properties = ["codraw.notifications.app-url=", "codraw.notifications.webhook.allowed-hosts="])
class NotificationChannelsUnavailableApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val users: UserService,
    @Autowired private val letters: RecordingEmailTransport,
    @Autowired private val smtp: SmtpEmailTransport,
) {

    @Test
    fun `the settings say that neither channel works, and channels cannot be set`() {
        val alice = users.gitHubUser("Alice")

        mockMvc.get(NotificationSettingsController.PATH) { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.email.available") { value(false) }
            jsonPath("$.webhook.available") { value(false) }
            jsonPath("$.webhook.hosts.length()") { value(0) }
        }
        mockMvc.put("${NotificationSettingsController.PATH}/email") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"address": "alice@example.com"}"""
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.reason") { value("channel-unavailable") }
        }
        mockMvc.put("${NotificationSettingsController.PATH}/webhook") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"url": "https://hooks.slack.com/services/T1/B2/abc"}"""
        }.andExpect { status { isNotFound() } }
        assertTrue(letters.lettersTo("alice@example.com").isEmpty())
    }

    @Test
    fun `letters need an SMTP server, which the tests do not set`() {
        assertFalse(smtp.available)
    }
}
