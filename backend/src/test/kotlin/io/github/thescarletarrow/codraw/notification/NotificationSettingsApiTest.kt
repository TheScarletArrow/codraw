package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.e2e.RecordingEmailTransport
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.not
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@IntegrationTest
class NotificationSettingsApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val letters: RecordingEmailTransport,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var carol: User
    private val webhook = TestWebhook()

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM notification_channels").update()
        letters.clear()
        // Each test is a new hour for the limit of letters, which counts in memory.
        clock.advance(Duration.ofHours(2))
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
    }

    @AfterEach
    fun stopWebhook() = webhook.close()

    @Test
    fun `the settings tell which channels the installation has, and a new user has none`() {
        settings(bob).andExpect {
            status { isOk() }
            jsonPath("$.email.available") { value(true) }
            jsonPath("$.email.channel") { value(nullValue()) }
            jsonPath("$.webhook.available") { value(true) }
            jsonPath("$.webhook.hosts[0]") { value("hooks.slack.com") }
            jsonPath("$.webhook.hosts[1]") { value("localhost") }
            jsonPath("$.webhook.channel") { value(nullValue()) }
            jsonPath("$.mutedBoards.length()") { value(0) }
        }
    }

    @Test
    fun `a guest has no channels`() {
        val guest = users.createGuest()

        settings(guest).andExpect {
            status { isForbidden() }
            jsonPath("$.reason") { value("guest") }
        }
        saveEmail(guest, "guest@example.com").andExpect { status { isForbidden() } }
        saveWebhook(guest, webhook.url).andExpect { status { isForbidden() } }
        assertTrue(letters.lettersTo("guest@example.com").isEmpty())
    }

    @Test
    fun `a new address gets a letter with a link, which confirms it once and only for its owner`() {
        saveEmail(bob, " bob@example.com ", events = listOf("mentions", "access")).andExpect {
            status { isOk() }
            jsonPath("$.address") { value("bob@example.com") }
            jsonPath("$.verified") { value(false) }
            jsonPath("$.verificationSentAt") { value(clock.instant().toString()) }
            jsonPath("$.enabled") { value(true) }
            jsonPath("$.events[0]") { value("mentions") }
            jsonPath("$.events[1]") { value("access") }
            jsonPath("$.events.length()") { value(2) }
        }
        val letter = letters.lettersTo("bob@example.com").single()
        assertEquals("Подтвердите адрес для уведомлений CoDraw", letter.subject)
        assertEquals("https://codraw.example.com/settings/notifications", letter.unsubscribeUrl)
        val token = tokenOf(letter)

        confirm(carol, token).andExpect {
            status { isBadRequest() }
            jsonPath("$.reason") { value("invalid-token") }
        }
        confirm(bob, "not-the-token").andExpect { status { isBadRequest() } }
        confirm(bob, token).andExpect { status { isNoContent() } }
        confirm(bob, token).andExpect { status { isBadRequest() } }

        settings(bob).andExpect {
            jsonPath("$.email.channel.address") { value("bob@example.com") }
            jsonPath("$.email.channel.verified") { value(true) }
        }
    }

    @Test
    fun `the link works for a day`() {
        saveEmail(bob, "bob@example.com")
        val token = tokenOf(letters.lettersTo("bob@example.com").single())

        clock.advance(Duration.ofDays(1).plusSeconds(1))

        confirm(bob, token).andExpect { status { isBadRequest() } }
    }

    @Test
    fun `the same address keeps its confirmation, another one needs a new one`() {
        confirmedEmail(bob, "bob@example.com")

        saveEmail(bob, "BOB@example.com", enabled = false, events = listOf("reviews")).andExpect {
            status { isOk() }
            jsonPath("$.address") { value("bob@example.com") }
            jsonPath("$.verified") { value(true) }
            jsonPath("$.enabled") { value(false) }
            jsonPath("$.events[0]") { value("reviews") }
        }
        assertEquals(1, letters.lettersTo("bob@example.com").size)

        saveEmail(bob, "robert@example.com").andExpect {
            jsonPath("$.address") { value("robert@example.com") }
            jsonPath("$.verified") { value(false) }
        }
        assertEquals(1, letters.lettersTo("robert@example.com").size)
    }

    @Test
    fun `an address that is not one is refused, and so is a group of events nobody knows`() {
        for (address in listOf("bob", "bob@", "Bob <bob@example.com>", "bob@example.com, eve@example.com", "a".repeat(250) + "@x.io")) {
            saveEmail(bob, address).andExpect {
                status { isBadRequest() }
                jsonPath("$.reason") { value("invalid-address") }
            }
        }
        saveEmail(bob, "bob@example.com", events = listOf("likes")).andExpect { status { isBadRequest() } }
        assertTrue(letters.lettersTo("bob@example.com").isEmpty())
    }

    @Test
    fun `a letter goes again with a new link, at most five letters an hour`() {
        saveEmail(bob, "bob@example.com")
        val first = tokenOf(letters.lettersTo("bob@example.com").single())

        resend(bob).andExpect {
            status { isOk() }
            jsonPath("$.verified") { value(false) }
        }
        val second = tokenOf(letters.lettersTo("bob@example.com").last())
        confirm(bob, first).andExpect { status { isBadRequest() } }

        resend(bob).andExpect { status { isOk() } }
        resend(bob).andExpect { status { isOk() } }
        resend(bob).andExpect { status { isOk() } }
        resend(bob).andExpect {
            status { isTooManyRequests() }
            header { exists("Retry-After") }
            jsonPath("$.reason") { value("confirmation-limit") }
        }
        saveEmail(bob, "robert@example.com").andExpect { status { isTooManyRequests() } }
        assertEquals(5, letters.lettersTo("bob@example.com").size)
        settings(bob).andExpect { jsonPath("$.email.channel.address") { value("bob@example.com") } }
        // The earlier link no longer works, the last one does.
        confirm(bob, second).andExpect { status { isBadRequest() } }
        confirm(bob, tokenOf(letters.lettersTo("bob@example.com").last())).andExpect { status { isNoContent() } }

        resend(bob).andExpect { status { isNotFound() } }
    }

    @Test
    fun `a webhook goes only to an allowed host over https, and its address never comes back`() {
        for ((url, reason) in listOf(
            "https://evil.example.com/hook" to "host-not-allowed",
            "ftp://hooks.slack.com/services/T1/B2/abc" to "invalid-url",
            "https://user:pass@hooks.slack.com/services/T1/B2/abc" to "invalid-url",
            "hooks.slack.com/services" to "invalid-url",
            "https://hooks.slack.com/" + "a".repeat(2048) to "invalid-url",
        )) {
            saveWebhook(bob, url).andExpect {
                status { isBadRequest() }
                jsonPath("$.reason") { value(reason) }
            }
        }

        saveWebhook(bob, "https://hooks.slack.com/services/T1/B2/abcd1234", events = listOf("mentions")).andExpect {
            status { isOk() }
            jsonPath("$.addressHint") { value("https://hooks.slack.com/…1234") }
            jsonPath("$.events[0]") { value("mentions") }
            content { string(not(containsString("abcd1234"))) }
        }
        settings(bob).andExpect {
            jsonPath("$.webhook.channel.addressHint") { value("https://hooks.slack.com/…1234") }
            jsonPath("$.webhook.channel.enabled") { value(true) }
            content { string(not(containsString("abcd1234"))) }
        }

        // Without a new address the saved one stays.
        saveWebhook(bob, null, enabled = false).andExpect {
            status { isOk() }
            jsonPath("$.addressHint") { value("https://hooks.slack.com/…1234") }
            jsonPath("$.enabled") { value(false) }
        }
        saveWebhook(carol, null).andExpect {
            status { isBadRequest() }
            jsonPath("$.reason") { value("invalid-url") }
        }
    }

    @Test
    fun `a test message goes to the webhook, and a refusal shows on the channel`() {
        saveWebhook(bob, webhook.url).andExpect { status { isOk() } }

        testWebhook(bob).andExpect { status { isNoContent() } }
        assertTrue(webhook.bodies.single().contains("CoDraw: уведомления будут приходить сюда"))
        settings(bob).andExpect {
            jsonPath("$.webhook.channel.lastDeliveredAt") { value(clock.instant().toString()) }
            jsonPath("$.webhook.channel.lastError") { value(nullValue()) }
        }

        webhook.answer(404)
        testWebhook(bob).andExpect {
            status { isBadGateway() }
            jsonPath("$.reason") { value("rejected") }
        }
        webhook.answer(503)
        testWebhook(bob).andExpect { jsonPath("$.reason") { value("unavailable") } }
        settings(bob).andExpect {
            jsonPath("$.webhook.channel.lastError") { value("unavailable") }
            jsonPath("$.webhook.channel.lastErrorAt") { value(clock.instant().toString()) }
        }

        testWebhook(carol).andExpect { status { isNotFound() } }
    }

    @Test
    fun `a deleted channel is gone, and deleting it again changes nothing`() {
        confirmedEmail(bob, "bob@example.com")
        saveWebhook(bob, webhook.url)

        delete(bob, "email").andExpect { status { isNoContent() } }
        delete(bob, "email").andExpect { status { isNoContent() } }
        delete(bob, "sms").andExpect { status { isNotFound() } }

        settings(bob).andExpect {
            jsonPath("$.email.channel") { value(nullValue()) }
            jsonPath("$.webhook.channel.enabled") { value(true) }
        }
    }

    @Test
    fun `a user mutes a board they may open, sees it among the muted ones, and unmutes it`() {
        val board = createBoard(alice, "Схема БД")
        val closed = createBoard(alice, "Закрытая")
        setLinkAccess(closed, "none")

        mute(bob, board).andExpect { status { isNoContent() } }
        mute(bob, board).andExpect { status { isNoContent() } }
        mute(bob, closed).andExpect { status { isForbidden() } }
        mute(bob, "00000000-0000-7000-8000-000000000000").andExpect { status { isNotFound() } }

        settings(bob).andExpect {
            jsonPath("$.mutedBoards.length()") { value(1) }
            jsonPath("$.mutedBoards[0].boardId") { value(board) }
            jsonPath("$.mutedBoards[0].boardTitle") { value("Схема БД") }
            jsonPath("$.mutedBoards[0].mutedAt") { value(clock.instant().toString()) }
        }

        // A board the user can no longer open stays in the list without its title.
        setLinkAccess(board, "none")
        settings(bob).andExpect { jsonPath("$.mutedBoards[0].boardTitle") { value(nullValue()) } }

        unmute(bob, board).andExpect { status { isNoContent() } }
        unmute(bob, board).andExpect { status { isNoContent() } }
        unmute(bob, "not-a-board").andExpect { status { isNoContent() } }
        settings(bob).andExpect { jsonPath("$.mutedBoards.length()") { value(0) } }
    }

    @Test
    fun `settings need a sign-in and the CSRF token`() {
        mockMvc.get(NotificationSettingsController.PATH).andExpect { status { isUnauthorized() } }
        mockMvc.put("${NotificationSettingsController.PATH}/email") {
            with(bob.session())
            contentType = MediaType.APPLICATION_JSON
            content = """{"address": "bob@example.com"}"""
        }.andExpect { status { isForbidden() } }
        assertFalse(letters.lettersTo("bob@example.com").isNotEmpty())
    }

    private fun confirmedEmail(user: User, address: String) {
        saveEmail(user, address).andExpect { status { isOk() } }
        confirm(user, tokenOf(letters.lettersTo(address).last())).andExpect { status { isNoContent() } }
    }

    private fun tokenOf(letter: Email): String =
        Regex("""settings/notifications\?confirm=([A-Za-z0-9_-]+)""").find(letter.text)!!.groupValues[1]

    private fun settings(user: User): ResultActionsDsl = mockMvc.get(NotificationSettingsController.PATH) { with(user.session()) }

    private fun saveEmail(
        user: User,
        address: String,
        enabled: Boolean = true,
        events: List<String> = listOf("mentions", "replies", "assignments", "access", "reviews"),
    ): ResultActionsDsl = put(
        "${NotificationSettingsController.PATH}/email",
        user,
        """{"address": "$address", "enabled": $enabled, "events": [${events.joinToString { "\"$it\"" }}]}""",
    )

    private fun saveWebhook(
        user: User,
        url: String?,
        enabled: Boolean = true,
        events: List<String> = listOf("mentions", "replies", "assignments", "access", "reviews"),
    ): ResultActionsDsl = put(
        "${NotificationSettingsController.PATH}/webhook",
        user,
        """{"url": ${url?.let { "\"$it\"" }}, "enabled": $enabled, "events": [${events.joinToString { "\"$it\"" }}]}""",
    )

    private fun resend(user: User) = post("${NotificationSettingsController.PATH}/email/resend", user, "")

    private fun confirm(user: User, token: String) =
        post("${NotificationSettingsController.PATH}/email/confirm", user, """{"token": "$token"}""")

    private fun testWebhook(user: User) = post("${NotificationSettingsController.PATH}/webhook/test", user, "")

    private fun delete(user: User, kind: String) = mockMvc.delete("${NotificationSettingsController.PATH}/$kind") {
        with(user.session())
        with(csrf())
    }

    private fun mute(user: User, board: String) = put("/api/boards/$board/notification-mute", user, "")

    private fun unmute(user: User, board: String) = mockMvc.delete("/api/boards/$board/notification-mute") {
        with(user.session())
        with(csrf())
    }

    private fun createBoard(owner: User, title: String): String {
        val response = post("/api/boards", owner, """{"title": "$title"}""").andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    private fun setLinkAccess(board: String, linkAccess: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$linkAccess"}"""
        }.andExpect { status { isOk() } }
    }

    private fun put(path: String, user: User, body: String): ResultActionsDsl = mockMvc.put(path) {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private fun post(path: String, user: User, body: String): ResultActionsDsl = mockMvc.post(path) {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }
}
