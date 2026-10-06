package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
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
import kotlin.test.assertEquals

@IntegrationTest
class BoardMemberApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val boards: BoardService,
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
    fun `the owner adds a user who opened the board through its link, and every participant sees the members`() {
        val board = createBoard(alice)
        open(board, bob)
        clock.advance(Duration.ofMinutes(1))
        open(board, carol)

        putMember(board, alice, bob, "editor").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(bob.id.toString()) }
            jsonPath("$.name") { value("Bob") }
            jsonPath("$.role") { value("editor") }
        }
        clock.advance(Duration.ofMinutes(1))
        putMember(board, alice, carol, "viewer").andExpect { status { isOk() } }

        for (participant in listOf(alice, bob, carol)) {
            members(board, participant).andExpect {
                status { isOk() }
                jsonPath("$[*].name") { value(contains("Alice", "Bob", "Carol")) }
                jsonPath("$[*].role") { value(contains("owner", "editor", "viewer")) }
                jsonPath("$[0].avatarUrl") { value("https://avatars.example.com/Alice.png") }
            }
        }
    }

    @Test
    fun `the owner changes the role of a member, which the board gives them then`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")
        addMember(board, bob, "editor")

        putMember(board, alice, bob, "viewer").andExpect { jsonPath("$.role") { value("viewer") } }

        mockMvc.get("/api/boards/$board") { with(bob.session()) }.andExpect { jsonPath("$.role") { value("viewer") } }
    }

    @Test
    fun `a removed member keeps only what the link gives`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")
        addMember(board, bob, "editor")

        removeMember(board, alice, bob).andExpect { status { isNoContent() } }

        mockMvc.get("/api/boards/$board") { with(bob.session()) }.andExpect { status { isForbidden() } }
        members(board, alice).andExpect { jsonPath("$[*].name") { value(contains("Alice")) } }
        removeMember(board, alice, bob).andExpect { status { isNotFound() } }
    }

    @Test
    fun `nobody becomes a member who never opened the board, the owner neither`() {
        val board = createBoard(alice)

        putMember(board, alice, carol, "editor").andExpect { status { isNotFound() } }
        putMember(board, alice, alice, "editor").andExpect { status { isNotFound() } }
        mockMvc.put("/api/boards/$board/members/not-a-uuid") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "editor"}"""
        }.andExpect { status { isNotFound() } }

        members(board, alice).andExpect { jsonPath("$[*].name") { value(contains("Alice")) } }
    }

    @Test
    fun `a member gets no other role than editor or viewer`() {
        val board = createBoard(alice)
        addMember(board, bob, "viewer")

        putMember(board, alice, bob, "owner").andExpect { status { isBadRequest() } }

        members(board, alice).andExpect { jsonPath("$[1].role") { value("viewer") } }
    }

    @Test
    fun `only the owner manages members and sees who opened the board`() {
        val board = createBoard(alice)
        addMember(board, bob, "editor")
        open(board, carol)

        putMember(board, bob, carol, "editor").andExpect { status { isForbidden() } }
        removeMember(board, bob, bob).andExpect { status { isForbidden() } }
        mockMvc.get("/api/boards/$board/visitors") { with(bob.session()) }.andExpect { status { isForbidden() } }
        transfer(board, bob, carol).andExpect { status { isForbidden() } }
    }

    @Test
    fun `nobody without a role sees the members`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")

        members(board, carol).andExpect { status { isForbidden() } }
        members("0199a000-0000-7000-8000-000000000000", carol).andExpect { status { isNotFound() } }
    }

    @Test
    fun `the owner sees who opened the board through its link and is not a member yet, most recently first`() {
        val board = createBoard(alice)
        open(board, alice)
        open(board, bob)
        clock.advance(Duration.ofMinutes(1))
        open(board, carol)

        mockMvc.get("/api/boards/$board/visitors") { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$[*].name") { value(contains("Carol", "Bob")) }
            jsonPath("$[0].visitedAt") { value(clock.instant().toString()) }
        }

        putMember(board, alice, carol, "viewer").andExpect { status { isOk() } }
        mockMvc.get("/api/boards/$board/visitors") { with(alice.session()) }.andExpect {
            jsonPath("$[*].name") { value(contains("Bob")) }
        }
    }

    @Test
    fun `the owner makes a member the owner and stays on the board as an editor`() {
        val board = createBoard(alice)
        val updatedAt = clock.instant()
        clock.advance(Duration.ofMinutes(1))
        addMember(board, bob, "viewer")

        transfer(board, alice, bob).andExpect {
            status { isOk() }
            jsonPath("$.owner.id") { value(bob.id.toString()) }
            jsonPath("$.role") { value("editor") }
            jsonPath("$.updatedAt") { value(updatedAt.toString()) }
        }

        mockMvc.get("/api/boards/$board") { with(bob.session()) }.andExpect { jsonPath("$.role") { value("owner") } }
        mockMvc.get("/api/boards") { with(bob.session()) }.andExpect { jsonPath("$[*].id") { value(contains(board)) } }
        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect { content { json("[]") } }
        members(board, alice).andExpect {
            jsonPath("$[*].name") { value(contains("Bob", "Alice")) }
            jsonPath("$[*].role") { value(contains("owner", "editor")) }
        }
        // The new owner manages the board, the previous one no longer does.
        changeLinkAccess(board, "none", bob)
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Чужая"}"""
        }.andExpect { status { isForbidden() } }
        mockMvc.get("/api/boards/$board") { with(alice.session()) }.andExpect { jsonPath("$.role") { value("editor") } }
    }

    @Test
    fun `only a member becomes the owner`() {
        val board = createBoard(alice)
        open(board, carol)

        transfer(board, alice, carol).andExpect { status { isNotFound() } }
        transfer(board, alice, alice).andExpect { status { isNotFound() } }
        mockMvc.put("/api/boards/$board/owner") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"userId": "${UUID.randomUUID()}"}"""
        }.andExpect { status { isNotFound() } }

        assertEquals(alice.id, boards.find(UUID.fromString(board))?.ownerId)
    }

    @Test
    fun `changing members needs the CSRF token`() {
        val board = createBoard(alice)
        open(board, bob)

        mockMvc.put("/api/boards/$board/members/${bob.id}") {
            with(alice.session())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "editor"}"""
        }.andExpect { status { isForbidden() } }
        mockMvc.put("/api/boards/$board/owner") {
            with(alice.session())
            contentType = MediaType.APPLICATION_JSON
            content = """{"userId": "${bob.id}"}"""
        }.andExpect { status { isForbidden() } }

        members(board, alice).andExpect { jsonPath("$[*].name") { value(contains("Alice")) } }
    }

    @Test
    fun `members go with their board`() {
        val board = createBoard(alice)
        addMember(board, bob, "editor")

        mockMvc.delete("/api/boards/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM board_members").query(Int::class.java).single())
    }

    /** Makes [user] a member: they open the board through its link, and the owner adds them. */
    private fun addMember(board: String, user: User, role: String) {
        jdbcClient.sql("INSERT INTO board_visits (user_id, board_id, visited_at) VALUES (:user, :board::uuid, now())")
            .param("user", user.id)
            .param("board", board)
            .update()
        putMember(board, alice, user, role).andExpect { status { isOk() } }
    }

    private fun putMember(board: String, owner: User, user: User, role: String): ResultActionsDsl =
        mockMvc.put("/api/boards/$board/members/${user.id}") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "$role"}"""
        }

    private fun removeMember(board: String, owner: User, user: User): ResultActionsDsl =
        mockMvc.delete("/api/boards/$board/members/${user.id}") {
            with(owner.session())
            with(csrf())
        }

    private fun members(board: String, user: User): ResultActionsDsl =
        mockMvc.get("/api/boards/$board/members") { with(user.session()) }

    private fun transfer(board: String, owner: User, to: User): ResultActionsDsl =
        mockMvc.put("/api/boards/$board/owner") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"userId": "${to.id}"}"""
        }

    private fun changeLinkAccess(board: String, access: String, owner: User = alice) {
        mockMvc.patch("/api/boards/$board") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$access"}"""
        }.andExpect { status { isOk() } }
    }

    private fun open(board: String, user: User) {
        mockMvc.get("/api/boards/$board") { with(user.session()) }.andExpect { status { isOk() } }
    }

    private fun createBoard(owner: User): String {
        val response = mockMvc.post("/api/boards") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Доска"}"""
        }.andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }
}
