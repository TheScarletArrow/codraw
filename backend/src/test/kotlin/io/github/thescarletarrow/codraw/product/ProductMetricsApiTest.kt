package io.github.thescarletarrow.codraw.product

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.internal.BoardDocumentController
import io.github.thescarletarrow.codraw.internal.InternalTokenInterceptor
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@IntegrationTest
class ProductMetricsApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val boards: BoardService,
    @Autowired private val clock: MutableClock,
    @Autowired private val cleanup: ProductCleanup,
    @Autowired private val metrics: ProductMetrics,
    @Autowired private val registry: MeterRegistry,
) {

    private lateinit var admin: User
    private lateinit var today: LocalDate

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM workspaces").update()
        jdbcClient.sql("DELETE FROM personal_templates").update()
        jdbcClient.sql("DELETE FROM spring_session").update()
        // The days of users and boards go with them.
        jdbcClient.sql("DELETE FROM users").update()
        jdbcClient.sql("DELETE FROM product_daily_counts").update()
        cleanup.batchSize = ProductCleanup.BATCH_SIZE
        today = LocalDate.now(clock)
        admin = users.gitHubUser(IntegrationTest.ADMIN)
    }

    @Test
    fun `only administrators get the statistics`() {
        val alice = users.gitHubUser("Alice")

        mockMvc.get("/api/admin/stats").andExpect { status { isUnauthorized() } }
        mockMvc.get("/api/admin/stats") { with(alice.session()) }.andExpect { status { isForbidden() } }
        mockMvc.get("/api/admin/stats") { with(users.createGuest().session()) }.andExpect { status { isForbidden() } }
        stats().andExpect { status { isOk() } }
    }

    @Test
    fun `writes a day of activity once per user and day, and nothing for requests without a session`() {
        val alice = users.gitHubUser("Alice")

        repeat(3) { mockMvc.get("/api/me") { with(alice.session()) }.andExpect { status { isOk() } } }
        mockMvc.get("/api/legal").andExpect { status { isOk() } }
        assertEquals(listOf(today), daysOf(alice.id))
        assertEquals(1, count("SELECT count(*) FROM user_activity_days"))

        clock.advance(Duration.ofDays(1))
        mockMvc.get("/api/me") { with(alice.session()) }.andExpect { status { isOk() } }
        assertEquals(listOf(today, today.plusDays(1)), daysOf(alice.id))
    }

    @Test
    fun `counts active users, accounts and guests apart, and new accounts over their periods`() {
        val alice = user("Alice", createdDaysAgo = 20)
        activeOn(alice, 0, 10)
        val bob = user("Bob", createdDaysAgo = 3)
        activeOn(bob, 2)
        val guest = user("Гость 1", createdDaysAgo = 1, provider = ProviderProfile.GUEST)
        activeOn(guest, 0)
        val old = user("Old", createdDaysAgo = 100)
        activeOn(old, 40)

        // The administrator, created today, is active today with this very request.
        stats().andExpect {
            status { isOk() }
            jsonPath("$.date") { value(today.toString()) }
            jsonPath("$.collectedSince") { value(today.minusDays(40).toString()) }
            jsonPath("$.activeUsers[*].days") { value(contains(1, 7, 28)) }
            jsonPath("$.activeUsers[*].accounts") { value(contains(2, 3, 3)) }
            jsonPath("$.activeUsers[*].guests") { value(contains(1, 1, 1)) }
            jsonPath("$.periods[*].days") { value(contains(7, 28)) }
            jsonPath("$.periods[*].newAccounts") { value(contains(2, 3)) }
        }
    }

    @Test
    fun `counts the accounts of the weekly cohorts that came back 7 to 13 days after they were created`() {
        // The latest cohort, created 14 to 20 days ago: Carol came back on her 8th day, Dima on his 3rd only.
        activeOn(user("Carol", createdDaysAgo = 16), 8)
        activeOn(user("Dima", createdDaysAgo = 15), 12, 0)
        activeOn(user("Гость 2", createdDaysAgo = 16, provider = ProviderProfile.GUEST), 8)
        // Created 21 to 27 days ago: Erin on her 13th day, Frank on his 6th and 14th.
        activeOn(user("Erin", createdDaysAgo = 21), 8)
        activeOn(user("Frank", createdDaysAgo = 27), 21, 13)
        // Created 35 to 41 days ago: Gina on her 7th day. Henry and Ivan are in no cohort.
        val gina = user("Gina", createdDaysAgo = 41)
        activeOn(gina, 34)
        activeOn(user("Henry", createdDaysAgo = 13), 6)
        activeOn(user("Ivan", createdDaysAgo = 42), 35)

        stats().andExpect {
            jsonPath("$.cohorts[*].from") { value(contains(*listOf(20L, 27L, 34L, 41L).map { today.minusDays(it).toString() }.toTypedArray())) }
            jsonPath("$.cohorts[*].to") { value(contains(*listOf(14L, 21L, 28L, 35L).map { today.minusDays(it).toString() }.toTypedArray())) }
            jsonPath("$.cohorts[*].accounts") { value(contains(2, 2, 0, 1)) }
            jsonPath("$.cohorts[*].returned") { value(contains(1, 1, 0, 1)) }
            jsonPath("$.cohorts[*].complete") { value(contains(true, true, true, true)) }
        }

        // Without the days before Frank's first one, the two oldest cohorts cannot tell who came back.
        jdbcClient.sql("DELETE FROM user_activity_days WHERE day < :day").param("day", today.minusDays(21)).update()
        stats().andExpect {
            jsonPath("$.collectedSince") { value(today.minusDays(21).toString()) }
            jsonPath("$.cohorts[*].complete") { value(contains(true, true, false, false)) }
        }
    }

    @Test
    fun `counts the guests who signed in with a provider in their session`() {
        val guest = users.createGuest()
        users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Zoe", "Zoe", null), guest.id)
        // Signing in again, or after another account, is no conversion.
        users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Zoe", "Zoe", null), admin.id)
        users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Zoe", "Zoe", null), null)
        assertEquals(1, count("SELECT count FROM product_daily_counts WHERE kind = 'GUEST_CONVERSION' AND day = :day", "day" to today))
        dailyCount(today.minusDays(10), 2)
        dailyCount(today.minusDays(30), 5)

        stats().andExpect { jsonPath("$.periods[*].guestConversions") { value(contains(1, 3)) } }
    }

    @Test
    fun `counts the boards that users edited and those they edited together`() {
        val alice = users.gitHubUser("Alice")
        val edited = board(alice, "Правили")
        val stored = board(alice, "Сохранили без правок")
        val together = board(alice, "Правили вместе")
        val earlier = board(alice, "Правили раньше")
        val earlierTogether = board(alice, "Правили вместе раньше")

        repeat(2) { store(edited, alice.id.toString()).andExpect { status { isNoContent() } } }
        store(stored, null).andExpect { status { isNoContent() } }
        coEdited(together).andExpect { status { isNoContent() } }
        coEdited(UUID.randomUUID().toString()).andExpect { status { isNotFound() } }
        coEdited("not-a-board").andExpect { status { isNotFound() } }
        mockMvc.post("/internal/boards/$edited/co-edited").andExpect { status { isUnauthorized() } }
        boardDay(earlier, today.minusDays(10), coEdited = false)
        boardDay(earlierTogether, today.minusDays(20), coEdited = true)

        assertEquals(1, count("SELECT count(*) FROM board_activity_days WHERE board_id = :board AND NOT co_edited", "board" to edited))
        assertEquals(0, count("SELECT count(*) FROM board_activity_days WHERE board_id = :board", "board" to stored))
        assertEquals(1, count("SELECT count(*) FROM board_activity_days WHERE board_id = :board AND co_edited", "board" to together))
        stats().andExpect {
            jsonPath("$.periods[*].editedBoards") { value(contains(2, 4)) }
            jsonPath("$.periods[*].coEditedBoards") { value(contains(1, 2)) }
        }

        // A board edited first and together later that day is edited together that day.
        coEdited(edited).andExpect { status { isNoContent() } }
        assertEquals(1, count("SELECT count(*) FROM board_activity_days WHERE board_id = :board AND co_edited", "board" to edited))
    }

    @Test
    fun `gives the statistics as gauges for Prometheus`() {
        activeOn(admin.id, 0)
        activeOn(user("Bob", createdDaysAgo = 3), 2)
        activeOn(user("Гость 3", createdDaysAgo = 0, provider = ProviderProfile.GUEST), 0)

        metrics.refresh()

        assertEquals(1.0, gauge("codraw.product.active.users", "period", "1d", "kind", "accounts"))
        assertEquals(2.0, gauge("codraw.product.active.users", "period", "7d", "kind", "accounts"))
        assertEquals(1.0, gauge("codraw.product.active.users", "period", "28d", "kind", "guests"))
        assertEquals(2.0, gauge("codraw.product.new.accounts", "period", "7d"))
        assertEquals(0.0, gauge("codraw.product.edited.boards", "period", "28d"))
        // Without edited boards there is no share, and without accounts no share of a cohort.
        assertTrue(gauge("codraw.product.coedited.share", "period", "7d").isNaN())
        assertTrue(gauge("codraw.product.week1.retention", "cohort", "1").isNaN())
        assertEquals(0.0, gauge("codraw.product.week1.cohort.accounts", "cohort", "4"))
        mockMvc.get("/actuator/prometheus").andExpect {
            content { string(containsString("codraw_product_active_users{application=\"codraw-backend\",kind=\"guests\",period=\"28d\"} 1.0")) }
            content { string(containsString("codraw_product_week1_retention{application=\"codraw-backend\",cohort=\"4\"}")) }
        }
    }

    @Test
    fun `deletes the days and counts older than six weeks, a batch at a time`() {
        val alice = user("Alice", createdDaysAgo = 60)
        activeOn(alice, 43, 42, 0)
        val board = board(users.gitHubUser("Bob"), "Схема")
        boardDay(board, today.minusDays(43), coEdited = true)
        boardDay(board, today.minusDays(42), coEdited = false)
        dailyCount(today.minusDays(43), 1)
        dailyCount(today.minusDays(42), 1)
        cleanup.batchSize = 1

        assertEquals(ProductCleanup.Result(users = 1, boards = 1, counts = 1), cleanup.cleanUp())

        assertEquals(listOf(today.minusDays(42), today), daysOf(alice))
        assertEquals(1, count("SELECT count(*) FROM board_activity_days WHERE day = :day", "day" to today.minusDays(42)))
        assertEquals(1, count("SELECT count(*) FROM product_daily_counts"))
        assertEquals(ProductCleanup.Result(users = 0, boards = 0, counts = 0), cleanup.cleanUp())
    }

    @Test
    fun `the data of a user name their days of activity`() {
        val alice = users.gitHubUser("Alice")
        activeOn(alice.id, 1)

        mockMvc.post("/api/me/export") {
            with(alice.session())
            with(csrf())
        }.andExpect {
            status { isOk() }
            jsonPath("$.activityDays") { value(contains(today.minusDays(1).toString(), today.toString())) }
        }
    }

    private fun stats(): ResultActionsDsl = mockMvc.get("/api/admin/stats") { with(admin.session()) }

    /** A user created at noon [createdDaysAgo] days before today. */
    private fun user(name: String, createdDaysAgo: Long, provider: String = ProviderProfile.GITHUB): UUID = jdbcClient.sql(
        "INSERT INTO users (provider, provider_user_id, name, created_at) VALUES (:provider, :id, :name, :createdAt) RETURNING id",
    )
        .param("provider", provider)
        .param("id", "id-$name")
        .param("name", name)
        .param("createdAt", today.minusDays(createdDaysAgo).atTime(12, 0).atOffset(ZoneOffset.UTC))
        .query(UUID::class.java)
        .single()

    /** The user [id] was active the given numbers of days before today. */
    private fun activeOn(id: UUID, vararg daysAgo: Long) = daysAgo.forEach { days ->
        jdbcClient.sql("INSERT INTO user_activity_days (user_id, day) VALUES (:user, :day)")
            .param("user", id)
            .param("day", today.minusDays(days))
            .update()
    }

    private fun daysOf(id: UUID): List<LocalDate> =
        jdbcClient.sql("SELECT day FROM user_activity_days WHERE user_id = :user ORDER BY day")
            .param("user", id)
            .query(LocalDate::class.java)
            .list()
            .filterNotNull()

    private fun board(owner: User, title: String): UUID = checkNotNull(boards.create(title, owner.id).id)

    private fun boardDay(board: UUID, day: LocalDate, coEdited: Boolean) {
        jdbcClient.sql("INSERT INTO board_activity_days (board_id, day, co_edited) VALUES (:board, :day, :coEdited)")
            .param("board", board)
            .param("day", day)
            .param("coEdited", coEdited)
            .update()
    }

    private fun dailyCount(day: LocalDate, count: Int) {
        jdbcClient.sql("INSERT INTO product_daily_counts (day, kind, count) VALUES (:day, 'GUEST_CONVERSION', :count)")
            .param("day", day)
            .param("count", count)
            .update()
    }

    /** Stores a document of the board as collab does, naming [editors] as those who changed it. */
    private fun store(board: UUID, editors: String?): ResultActionsDsl = mockMvc.put("/internal/boards/$board/document") {
        header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
        if (editors != null) header(BoardDocumentController.EDITORS_HEADER, editors)
        contentType = MediaType.APPLICATION_OCTET_STREAM
        content = byteArrayOf(1, 2, 3)
    }

    private fun coEdited(board: Any): ResultActionsDsl = mockMvc.post("/internal/boards/$board/co-edited") {
        header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
    }

    private fun count(sql: String, vararg params: Pair<String, Any?>): Int = params
        .fold(jdbcClient.sql(sql)) { spec, (name, value) -> spec.param(name, value) }
        .query(Int::class.java)
        .single()

    private fun gauge(name: String, vararg tags: String): Double = registry.get(name).tags(*tags).gauge().value()
}
