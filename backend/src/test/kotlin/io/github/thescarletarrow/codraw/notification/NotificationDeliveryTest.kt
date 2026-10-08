package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.e2e.RecordingEmailTransport
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
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
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@IntegrationTest
class NotificationDeliveryTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val json: JsonMapper,
    @Autowired private val letters: RecordingEmailTransport,
    @Autowired private val delivery: NotificationDelivery,
    @Autowired private val registry: MeterRegistry,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var board: String
    private val webhook = TestWebhook()

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM notification_channels").update()
        letters.clear()
        delivery.batchSize = NotificationDelivery.BATCH_SIZE
        clock.advance(Duration.ofHours(2))
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        board = createBoard(alice, "Схема БД")
        open(board, bob)
    }

    @AfterEach
    fun stopWebhook() = webhook.close()

    @Test
    fun `a mention goes to the confirmed address a minute later, once, with the words and the link of the bell`() {
        confirmedEmail(bob)
        val thread = start(board, alice, body = "@Bob посмотри", mentions = listOf(bob), pageId = "page-2")

        deliverAfter(Duration.ofSeconds(59))
        assertTrue(lettersToBob().isEmpty())

        deliverAfter(Duration.ofSeconds(1))
        val letter = lettersToBob().single()
        assertEquals("Alice: упоминание в «Схема БД»", letter.subject)
        assertTrue(letter.text.startsWith("Alice: упоминание в «Схема БД»\n\n@Bob посмотри\n"), letter.text)
        assertTrue(
            letter.text.contains("Открыть в CoDraw: https://codraw.example.com/boards/$board?page=page-2&thread=$thread"),
            letter.text,
        )
        assertTrue(letter.text.contains("включены письма о событиях «Упоминания»"), letter.text)
        assertEquals("https://codraw.example.com/settings/notifications", letter.unsubscribeUrl)
        assertEquals(listOf("SENT"), statuses())

        deliverAfter(Duration.ofHours(3))
        assertEquals(1, lettersToBob().size)
        settings(bob).andExpect { jsonPath("$.email.channel.lastDeliveredAt") { value(deliveredAt()) } }
    }

    @Test
    fun `an address not confirmed, a channel turned off, an event not chosen and a muted board get nothing`() {
        saveEmail(bob, "bob@example.com")
        start(board, alice, body = "@Bob", mentions = listOf(bob))
        deliverAfter(Duration.ofMinutes(2))
        assertTrue(lettersToBob().isEmpty())
        assertEquals(emptyList(), statuses())

        confirm(bob)
        saveEmail(bob, "bob@example.com", enabled = false)
        start(board, alice, body = "@Bob", mentions = listOf(bob))
        saveEmail(bob, "bob@example.com", events = listOf("replies"))
        start(board, alice, body = "@Bob", mentions = listOf(bob))
        saveEmail(bob, "bob@example.com")
        mute(bob, board)
        start(board, alice, body = "@Bob", mentions = listOf(bob))
        deliverAfter(Duration.ofMinutes(2))

        assertTrue(lettersToBob().isEmpty())
        assertEquals(emptyList(), statuses())
    }

    @Test
    fun `settings changed after the notification are those the message follows`() {
        confirmedEmail(bob)
        start(board, alice, body = "@Bob", mentions = listOf(bob))
        mute(bob, board)

        deliverAfter(Duration.ofMinutes(2))

        assertTrue(lettersToBob().isEmpty())
        assertEquals(listOf("SKIPPED SETTINGS"), statusesWithReasons())
    }

    @Test
    fun `a notification read in the app before the message is due is not sent`() {
        confirmedEmail(bob)
        start(board, alice, body = "@Bob", mentions = listOf(bob))
        mockMvc.post("/api/notifications/read-all") {
            with(bob.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        deliverAfter(Duration.ofMinutes(2))

        assertTrue(lettersToBob().isEmpty())
        assertEquals(listOf("SKIPPED READ"), statusesWithReasons())
    }

    @Test
    fun `a request for access cancelled before its message is due takes the message with it`() {
        val alicesAddress = "alice@example.com"
        confirmedEmail(alice, alicesAddress)
        setLinkAccess(board, "view")
        val carol = users.gitHubUser("Carol")
        ask(board, carol, "editor")
        mockMvc.delete("/api/boards/$board/access-request") {
            with(carol.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        deliverAfter(Duration.ofMinutes(2))

        assertEquals(1, letters.lettersTo(alicesAddress).size, "only the letter that confirms the address")
        assertEquals(0, count("notification_deliveries"))
    }

    @Test
    fun `an edit that mentions the same participant again sends nothing more`() {
        confirmedEmail(bob)
        val thread = start(board, alice, body = "@Bob", mentions = listOf(bob))
        val comment = firstComment(thread)
        edit(board, thread, comment, alice, "Без упоминания")
        edit(board, thread, comment, alice, "@Bob снова", mentions = listOf(bob))

        deliverAfter(Duration.ofMinutes(2))

        assertEquals(1, lettersToBob().size)
    }

    @Test
    fun `a recipient who lost access hears nothing, but of a refusal of access, which names neither the board nor the owner`() {
        confirmedEmail(bob)
        start(board, alice, body = "@Bob", mentions = listOf(bob))
        setLinkAccess(board, "none")
        deliverAfter(Duration.ofMinutes(2))
        assertTrue(lettersToBob().isEmpty())
        assertEquals(listOf("SKIPPED NO_ACCESS"), statusesWithReasons())

        val request = ask(board, bob, "viewer")
        mockMvc.delete("/api/boards/$board/access-requests/$request") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        deliverAfter(Duration.ofMinutes(2))

        val letter = lettersToBob().single()
        assertEquals("Отказ в доступе", letter.subject)
        assertFalse(letter.text.contains("Схема БД"), letter.text)
        assertFalse(letter.text.contains("Alice"), letter.text)
        assertTrue(letter.text.contains("Открыть в CoDraw: https://codraw.example.com/boards/$board\n"), letter.text)
    }

    @Test
    fun `a request for access goes to the chat of the owner with the link to «Поделиться», mentions of the chat broken`() {
        saveWebhook(alice, webhook.url)
        setLinkAccess(board, "view")
        val carol = users.gitHubUser("@channel <!here>")
        ask(board, carol, "editor")

        deliverAfter(Duration.ofMinutes(2))

        val text = json.readTree(webhook.bodies.single())["text"].asString()
        assertEquals(
            "@​channel &lt;!here&gt;: запрос доступа к «Схема БД»\nПросит редактирование\n" +
                "https://codraw.example.com/boards/$board?share=requests",
            text,
        )
    }

    @Test
    fun `a chat that does not answer gets the message again later, and the channel shows the error until it goes`() {
        saveWebhook(bob, webhook.url)
        webhook.answer(503, 500)
        start(board, alice, body = "@Bob", mentions = listOf(bob))

        deliverAfter(Duration.ofMinutes(1))
        assertEquals(1, webhook.bodies.size)
        assertEquals(listOf("PENDING UNAVAILABLE"), statusesWithReasons())
        settings(bob).andExpect { jsonPath("$.webhook.channel.lastError") { value("unavailable") } }

        // The second attempt waits a minute, the third five more.
        deliverAfter(Duration.ofSeconds(59))
        assertEquals(1, webhook.bodies.size)
        deliverAfter(Duration.ofSeconds(1))
        assertEquals(2, webhook.bodies.size)
        deliverAfter(Duration.ofMinutes(4))
        assertEquals(2, webhook.bodies.size)
        deliverAfter(Duration.ofMinutes(1))
        assertEquals(3, webhook.bodies.size)

        assertEquals(listOf("SENT"), statuses())
        assertEquals(3, attempts())
        settings(bob).andExpect { jsonPath("$.webhook.channel.lastError") { value(nullValue()) } }
        deliverAfter(Duration.ofHours(3))
        assertEquals(3, webhook.bodies.size)
    }

    @Test
    fun `a webhook that refuses the message is not asked again, and one that never answers fails after five attempts`() {
        saveWebhook(bob, webhook.url)
        webhook.answer(410)
        start(board, alice, body = "@Bob", mentions = listOf(bob))
        deliverAfter(Duration.ofMinutes(1))
        deliverAfter(Duration.ofHours(3))
        assertEquals(1, webhook.bodies.size)
        assertEquals(listOf("FAILED REJECTED"), statusesWithReasons())
        settings(bob).andExpect { jsonPath("$.webhook.channel.lastError") { value("rejected") } }

        jdbcClient.sql("DELETE FROM notification_deliveries").update()
        webhook.bodies.clear()
        webhook.answer(500, 500, 500, 500, 500, 500)
        start(board, alice, body = "@Bob снова", mentions = listOf(bob))
        repeat(6) { deliverAfter(Duration.ofHours(3)) }

        assertEquals(5, webhook.bodies.size)
        assertEquals(listOf("FAILED UNAVAILABLE"), statusesWithReasons())
    }

    @Test
    fun `a message that an instance took is left alone for its lease, and taken again after it`() {
        confirmedEmail(bob)
        start(board, alice, body = "@Bob", mentions = listOf(bob))
        clock.advance(Duration.ofMinutes(1))
        jdbcClient.sql(
            "UPDATE notification_deliveries SET attempts = 1, next_attempt_at = :until",
        ).param("until", (clock.instant() + NotificationDelivery.LEASE).atOffset(java.time.ZoneOffset.UTC)).update()

        delivery.deliverDue()
        assertTrue(lettersToBob().isEmpty())

        deliverAfter(NotificationDelivery.LEASE)
        assertEquals(1, lettersToBob().size)
        assertEquals(2, attempts())
    }

    @Test
    fun `the queue is sent in batches, and every attempt is counted`() {
        confirmedEmail(bob)
        delivery.batchSize = 2
        val sent = sentCount()
        repeat(5) { start(board, alice, body = "@Bob $it", mentions = listOf(bob)) }

        clock.advance(Duration.ofMinutes(1))
        assertEquals(5, delivery.deliverDue())

        assertEquals(5, lettersToBob().size)
        assertEquals(sent + 5, sentCount())
    }

    private fun sentCount(): Double =
        registry.get("codraw.notifications.deliveries").tag("channel", "email").tag("result", "sent").counter().count()

    private fun deliverAfter(duration: Duration) {
        clock.advance(duration)
        delivery.deliverDue()
    }

    private fun lettersToBob(): List<Email> =
        letters.lettersTo(BOB_ADDRESS).filterNot { it.subject == "Подтвердите адрес для уведомлений CoDraw" }

    private fun statuses(): List<String> =
        jdbcClient.sql("SELECT status FROM notification_deliveries ORDER BY id").query(String::class.java).list().filterNotNull()

    private fun statusesWithReasons(): List<String> = jdbcClient.sql(
        "SELECT status || coalesce(' ' || reason, '') FROM notification_deliveries ORDER BY id",
    ).query(String::class.java).list().filterNotNull()

    private fun attempts(): Int =
        jdbcClient.sql("SELECT attempts FROM notification_deliveries").query(Int::class.java).single()

    private fun deliveredAt(): String = jdbcClient.sql("SELECT finished_at FROM notification_deliveries")
        .query(java.time.OffsetDateTime::class.java).single().toInstant().toString()

    private fun count(table: String) = jdbcClient.sql("SELECT count(*) FROM $table").query(Int::class.java).single()

    private fun confirmedEmail(user: User, address: String = BOB_ADDRESS) {
        saveEmail(user, address)
        confirm(user, address)
    }

    private fun confirm(user: User, address: String = BOB_ADDRESS) {
        val token = Regex("""confirm=([A-Za-z0-9_-]+)""").find(letters.lettersTo(address).last().text)!!.groupValues[1]
        post("${NotificationSettingsController.PATH}/email/confirm", user, """{"token": "$token"}""")
            .andExpect { status { isNoContent() } }
    }

    private fun saveEmail(
        user: User,
        address: String,
        enabled: Boolean = true,
        events: List<String> = listOf("mentions", "replies", "assignments", "access", "reviews"),
    ) {
        put(
            "${NotificationSettingsController.PATH}/email",
            user,
            """{"address": "$address", "enabled": $enabled, "events": [${events.joinToString { "\"$it\"" }}]}""",
        ).andExpect { status { isOk() } }
    }

    private fun saveWebhook(user: User, url: String) {
        put("${NotificationSettingsController.PATH}/webhook", user, """{"url": "$url"}""").andExpect { status { isOk() } }
    }

    private fun settings(user: User): ResultActionsDsl = mockMvc.get(NotificationSettingsController.PATH) { with(user.session()) }

    private fun mute(user: User, board: String) {
        put("/api/boards/$board/notification-mute", user, "").andExpect { status { isNoContent() } }
    }

    private fun createBoard(owner: User, title: String): String {
        val response = post("/api/boards", owner, """{"title": "$title"}""").andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    /** Opens the board through its link, which makes the user a participant to mention. */
    private fun open(board: String, user: User) {
        mockMvc.get("/api/boards/$board") { with(user.session()) }.andExpect { status { isOk() } }
    }

    private fun setLinkAccess(board: String, linkAccess: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$linkAccess"}"""
        }.andExpect { status { isOk() } }
    }

    private fun start(
        board: String,
        user: User,
        body: String = "Комментарий",
        mentions: List<User> = emptyList(),
        pageId: String = "page-1",
    ): String {
        val request = mapOf("pageId" to pageId, "cellId" to "cell-1", "body" to body, "mentions" to mentions.map { it.id })
        val response = post("/api/boards/$board/threads", user, json.writeValueAsString(request))
            .andExpect { status { isCreated() } }
            .andReturn().response
        return json.readTree(response.contentAsString)["id"].asString()
    }

    private fun edit(board: String, thread: String, comment: String, user: User, body: String, mentions: List<User> = emptyList()) {
        mockMvc.patch("/api/boards/$board/threads/$thread/comments/$comment") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = json.writeValueAsString(mapOf("body" to body, "mentions" to mentions.map { it.id }))
        }.andExpect { status { isOk() } }
    }

    private fun firstComment(thread: String): String = jdbcClient.sql(
        "SELECT id::text FROM comments WHERE thread_id = :thread::uuid ORDER BY created_at, id LIMIT 1",
    ).param("thread", thread).query(String::class.java).single()

    /** Asks for the [role] on the board; returns the id of the request. */
    private fun ask(board: String, user: User, role: String): String {
        val response = put("/api/boards/$board/access-request", user, """{"role": "$role"}""")
            .andExpect { status { isOk() } }
            .andReturn().response
        return json.readTree(response.contentAsString)["id"].asString()
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

    private companion object {
        const val BOB_ADDRESS = "bob@example.com"
    }
}
