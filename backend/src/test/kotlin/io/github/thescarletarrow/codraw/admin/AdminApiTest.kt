package io.github.thescarletarrow.codraw.admin

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.board.BoardMembers
import io.github.thescarletarrow.codraw.board.MemberRole
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.signedIn
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserBlockedException
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.session.SessionRepository
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.Duration
import java.time.OffsetDateTime
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

@IntegrationTest
class AdminApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val sessions: SessionRepository<*>,
    @Autowired private val clock: MutableClock,
    @Autowired private val cleanup: AdminCleanup,
    @Autowired private val members: BoardMembers,
) {

    private lateinit var admin: User
    private lateinit var alice: User
    private lateinit var bob: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM admin_actions").update()
        jdbcClient.sql("DELETE FROM spring_session").update()
        jdbcClient.sql("UPDATE users SET blocked_at = NULL").update()
        admin = users.gitHubUser(IntegrationTest.ADMIN)
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
    }

    /** Other tests sign the same users in: none of them stays blocked. */
    @AfterEach
    fun unblockAll() {
        jdbcClient.sql("UPDATE users SET blocked_at = NULL").update()
    }

    @Test
    fun `only the administrators of the configuration get the API of administration`() {
        mockMvc.get("/api/admin/users").andExpect { status { isUnauthorized() } }
        mockMvc.get("/api/admin/users") { with(alice.session()) }.andExpect { status { isForbidden() } }
        // Before any controller: an address that does not exist tells nothing either.
        mockMvc.get("/api/admin/nothing-here") { with(alice.session()) }.andExpect { status { isForbidden() } }
        mockMvc.post("/api/admin/users/${bob.id}/block") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isForbidden() } }
        mockMvc.get("/api/admin/users") { with(users.createGuest().session()) }.andExpect { status { isForbidden() } }
        assertEquals(null, blockedAt(bob))

        mockMvc.get("/api/admin/users") { with(admin.session()) }.andExpect { status { isOk() } }
    }

    @Test
    fun `the profile tells whether the user administers the installation`() {
        mockMvc.get("/api/me") { with(admin.session()) }.andExpect { jsonPath("$.admin") { value(true) } }
        mockMvc.get("/api/me") { with(alice.session()) }.andExpect { jsonPath("$.admin") { value(false) } }
        mockMvc.get("/api/me") { with(users.createGuest().session()) }.andExpect { jsonPath("$.admin") { value(false) } }
    }

    @Test
    fun `finds users by a part of their name, their id and their id at the provider`() {
        createBoard(alice, "Первая")
        createBoard(alice, "Вторая")

        adminGet("/api/admin/users?query=ali").andExpect {
            status { isOk() }
            jsonPath("$[*].name") { value(contains("Alice")) }
            jsonPath("$[0].provider") { value("github") }
            jsonPath("$[0].providerUserId") { value("id-Alice") }
            jsonPath("$[0].guest") { value(false) }
            jsonPath("$[0].admin") { value(false) }
            jsonPath("$[0].boards") { value(2) }
            jsonPath("$[0].blockedAt") { value(null) }
        }
        adminGet("/api/admin/users?query=${bob.id}").andExpect { jsonPath("$[*].name") { value(contains("Bob")) } }
        adminGet("/api/admin/users?query=id-Bob").andExpect { jsonPath("$[*].name") { value(contains("Bob")) } }
        adminGet("/api/admin/users?query=Admin").andExpect { jsonPath("$[0].admin") { value(true) } }
        // A pattern of LIKE in the query is taken literally.
        adminGet("/api/admin/users?query=%25").andExpect { jsonPath("$[*].name") { value(not(hasItem("Alice"))) } }
    }

    @Test
    fun `an administrator deletes an account with its boards, those with other members too, and the journal keeps its name`() {
        val carol = users.gitHubUser("Carol")
        val cookie = sessions.signedIn(carol)
        val shared = createBoard(carol, "Общая")
        members.put(java.util.UUID.fromString(shared), bob.id, MemberRole.EDITOR, clock.instant())

        adminDelete("/api/admin/users/${carol.id}").andExpect { status { isNoContent() } }

        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM users WHERE id = :id").param("id", carol.id).query(Int::class.java).single())
        assertEquals(0, count("boards"))
        mockMvc.get("/api/me") { cookie(cookie) }.andExpect { status { isUnauthorized() } }
        adminGet("/api/admin/actions").andExpect {
            jsonPath("$[0].action") { value("delete-user") }
            jsonPath("$[0].targetLabel") { value("Carol") }
            jsonPath("$[0].targetId") { value(carol.id.toString()) }
        }
        adminDelete("/api/admin/users/${carol.id}").andExpect { status { isNotFound() } }
    }

    @Test
    fun `an administrator deletes neither themselves nor other administrators`() {
        adminDelete("/api/admin/users/${admin.id}").andExpect { status { isConflict() } }
        mockMvc.delete("/api/admin/users/${bob.id}") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isForbidden() } }
        assertEquals(0, count("admin_actions"))
    }

    @Test
    fun `blocking deletes the sessions of the user, who no longer signs in, and unblocking lets them in again`() {
        val first = sessions.signedIn(alice)
        val second = sessions.signedIn(alice)
        val bobs = sessions.signedIn(bob)
        mockMvc.get("/api/me") { cookie(first) }.andExpect { status { isOk() } }

        adminPost("/api/admin/users/${alice.id}/block").andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Alice") }
            jsonPath("$.blockedAt") { exists() }
        }

        mockMvc.get("/api/me") { cookie(first) }.andExpect { status { isUnauthorized() } }
        mockMvc.get("/api/me") { cookie(second) }.andExpect { status { isUnauthorized() } }
        mockMvc.get("/api/me") { cookie(bobs) }.andExpect { status { isOk() } }
        assertFailsWith<UserBlockedException> { users.gitHubUser("Alice") }

        adminDelete("/api/admin/users/${alice.id}/block").andExpect { jsonPath("$.blockedAt") { value(null) } }
        assertEquals(alice.id, users.gitHubUser("Alice").id)
    }

    @Test
    fun `blocking again changes nothing and writes nothing to the journal`() {
        adminPost("/api/admin/users/${alice.id}/block").andExpect { status { isOk() } }
        val blockedAt = blockedAt(alice)
        clock.advance(Duration.ofMinutes(1))

        adminPost("/api/admin/users/${alice.id}/block").andExpect { status { isOk() } }

        assertEquals(blockedAt, blockedAt(alice))
        assertEquals(1, count("admin_actions"))
    }

    @Test
    fun `an administrator blocks neither themselves nor other administrators`() {
        adminPost("/api/admin/users/${admin.id}/block").andExpect { status { isConflict() } }
        assertEquals(null, blockedAt(admin))
        assertEquals(0, count("admin_actions"))
        adminPost("/api/admin/users/0199a000-0000-7000-8000-000000000000/block").andExpect { status { isNotFound() } }
    }

    @Test
    fun `finds boards by title and id, in the trash too, and tells everything but their content`() {
        val board = createBoard(alice, "Бесплатный хостинг картинок")
        createBoard(bob, "Архитектура")
        patchBoard(alice, board, """{"linkAccess": "public"}""").andExpect { status { isOk() } }
        enableEmbed(alice, board).andExpect { status { isOk() } }
        jdbcClient.sql("INSERT INTO board_documents (board_id, state, updated_at) VALUES (:id::uuid, :state, now())")
            .param("id", board).param("state", ByteArray(100)).update()

        adminGet("/api/admin/boards?query=хостинг").andExpect {
            jsonPath("$[*].title") { value(contains("Бесплатный хостинг картинок")) }
            jsonPath("$[0].owner.name") { value("Alice") }
            jsonPath("$[0].linkAccess") { value("public") }
            jsonPath("$[0].embed") { value(true) }
            jsonPath("$[0].sharingBlocked") { value(false) }
            jsonPath("$[0].openReports") { value(0) }
        }
        adminGet("/api/admin/boards/$board").andExpect {
            status { isOk() }
            jsonPath("$.board.title") { value("Бесплатный хостинг картинок") }
            jsonPath("$.sizes.document") { value(100) }
            jsonPath("$.sizes.versions") { value(0) }
            jsonPath("$.sizes.images") { value(0) }
            jsonPath("$.embed.path") { exists() }
            jsonPath("$.workspace") { value(null) }
            jsonPath("$.reports") { isEmpty() }
            jsonPath("$.state") { doesNotExist() }
        }

        adminPost("/api/admin/boards/$board/trash").andExpect {
            status { isOk() }
            jsonPath("$.board.deletedAt") { exists() }
        }
        adminGet("/api/admin/boards?query=$board").andExpect { jsonPath("$[0].deletedAt") { exists() } }
        adminGet("/api/admin/boards/0199a000-0000-7000-8000-000000000000").andExpect { status { isNotFound() } }
    }

    @Test
    fun `closing sharing closes the board, its document and its live image to all without a sign-in, until it is lifted`() {
        val board = createBoard(alice, "Публичная")
        patchBoard(alice, board, """{"linkAccess": "public"}""")
        val path = enableEmbed(alice, board).andReturn().response.contentAsString.let { Regex("\"path\":\"([^\"]+)\"").find(it)!!.groupValues[1] }
        mockMvc.get("/api/public/boards/$board").andExpect { status { isOk() } }
        mockMvc.get(path).andExpect { status { isOk() } }

        adminPost("/api/admin/boards/$board/sharing-block").andExpect {
            status { isOk() }
            jsonPath("$.board.linkAccess") { value("none") }
            jsonPath("$.board.sharingBlocked") { value(true) }
            jsonPath("$.board.embed") { value(false) }
            jsonPath("$.embed") { value(null) }
        }

        mockMvc.get("/api/public/boards/$board").andExpect { status { isNotFound() } }
        mockMvc.get("/api/public/boards/$board/document").andExpect { status { isNotFound() } }
        mockMvc.get(path).andExpect { status { isNotFound() } }
        mockMvc.get("/api/boards/$board") { with(bob.session()) }.andExpect { status { isForbidden() } }
        // The owner keeps the board, sees why and opens neither the link nor the live image again.
        mockMvc.get("/api/boards/$board") { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.sharingBlocked") { value(true) }
        }
        patchBoard(alice, board, """{"linkAccess": "view"}""").andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Sharing blocked") }
        }
        enableEmbed(alice, board).andExpect { status { isConflict() } }
        patchBoard(alice, board, """{"linkAccess": "none"}""").andExpect { status { isOk() } }

        adminDelete("/api/admin/boards/$board/sharing-block").andExpect {
            jsonPath("$.board.sharingBlocked") { value(false) }
            jsonPath("$.board.linkAccess") { value("none") }
        }
        patchBoard(alice, board, """{"linkAccess": "public"}""").andExpect {
            status { isOk() }
            jsonPath("$.sharingBlocked") { value(false) }
        }
        mockMvc.get("/api/public/boards/$board").andExpect { status { isOk() } }
    }

    @Test
    fun `the owner restores a board that an administrator moved to the trash, still closed`() {
        val board = createBoard(alice, "Нарушитель")
        patchBoard(alice, board, """{"linkAccess": "public"}""")
        adminPost("/api/admin/boards/$board/sharing-block")
        adminPost("/api/admin/boards/$board/trash")

        mockMvc.get("/api/boards/$board") { with(alice.session()) }.andExpect { status { isNotFound() } }
        mockMvc.get("/api/boards/trash") { with(alice.session()) }.andExpect { jsonPath("$[*].id") { value(contains(board)) } }
        mockMvc.post("/api/boards/trash/$board/restore") {
            with(alice.session())
            with(csrf())
        }.andExpect { jsonPath("$.sharingBlocked") { value(true) } }
        adminPost("/api/admin/boards/$board/trash")
        adminPost("/api/admin/boards/$board/trash").andExpect { status { isNotFound() } }
    }

    @Test
    fun `a report of a reader without a sign-in reaches the queue, which an administrator closes`() {
        val board = createBoard(alice, "Спам")
        patchBoard(alice, board, """{"linkAccess": "public"}""")

        report(board, """{"reason": "spam", "message": "  Реклама казино  "}""", "10.1.0.1").andExpect { status { isNoContent() } }
        report(board, """{"reason": "illegal"}""", "10.1.0.2", bob).andExpect { status { isNoContent() } }

        adminGet("/api/admin/reports").andExpect {
            jsonPath("$[*].reason") { value(contains("spam", "illegal")) }
            jsonPath("$[0].message") { value("Реклама казино") }
            jsonPath("$[0].reporter") { value(null) }
            jsonPath("$[1].reporter.name") { value("Bob") }
            jsonPath("$[0].board.title") { value("Спам") }
            jsonPath("$[0].board.owner.name") { value("Alice") }
            jsonPath("$[0].board.linkAccess") { value("public") }
        }
        val first = jdbcClient.sql("SELECT id::text FROM board_reports WHERE reason = 'SPAM'").query(String::class.java).single()

        adminPost("/api/admin/reports/$first/resolve").andExpect {
            jsonPath("$.resolvedAt") { exists() }
            jsonPath("$.resolvedBy") { value("Admin") }
        }
        adminGet("/api/admin/reports").andExpect { jsonPath("$[*].reason") { value(contains("illegal")) } }
        adminGet("/api/admin/reports?status=resolved").andExpect { jsonPath("$[*].reason") { value(contains("spam")) } }
        adminPost("/api/admin/boards/$board/reports/resolve").andExpect { jsonPath("$.resolved") { value(1) } }
        adminGet("/api/admin/reports").andExpect { jsonPath("$") { isEmpty() } }
        adminGet("/api/admin/actions").andExpect {
            jsonPath("$[*].action") { value(contains("resolve-reports", "resolve-reports")) }
            jsonPath("$[0].details") { value("1") }
        }
    }

    @Test
    fun `reports go only to boards shown without a sign-in, and say nothing of others`() {
        val board = createBoard(alice, "Закрытая")

        report(board, """{"reason": "spam"}""", "10.2.0.1").andExpect { status { isNotFound() } }
        report("0199a000-0000-7000-8000-000000000000", """{"reason": "spam"}""", "10.2.0.1").andExpect { status { isNotFound() } }
        patchBoard(alice, board, """{"linkAccess": "public"}""")
        report(board, """{"reason": "nonsense"}""", "10.2.0.1").andExpect { status { isBadRequest() } }
        report(board, """{"reason": "other", "message": "${"x".repeat(1001)}"}""", "10.2.0.1").andExpect { status { isBadRequest() } }
        assertEquals(0, count("board_reports"))
    }

    @Test
    fun `an address sends at most 5 reports an hour`() {
        val board = createBoard(alice, "Публичная")
        patchBoard(alice, board, """{"linkAccess": "public"}""")
        repeat(5) { report(board, """{"reason": "spam"}""", "10.3.0.1").andExpect { status { isNoContent() } } }

        report(board, """{"reason": "spam"}""", "10.3.0.1").andExpect {
            status { isTooManyRequests() }
            header { exists("Retry-After") }
        }
        report(board, """{"reason": "spam"}""", "10.3.0.2").andExpect { status { isNoContent() } }
        assertEquals(6, count("board_reports"))

        clock.advance(Duration.ofHours(1))
        report(board, """{"reason": "spam"}""", "10.3.0.1").andExpect { status { isNoContent() } }
    }

    @Test
    fun `a board keeps at most 50 open reports, and the sender is not told`() {
        val board = createBoard(alice, "Популярная")
        patchBoard(alice, board, """{"linkAccess": "public"}""")
        jdbcClient.sql(
            "INSERT INTO board_reports (board_id, reason, created_at) SELECT :id::uuid, 'SPAM', now() FROM generate_series(1, 50)",
        ).param("id", board).update()

        report(board, """{"reason": "abuse"}""", "10.4.0.1").andExpect { status { isNoContent() } }

        assertEquals(50, count("board_reports"))
    }

    @Test
    fun `every change of an administrator is in the journal, newest first, page by page`() {
        val board = createBoard(alice, "Доска")
        adminPost("/api/admin/users/${bob.id}/block")
        clock.advance(Duration.ofSeconds(1))
        adminDelete("/api/admin/users/${bob.id}/block")
        clock.advance(Duration.ofSeconds(1))
        adminPost("/api/admin/boards/$board/sharing-block")
        clock.advance(Duration.ofSeconds(1))
        adminDelete("/api/admin/boards/$board/sharing-block")
        clock.advance(Duration.ofSeconds(1))
        adminPost("/api/admin/boards/$board/trash")
        // Reading changes nothing and is not written.
        adminGet("/api/admin/boards/$board")

        val response = adminGet("/api/admin/actions").andExpect {
            jsonPath("$[*].action") {
                value(contains("trash-board", "unblock-sharing", "block-sharing", "unblock-user", "block-user"))
            }
            jsonPath("$[0].adminName") { value("Admin") }
            jsonPath("$[0].adminId") { value(admin.id.toString()) }
            jsonPath("$[0].targetKind") { value("board") }
            jsonPath("$[0].targetLabel") { value("Доска") }
            jsonPath("$[4].targetKind") { value("user") }
            jsonPath("$[4].targetLabel") { value("Bob") }
            jsonPath("$[4].targetId") { value(bob.id.toString()) }
        }.andReturn().response.contentAsString
        val third = Regex("\"createdAt\":\"([^\"]+)\"").findAll(response).toList()[2].groupValues[1]

        adminGet("/api/admin/actions?before=$third").andExpect {
            jsonPath("$[*].action") { value(contains("unblock-user", "block-user")) }
        }
    }

    @Test
    fun `the cleanup deletes entries of the journal and closed reports older than the retention`() {
        val board = createBoard(alice, "Старая")
        patchBoard(alice, board, """{"linkAccess": "public"}""")
        report(board, """{"reason": "spam"}""", "10.5.0.1")
        report(board, """{"reason": "abuse"}""", "10.5.0.2")
        adminPost("/api/admin/boards/$board/reports/resolve")
        report(board, """{"reason": "other"}""", "10.5.0.3")
        clock.advance(Duration.ofDays(366))
        adminPost("/api/admin/users/${bob.id}/block")

        assertEquals(AdminCleanup.Result(actions = 1, reports = 2), cleanup.cleanUp())

        adminGet("/api/admin/actions").andExpect { jsonPath("$[*].action") { value(contains("block-user")) } }
        // An open report waits for an administrator however old it is.
        adminGet("/api/admin/reports").andExpect { jsonPath("$[*].reason") { value(containsInAnyOrder("other")) } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["/api/admin/users", "/api/admin/boards", "/api/admin/reports", "/api/admin/actions"])
    fun `lists answer the administrator`(path: String) {
        adminGet(path).andExpect { status { isOk() } }
    }

    private fun adminGet(path: String): ResultActionsDsl = mockMvc.get(path) { with(admin.session()) }

    private fun adminPost(path: String): ResultActionsDsl = mockMvc.post(path) {
        with(admin.session())
        with(csrf())
    }

    private fun adminDelete(path: String): ResultActionsDsl = mockMvc.delete(path) {
        with(admin.session())
        with(csrf())
    }

    private fun report(board: String, body: String, address: String, user: User? = null): ResultActionsDsl =
        mockMvc.post("/api/public/boards/$board/reports") {
            if (user != null) with(user.session())
            with(csrf())
            with { request -> request.apply { remoteAddr = address } }
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private fun createBoard(owner: User, title: String): String = mockMvc.post("/api/boards") {
        with(owner.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"title": "$title"}"""
    }.andReturn().response.getHeader("Location")!!.substringAfterLast('/')

    private fun patchBoard(owner: User, board: String, body: String): ResultActionsDsl = mockMvc.patch("/api/boards/$board") {
        with(owner.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private fun enableEmbed(owner: User, board: String): ResultActionsDsl = mockMvc.put("/api/boards/$board/embed") {
        with(owner.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"pageId": "page-1"}"""
    }

    private fun blockedAt(user: User): OffsetDateTime? = jdbcClient.sql("SELECT blocked_at FROM users WHERE id = :id")
        .param("id", user.id)
        .query { rs, _ -> rs.getObject("blocked_at", OffsetDateTime::class.java) }
        .list()
        .single()

    private fun count(table: String): Int = jdbcClient.sql("SELECT count(*) FROM $table").query(Int::class.java).single()
}
