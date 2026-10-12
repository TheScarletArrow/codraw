package io.github.thescarletarrow.codraw.feedback

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.admin.AdminCleanup
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.signedIn
import io.github.thescarletarrow.codraw.user.GuestCleanup
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
import org.hamcrest.Matchers.contains
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.session.SessionRepository
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Duration
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.assertEquals

@IntegrationTest
@TestPropertySource(
    properties = [
        "codraw.limits.feedback-per-address-per-hour=3",
        "codraw.limits.feedback-per-user-per-day=4",
    ],
)
class FeedbackApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val sessions: SessionRepository<*>,
    @Autowired private val registry: MeterRegistry,
    @Autowired private val clock: MutableClock,
    @Autowired private val cleanup: AdminCleanup,
    @Autowired private val guestCleanup: GuestCleanup,
) {

    private lateinit var admin: User
    private lateinit var alice: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM feedback").update()
        jdbcClient.sql("DELETE FROM admin_actions").update()
        admin = users.gitHubUser(IntegrationTest.ADMIN)
        // A user of their own for every test, so that the limit of a user counts only what the test sends.
        alice = users.gitHubUser("Alice ${USERS.incrementAndGet()}")
    }

    @Test
    fun `a user and a guest send feedback, which reaches the administrators with the page, the version and the browser`() {
        val guest = users.createGuest()
        val (bugs, ideas) = received("bug") to received("idea")

        send(alice, """{"kind": "bug", "text": "  Не сохраняется подпись  ", "page": "/boards/42?page=p1", "appVersion": "0.43.0"}""")
            .andExpect { status { isNoContent() } }
        clock.advance(Duration.ofSeconds(1))
        send(guest, """{"kind": "idea", "text": "Тёмная тема для печати"}""").andExpect { status { isNoContent() } }

        assertEquals(bugs + 1, received("bug"))
        assertEquals(ideas + 1, received("idea"))
        adminGet("/api/admin/feedback").andExpect {
            status { isOk() }
            // The newest first.
            jsonPath("$[*].kind") { value(contains("idea", "bug")) }
            jsonPath("$[0].author.name") { value(guest.name) }
            jsonPath("$[0].author.guest") { value(true) }
            jsonPath("$[0].page") { value(null) }
            jsonPath("$[0].appVersion") { value(null) }
            jsonPath("$[1].author.id") { value(alice.id.toString()) }
            jsonPath("$[1].author.name") { value(alice.name) }
            jsonPath("$[1].author.guest") { value(false) }
            jsonPath("$[1].text") { value("Не сохраняется подпись") }
            jsonPath("$[1].page") { value("/boards/42") }
            jsonPath("$[1].appVersion") { value("0.43.0") }
            jsonPath("$[1].userAgent") { value("Mozilla/5.0 Test") }
            jsonPath("$[1].createdAt") { exists() }
            jsonPath("$[1].resolvedAt") { value(null) }
        }
    }

    @Test
    fun `refuses feedback without a session or the CSRF token, of an unknown kind, without a text or with too long fields`() {
        send(null, """{"kind": "bug", "text": "x"}""").andExpect { status { isUnauthorized() } }
        send(alice, """{"kind": "bug", "text": "x"}""") { with(alice.session()) }.andExpect { status { isForbidden() } }
        send(alice, """{"kind": "complaint", "text": "x"}""").andExpect { status { isBadRequest() } }
        send(alice, """{"text": "x"}""").andExpect { status { isBadRequest() } }
        send(alice, """{"kind": "bug", "text": "   "}""").andExpect { status { isBadRequest() } }
        send(alice, """{"kind": "bug", "text": "${"x".repeat(4001)}"}""").andExpect { status { isBadRequest() } }
        send(alice, """{"kind": "bug", "text": "x", "page": "/${"x".repeat(500)}"}""").andExpect { status { isBadRequest() } }
        send(alice, """{"kind": "bug", "text": "x", "appVersion": "${"1".repeat(51)}"}""").andExpect { status { isBadRequest() } }

        assertEquals(0, count())
    }

    @Test
    fun `keeps the browser of a long user agent cut to 500 characters`() {
        send(alice, """{"kind": "other", "text": "x"}""", userAgent = "U".repeat(600)).andExpect { status { isNoContent() } }

        adminGet("/api/admin/feedback").andExpect { jsonPath("$[0].userAgent") { value("U".repeat(500)) } }
    }

    @Test
    fun `takes as much feedback from an address in an hour as the limit allows`() {
        val address = nextAddress()
        val reached = limitsReached("feedback")
        repeat(3) {
            send(users.gitHubUser("Sender ${USERS.incrementAndGet()}"), """{"kind": "idea", "text": "x"}""", address)
                .andExpect { status { isNoContent() } }
        }
        clock.advance(Duration.ofMinutes(20))

        send(alice, """{"kind": "idea", "text": "x"}""", address).andExpect {
            status { isTooManyRequests() }
            header { string("Retry-After", "2400") }
        }

        assertEquals(3, count())
        assertEquals(reached + 1, limitsReached("feedback"))
        send(alice, """{"kind": "idea", "text": "x"}""").andExpect { status { isNoContent() } }
        clock.advance(Duration.ofMinutes(40))
        send(users.gitHubUser("Sender ${USERS.incrementAndGet()}"), """{"kind": "idea", "text": "x"}""", address)
            .andExpect { status { isNoContent() } }
    }

    @Test
    fun `takes as much feedback from a user in a day as the limit allows, from any address`() {
        val reached = limitsReached("feedback-per-user")
        repeat(4) { send(alice, """{"kind": "bug", "text": "x"}""").andExpect { status { isNoContent() } } }

        send(alice, """{"kind": "bug", "text": "x"}""").andExpect {
            status { isTooManyRequests() }
            header { exists("Retry-After") }
        }

        assertEquals(4, count())
        assertEquals(reached + 1, limitsReached("feedback-per-user"))
        clock.advance(Duration.ofDays(1))
        send(alice, """{"kind": "bug", "text": "x"}""").andExpect { status { isNoContent() } }
    }

    @Test
    fun `an administrator closes feedback, which goes to the closed ones and to the journal once`() {
        val text = "Первая строка\nвторая ${"x".repeat(100)}"
        send(alice, """{"kind": "bug", "text": "${text.replace("\n", "\\n")}"}""").andExpect { status { isNoContent() } }
        val id = jdbcClient.sql("SELECT id::text FROM feedback").query(String::class.java).single()

        adminPost("/api/admin/feedback/$id/resolve").andExpect {
            status { isOk() }
            jsonPath("$.resolvedAt") { exists() }
            jsonPath("$.resolvedBy") { value(IntegrationTest.ADMIN) }
        }
        adminPost("/api/admin/feedback/$id/resolve").andExpect { status { isOk() } }

        adminGet("/api/admin/feedback").andExpect { jsonPath("$") { isEmpty() } }
        adminGet("/api/admin/feedback?status=resolved").andExpect {
            jsonPath("$[*].id") { value(contains(id)) }
            jsonPath("$[0].resolvedBy") { value(IntegrationTest.ADMIN) }
        }
        adminGet("/api/admin/actions").andExpect {
            jsonPath("$[*].action") { value(contains("resolve-feedback")) }
            jsonPath("$[0].targetKind") { value("feedback") }
            jsonPath("$[0].targetId") { value(id) }
            // The beginning of the text on one line names it.
            jsonPath("$[0].targetLabel") { value("Первая строка вторая ${"x".repeat(58)}…") }
        }
    }

    @Test
    fun `only administrators get the feedback of users`() {
        send(alice, """{"kind": "bug", "text": "x"}""").andExpect { status { isNoContent() } }
        val id = jdbcClient.sql("SELECT id::text FROM feedback").query(String::class.java).single()

        mockMvc.get("/api/admin/feedback").andExpect { status { isUnauthorized() } }
        mockMvc.get("/api/admin/feedback") { with(alice.session()) }.andExpect { status { isForbidden() } }
        mockMvc.post("/api/admin/feedback/$id/resolve") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isForbidden() } }

        adminGet("/api/admin/feedback?status=nonsense").andExpect { status { isBadRequest() } }
        adminPost("/api/admin/feedback/0199a000-0000-7000-8000-000000000000/resolve").andExpect { status { isNotFound() } }
        adminGet("/api/admin/feedback").andExpect { jsonPath("$[0].resolvedAt") { value(null) } }
        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM admin_actions").query(Int::class.java).single())
    }

    @Test
    fun `the cleanup deletes closed feedback older than the retention, and open feedback waits`() {
        send(alice, """{"kind": "bug", "text": "Закрытый"}""").andExpect { status { isNoContent() } }
        send(alice, """{"kind": "idea", "text": "Открытый"}""").andExpect { status { isNoContent() } }
        val closed = jdbcClient.sql("SELECT id::text FROM feedback WHERE text = 'Закрытый'").query(String::class.java).single()
        adminPost("/api/admin/feedback/$closed/resolve").andExpect { status { isOk() } }
        clock.advance(Duration.ofDays(364))
        assertEquals(AdminCleanup.Result(actions = 0, reports = 0, feedback = 0), cleanup.cleanUp())

        clock.advance(Duration.ofDays(2))

        assertEquals(AdminCleanup.Result(actions = 1, reports = 0, feedback = 1), cleanup.cleanUp())
        adminGet("/api/admin/feedback").andExpect { jsonPath("$[*].text") { value(contains("Открытый")) } }
        adminGet("/api/admin/feedback?status=resolved").andExpect { jsonPath("$") { isEmpty() } }
    }

    @Test
    fun `the feedback of a guest passes to the account they sign in with, and stays without an author once it is deleted`() {
        val guest = users.createGuest()
        send(guest, """{"kind": "idea", "text": "Экспорт в PlantUML"}""").andExpect { status { isNoContent() } }
        val carol = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Carol-${USERS.incrementAndGet()}", "Carol", null), guest.id)

        adminGet("/api/admin/feedback").andExpect {
            jsonPath("$[0].author.id") { value(carol.id.toString()) }
            jsonPath("$[0].author.guest") { value(false) }
        }
        mockMvc.post("/api/me/export") {
            with(carol.session())
            with(csrf())
        }.andExpect {
            status { isOk() }
            jsonPath("$.feedback[*].text") { value(contains("Экспорт в PlantUML")) }
            jsonPath("$.feedback[0].kind") { value("idea") }
        }

        mockMvc.delete("/api/me") {
            cookie(sessions.signedIn(carol))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"boards": []}"""
        }.andExpect { status { isNoContent() } }

        adminGet("/api/admin/feedback").andExpect {
            jsonPath("$[0].text") { value("Экспорт в PlantUML") }
            jsonPath("$[0].author") { value(null) }
        }
    }

    @Test
    fun `the feedback of a gone guest stays without them after the cleanup of guests`() {
        val guest = users.createGuest()
        send(guest, """{"kind": "bug", "text": "Гость ушёл"}""").andExpect { status { isNoContent() } }
        clock.advance(GuestCleanup.GRACE_PERIOD + Duration.ofHours(1))

        guestCleanup.cleanUp()

        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM users WHERE id = :id").param("id", guest.id).query(Int::class.java).single())
        adminGet("/api/admin/feedback").andExpect {
            jsonPath("$[0].text") { value("Гость ушёл") }
            jsonPath("$[0].author") { value(null) }
        }
    }

    /** Sends feedback as the [user], or without a session, from an address of its own unless the test names one. */
    private fun send(
        user: User?,
        json: String,
        address: String = nextAddress(),
        userAgent: String = "Mozilla/5.0 Test",
        setup: MockHttpServletRequestDsl.() -> Unit = {
            if (user != null) with(user.session())
            with(csrf())
        },
    ): ResultActionsDsl = mockMvc.post(FeedbackController.PATH) {
        setup()
        with { request -> request.apply { remoteAddr = address } }
        header("User-Agent", userAgent)
        contentType = MediaType.APPLICATION_JSON
        content = json
    }

    private fun adminGet(path: String): ResultActionsDsl = mockMvc.get(path) { with(admin.session()) }

    private fun adminPost(path: String): ResultActionsDsl = mockMvc.post(path) {
        with(admin.session())
        with(csrf())
    }

    private fun count(): Int = jdbcClient.sql("SELECT count(*) FROM feedback").query(Int::class.java).single()

    private fun received(kind: String) = registry.get("codraw.feedback.received").tag("kind", kind).counter().count()

    private fun limitsReached(limit: String) = registry.get("codraw.limits.reached").tag("limit", limit).counter().count()

    private companion object {
        val USERS = AtomicInteger()
        val ADDRESSES = AtomicInteger()

        /** An address of its own for every request unless a test names one: the limit of an address stays out of the way. */
        fun nextAddress(): String = ADDRESSES.incrementAndGet().let { "10.9.${it / 250}.${it % 250 + 1}" }
    }
}
