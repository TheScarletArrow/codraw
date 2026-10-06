package io.github.thescarletarrow.codraw

import io.github.thescarletarrow.codraw.internal.InternalTokenInterceptor
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.Duration
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals

/** The limits of the installation, set small. */
@IntegrationTest
@TestPropertySource(
    properties = [
        "codraw.limits.boards-per-user=3",
        "codraw.limits.guests-per-address-per-hour=2",
        "codraw.limits.document-size=2KB",
        "codraw.limits.versions-size-per-board=1KB",
        "codraw.limits.members-per-board=2",
        "codraw.limits.invites-per-board=2",
    ],
)
class LimitsApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val clock: MutableClock,
    @Autowired private val registry: MeterRegistry,
) {

    private lateinit var alice: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
    }

    @Test
    fun `a user owns at most as many boards as the limit, and creates one again after deleting one`() {
        val boards = List(3) { createBoard(alice).andExpect { status { isCreated() } }.id() }
        val reached = limitsReached("boards")

        createBoard(alice).andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Board limit reached") }
            jsonPath("$.limit") { value(3) }
        }
        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect { jsonPath("$", hasSize<Any>(3)) }
        assertEquals(reached + 1, limitsReached("boards"))

        mockMvc.delete("/api/boards/${boards.first()}") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        createBoard(alice).andExpect { status { isCreated() } }
    }

    @Test
    fun `boards of a guest pass at sign-in beyond the limit`() {
        val guest = users.createGuest()
        repeat(2) { createBoard(guest).andExpect { status { isCreated() } } }
        repeat(3) { createBoard(alice).andExpect { status { isCreated() } } }

        users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Alice", "Alice", null), guest.id)

        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect { jsonPath("$", hasSize<Any>(5)) }
        createBoard(alice).andExpect { status { isConflict() } }
    }

    @Test
    fun `an address creates at most as many guests in an hour as the limit, then waits for the hour to end`() {
        guestFrom("192.0.2.1").andExpect { status { isNoContent() } }
        clock.advance(Duration.ofMinutes(20))
        guestFrom("192.0.2.1").andExpect { status { isNoContent() } }
        val reached = limitsReached("guests")

        guestFrom("192.0.2.1").andExpect {
            status { isTooManyRequests() }
            header { string("Retry-After", (40 * 60).toString()) }
        }
        assertEquals(reached + 1, limitsReached("guests"))
        guestFrom("192.0.2.2").andExpect { status { isNoContent() } }

        clock.advance(Duration.ofMinutes(40))
        guestFrom("192.0.2.1").andExpect { status { isNoContent() } }
    }

    @Test
    fun `a guest who continues with a live session does not count`() {
        val guest = users.createGuest()

        repeat(3) {
            mockMvc.post("/api/guest") {
                with(guest.session())
                with(csrf())
                with { request -> request.apply { remoteAddr = "192.0.2.3" } }
            }.andExpect { status { isNoContent() } }
        }
        guestFrom("192.0.2.3").andExpect { status { isNoContent() } }
    }

    @Test
    fun `collab cannot store a document state larger than the limit`() {
        val board = createBoard(alice).andExpect { status { isCreated() } }.id()
        storeDocument(board, ByteArray(2048) { 1 }).andExpect { status { isNoContent() } }
        val reached = limitsReached("document")

        storeDocument(board, ByteArray(2049) { 2 }).andExpect { status { isPayloadTooLarge() } }
        assertEquals(reached + 1, limitsReached("document"))

        val stored = jdbcClient.sql("SELECT state FROM board_documents WHERE board_id = :board::uuid")
            .param("board", board).query(ByteArray::class.java).single()
        assertContentEquals(ByteArray(2048) { 1 }, stored)
    }

    @Test
    fun `the owner cannot save a version larger than the limit`() {
        val board = createBoard(alice).andExpect { status { isCreated() } }.id()

        val reached = limitsReached("version")

        saveVersion(board, ByteArray(2049)).andExpect { status { isBadRequest() } }
        saveVersion(board, ByteArray(2048)).andExpect { status { isCreated() } }
        assertEquals(reached + 1, limitsReached("version"))
    }

    @Test
    fun `versions of a board take at most the limit together, and the most recent one stays whatever its size`() {
        val board = createBoard(alice).andExpect { status { isCreated() } }.id()
        repeat(3) { index ->
            clock.advance(Duration.ofSeconds(1))
            saveVersion(board, ByteArray(400) { index.toByte() }).andExpect { status { isCreated() } }
        }
        // 1200 bytes do not fit into 1 KB: the oldest version goes.
        assertEquals(listOf<Byte>(2, 1), versionFirstBytes(board))

        clock.advance(Duration.ofSeconds(1))
        saveVersion(board, ByteArray(1500) { 9 }).andExpect { status { isCreated() } }

        assertEquals(listOf<Byte>(9), versionFirstBytes(board))
    }

    @Test
    fun `a board has at most as many members as the limit, and a member who gets another role does not count again`() {
        val board = createBoard(alice).andExpect { status { isCreated() } }.id()
        val invitation = invite(board, "viewer").andExpect { status { isCreated() } }.token()
        val editing = invite(board, "editor").andExpect { status { isCreated() } }.token()
        val (bob, carol, dave) = listOf("Bob", "Carol", "Dave").map { users.gitHubUser(it) }
        accept(invitation, bob).andExpect { status { isOk() } }
        accept(invitation, carol).andExpect { status { isOk() } }
        val reached = limitsReached("members")

        accept(invitation, dave).andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Member limit reached") }
            jsonPath("$.limit") { value(2) }
        }
        assertEquals(reached + 1, limitsReached("members"))
        accept(editing, bob).andExpect { jsonPath("$.role") { value("editor") } }
        // The owner adds nobody beyond the limit either.
        mockMvc.get("/api/boards/$board") { with(dave.session()) }.andExpect { status { isOk() } }
        mockMvc.put("/api/boards/$board/members/${dave.id}") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "viewer"}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `a board has at most as many invitations as the limit, and a revoked one makes room`() {
        val board = createBoard(alice).andExpect { status { isCreated() } }.id()
        val first = invite(board, "editor").andExpect { status { isCreated() } }.id()
        invite(board, "viewer").andExpect { status { isCreated() } }
        val reached = limitsReached("invites")

        invite(board, "editor").andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Invitation limit reached") }
            jsonPath("$.limit") { value(2) }
        }
        assertEquals(reached + 1, limitsReached("invites"))

        mockMvc.delete("/api/boards/$board/invites/$first") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        invite(board, "editor").andExpect { status { isCreated() } }
    }

    @Test
    fun `a member who owns as many boards as the limit does not become the owner of another`() {
        val board = createBoard(alice).andExpect { status { isCreated() } }.id()
        val bob = users.gitHubUser("Bob")
        accept(invite(board, "editor").andExpect { status { isCreated() } }.token(), bob).andExpect { status { isOk() } }
        repeat(3) { createBoard(bob).andExpect { status { isCreated() } } }
        val reached = limitsReached("boards")

        mockMvc.put("/api/boards/$board/owner") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"userId": "${bob.id}"}"""
        }.andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Board limit reached") }
            jsonPath("$.limit") { value(3) }
        }
        assertEquals(reached + 1, limitsReached("boards"))
        mockMvc.get("/api/boards/$board") { with(alice.session()) }.andExpect { jsonPath("$.role") { value("owner") } }
    }

    private fun invite(board: String, role: String): ResultActionsDsl = mockMvc.post("/api/boards/$board/invites") {
        with(alice.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"role": "$role"}"""
    }

    private fun ResultActionsDsl.token(): String =
        Regex("\"path\":\"/invite/([^\"]+)\"").find(andReturn().response.contentAsString)!!.groupValues[1]

    private fun accept(token: String, user: User): ResultActionsDsl = mockMvc.post("/api/invites/$token/accept") {
        with(user.session())
        with(csrf())
    }

    private fun limitsReached(limit: String) = registry.get("codraw.limits.reached").tag("limit", limit).counter().count()

    private fun createBoard(owner: User): ResultActionsDsl = mockMvc.post("/api/boards") {
        with(owner.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"title": "Доска"}"""
    }

    private fun ResultActionsDsl.id(): String =
        Regex("\"id\":\"([^\"]+)\"").find(andReturn().response.contentAsString)!!.groupValues[1]

    private fun guestFrom(address: String): ResultActionsDsl = mockMvc.post("/api/guest") {
        with(csrf())
        with { request -> request.apply { remoteAddr = address } }
    }

    private fun storeDocument(board: String, state: ByteArray): ResultActionsDsl =
        mockMvc.put("/internal/boards/$board/document") {
            header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = state
        }

    private fun saveVersion(board: String, state: ByteArray): ResultActionsDsl =
        mockMvc.post("/api/boards/$board/versions") {
            with(alice.session())
            with(csrf())
            param("reason", "manual")
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = state
        }

    /** The first byte of the state of each version of the board, most recent first. */
    private fun versionFirstBytes(board: String): List<Byte> = jdbcClient.sql(
        "SELECT get_byte(state, 0) FROM board_versions WHERE board_id = :board::uuid ORDER BY created_at DESC, id DESC",
    ).param("board", board).query(Int::class.java).list().map { it!!.toByte() }
}
