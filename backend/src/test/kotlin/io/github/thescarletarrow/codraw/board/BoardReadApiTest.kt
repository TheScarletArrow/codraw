package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.internal.BoardDocumentController
import io.github.thescarletarrow.codraw.internal.InternalTokenInterceptor
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.nullValue
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
import java.util.UUID
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals

@IntegrationTest
class BoardReadApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val members: BoardMembers,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var carol: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
    }

    @Test
    fun `the first visit has nothing to tell and nothing to compare with`() {
        val board = createBoard()

        start(board, bob).andExpect {
            status { isOk() }
            jsonPath("$.since") { value(nullValue()) }
            jsonPath("$.authors") { value(empty<Any>()) }
            jsonPath("$.baseline") { value(nullValue()) }
        }
        baseline(board, bob).andExpect { status { isNotFound() } }
        see(board, bob).andExpect { status { isNoContent() } }
        leave(board, bob).andExpect { status { isNoContent() } }
    }

    @Test
    fun `back after a pause, the user learns who changed the board and compares it with the board as they left it`() {
        val board = createBoard()
        store(board, byteArrayOf(1), alice)
        start(board, alice)
        clock.advance(Duration.ofMinutes(30))
        leave(board, alice)
        val left = clock.instant()

        // The first change after the pause keeps the stored document as an automatic version.
        clock.advance(Duration.ofHours(1))
        store(board, byteArrayOf(2), bob)
        clock.advance(Duration.ofMinutes(1))
        store(board, byteArrayOf(3), carol, bob)
        clock.advance(Duration.ofHours(20))

        start(board, alice).andExpect {
            status { isOk() }
            jsonPath("$.since") { value(left.toString()) }
            jsonPath("$.authors[*].name") { value(contains("Bob", "Carol")) }
            jsonPath("$.authors[0].id") { value(bob.id.toString()) }
            jsonPath("$.authors[0].avatarUrl") { value("https://avatars.example.com/Bob.png") }
            jsonPath("$.baseline.id") { value(onlyVersion(board)) }
            jsonPath("$.baseline.createdAt") { value((left + Duration.ofHours(1)).toString()) }
        }
        assertContentEquals(byteArrayOf(1), baselineState(board, alice))
    }

    @Test
    fun `a version saved right before leaving is the baseline of the changes made after`() {
        val board = createBoard()
        store(board, byteArrayOf(1), alice)
        start(board, alice)
        clock.advance(Duration.ofMinutes(1))
        val saved = saveVersion(board, alice, byteArrayOf(1, 1))
        clock.advance(Duration.ofSeconds(1))
        leave(board, alice)

        clock.advance(Duration.ofMinutes(1))
        store(board, byteArrayOf(2), bob)
        clock.advance(Duration.ofMinutes(1))

        start(board, alice).andExpect {
            jsonPath("$.authors[*].name") { value(contains("Bob")) }
            jsonPath("$.baseline.id") { value(saved) }
        }
        assertContentEquals(byteArrayOf(1, 1), baselineState(board, alice))
    }

    @Test
    fun `a version saved after changes made since the visit is no baseline, the latest version before the visit is`() {
        val board = createBoard()
        store(board, byteArrayOf(0))
        clock.advance(Duration.ofHours(1))
        store(board, byteArrayOf(1), alice)
        val before = onlyVersion(board)
        start(board, alice)
        clock.advance(Duration.ofMinutes(1))
        leave(board, alice)

        clock.advance(Duration.ofMinutes(1))
        store(board, byteArrayOf(2), bob)
        saveVersion(board, bob, byteArrayOf(2), "Релиз")
        clock.advance(Duration.ofMinutes(1))

        start(board, alice).andExpect {
            // The release names Alice, whose change it has, and Bob; Alice is left out of her own changes.
            jsonPath("$.authors[*].name") { value(contains("Bob")) }
            jsonPath("$.baseline.id") { value(before) }
        }
        assertContentEquals(byteArrayOf(0), baselineState(board, alice))
    }

    @Test
    fun `nothing changed when others only opened the board and saved a version without changing it`() {
        val board = createBoard()
        store(board, byteArrayOf(1), alice)
        clock.advance(Duration.ofMinutes(1))
        start(board, alice)
        leave(board, alice)

        clock.advance(Duration.ofHours(1))
        start(board, bob)
        saveVersion(board, bob, byteArrayOf(1))
        leave(board, bob)
        clock.advance(Duration.ofHours(1))

        start(board, alice).andExpect {
            jsonPath("$.authors") { value(empty<Any>()) }
            jsonPath("$.baseline") { value(nullValue()) }
        }
        baseline(board, alice).andExpect { status { isNotFound() } }
    }

    @Test
    fun `a change of the user's own stored after they left names nobody`() {
        val board = createBoard()
        store(board, byteArrayOf(1), alice)
        start(board, alice)
        leave(board, alice)
        // collab stores the last change of Alice a moment after she left.
        clock.advance(Duration.ofSeconds(2))
        store(board, byteArrayOf(2), alice)

        clock.advance(Duration.ofHours(1))

        start(board, alice).andExpect { jsonPath("$.authors") { value(empty<Any>()) } }
    }

    @Test
    fun `a visit goes on in a second tab, and a new one begins after leaving or after two minutes without reports`() {
        val board = createBoard()
        start(board, alice)
        leave(board, alice)
        val firstLeft = clock.instant()
        clock.advance(Duration.ofHours(1))
        start(board, alice).andExpect { jsonPath("$.since") { value(firstLeft.toString()) } }

        // A minute later, the first tab reports and a second one opens.
        clock.advance(Duration.ofMinutes(1))
        see(board, alice)
        clock.advance(Duration.ofSeconds(30))
        start(board, alice).andExpect { jsonPath("$.since") { value(firstLeft.toString()) } }

        // Both tabs are closed: the next opening begins a visit, however soon.
        leave(board, alice)
        val secondLeft = clock.instant()
        clock.advance(Duration.ofSeconds(5))
        start(board, alice).andExpect { jsonPath("$.since") { value(secondLeft.toString()) } }

        // The tab was killed without leaving: its last report ends the visit two minutes later.
        val lastReport = clock.instant()
        clock.advance(Duration.ofMinutes(3))
        start(board, alice).andExpect { jsonPath("$.since") { value(lastReport.toString()) } }
    }

    @Test
    fun `a viewer gets the state of the baseline of their visit and still no versions`() {
        val board = createBoard()
        changeLinkAccess(board, "view")
        store(board, byteArrayOf(1), alice)
        start(board, bob)
        leave(board, bob)

        clock.advance(Duration.ofHours(1))
        store(board, byteArrayOf(2), alice)
        clock.advance(Duration.ofHours(1))

        val baseline = start(board, bob).andExpect {
            status { isOk() }
            jsonPath("$.authors[*].name") { value(contains("Alice")) }
        }.andReturn().response.contentAsString.let { Regex(""""baseline":\{"id":"([^"]+)"""").find(it)!!.groupValues[1] }
        assertContentEquals(byteArrayOf(1), baselineState(board, bob))
        mockMvc.get("/api/boards/$board/versions") { with(bob.session()) }.andExpect { status { isForbidden() } }
        mockMvc.get("/api/boards/$board/versions/$baseline") { with(bob.session()) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `nobody without a role has visits, and an unknown board has none`() {
        val board = createBoard()
        changeLinkAccess(board, "none")

        start(board, bob).andExpect { status { isForbidden() } }
        see(board, bob).andExpect { status { isForbidden() } }
        leave(board, bob).andExpect { status { isForbidden() } }
        baseline(board, bob).andExpect { status { isForbidden() } }
        start("0199a000-0000-7000-8000-000000000000", bob).andExpect { status { isNotFound() } }
        assertEquals(0, reads(board))
    }

    @Test
    fun `the board forgets the visits of those whom a closed link leaves without a role, the owner and members stay`() {
        val board = createBoard()
        store(board, byteArrayOf(1), alice)
        for (user in listOf(alice, bob, carol)) {
            start(board, user)
            leave(board, user)
        }
        members.put(UUID.fromString(board), carol.id, MemberRole.VIEWER, clock.instant())
        changeLinkAccess(board, "view")
        assertEquals(3, reads(board))

        changeLinkAccess(board, "none")
        assertEquals(setOf(alice.id, carol.id), readers(board))

        clock.advance(Duration.ofDays(7))
        changeLinkAccess(board, "edit")
        store(board, byteArrayOf(2), alice)
        start(board, bob).andExpect { jsonPath("$.since") { value(nullValue()) } }
    }

    @Test
    fun `the board forgets the visits of a member whom the owner removes while its link is closed`() {
        val board = createBoard()
        changeLinkAccess(board, "none")
        members.put(UUID.fromString(board), bob.id, MemberRole.EDITOR, clock.instant())
        members.put(UUID.fromString(board), carol.id, MemberRole.EDITOR, clock.instant())
        start(board, bob)
        start(board, carol)
        changeLinkAccess(board, "view")

        // Carol keeps what the link gives.
        removeMember(board, carol)
        assertEquals(setOf(bob.id, carol.id), readers(board))

        changeLinkAccess(board, "none")
        assertEquals(setOf(bob.id), readers(board))
        removeMember(board, bob)
        assertEquals(emptySet(), readers(board))
    }

    @Test
    fun `a guest who signs in passes their visits to the account, which keeps the later visit of a board both were on`() {
        val board = createBoard()
        val other = createBoard()
        val dave = users.gitHubUser("Dave")
        start(board, dave)
        leave(board, dave)
        clock.advance(Duration.ofDays(6))
        val guest = users.createGuest()
        start(board, guest)
        leave(board, guest)
        val guestLeft = clock.instant()
        start(other, guest)
        leave(other, guest)

        users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Dave", "Dave", null), guest.id)

        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM board_reads WHERE user_id = :id").param("id", guest.id).query(Int::class.java).single())
        clock.advance(Duration.ofHours(1))
        start(board, dave).andExpect { jsonPath("$.since") { value(guestLeft.toString()) } }
        start(other, dave).andExpect { jsonPath("$.since") { value(guestLeft.toString()) } }
    }

    @Test
    fun `visits go with their board and their user`() {
        val board = createBoard()
        val guest = users.createGuest()
        start(board, guest)
        start(board, bob)

        jdbcClient.sql("DELETE FROM users WHERE id = :id").param("id", guest.id).update()
        assertEquals(setOf(bob.id), readers(board))

        mockMvc.delete("/api/boards/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        assertEquals(0, reads(board))
    }

    private fun start(board: String, user: User): ResultActionsDsl = mockMvc.post("/api/boards/$board/visit") {
        with(user.session())
        with(csrf())
    }

    private fun see(board: String, user: User): ResultActionsDsl = mockMvc.put("/api/boards/$board/visit") {
        with(user.session())
        with(csrf())
    }

    private fun leave(board: String, user: User): ResultActionsDsl = mockMvc.delete("/api/boards/$board/visit") {
        with(user.session())
        with(csrf())
    }

    private fun baseline(board: String, user: User): ResultActionsDsl =
        mockMvc.get("/api/boards/$board/visit/baseline") { with(user.session()) }

    private fun baselineState(board: String, user: User): ByteArray = baseline(board, user)
        .andExpect {
            status { isOk() }
            content { contentType(MediaType.APPLICATION_OCTET_STREAM) }
        }
        .andReturn().response.contentAsByteArray

    /** Stores the document as collab does, with the users who changed it since the previous store. */
    private fun store(board: String, state: ByteArray, vararg editors: User) {
        mockMvc.put("/internal/boards/$board/document") {
            header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
            if (editors.isNotEmpty()) header(BoardDocumentController.EDITORS_HEADER, editors.joinToString(", ") { it.id.toString() })
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = state
        }.andExpect { status { isNoContent() } }
    }

    /** Saves a version by hand and returns its id. */
    private fun saveVersion(board: String, user: User, state: ByteArray, name: String? = null): String {
        val response = mockMvc.post("/api/boards/$board/versions") {
            with(user.session())
            with(csrf())
            param("reason", "manual")
            if (name != null) param("name", name)
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = state
        }.andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    private fun onlyVersion(board: String): String = jdbcClient.sql(
        "SELECT id::text FROM board_versions WHERE board_id = :board::uuid",
    ).param("board", board).query(String::class.java).single()

    private fun changeLinkAccess(board: String, linkAccess: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$linkAccess"}"""
        }.andExpect { status { isOk() } }
    }

    private fun removeMember(board: String, user: User) {
        mockMvc.delete("/api/boards/$board/members/${user.id}") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
    }

    private fun readers(board: String): Set<UUID> = jdbcClient.sql(
        "SELECT user_id FROM board_reads WHERE board_id = :board::uuid",
    ).param("board", board).query(UUID::class.java).list().filterNotNull().toSet()

    private fun reads(board: String): Int = readers(board).size

    private fun createBoard(): String {
        val response = mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Доска"}"""
        }.andExpect { status { isCreated() } }.andReturn().response

        return response.getHeader("Location")!!.substringAfterLast('/')
    }
}
