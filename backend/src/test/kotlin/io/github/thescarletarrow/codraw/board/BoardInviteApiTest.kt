package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.matchesPattern
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
import java.time.Duration

@IntegrationTest
class BoardInviteApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
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
    fun `the owner creates invitations with a role, and lists them oldest first`() {
        val board = createBoard()

        invite(board, alice, "editor").andExpect {
            status { isCreated() }
            header { string("Location", matchesPattern("/api/boards/$board/invites/[0-9a-f-]{36}")) }
            jsonPath("$.path") { value(matchesPattern("/invite/[A-Za-z0-9_-]{22}")) }
            jsonPath("$.role") { value("editor") }
            jsonPath("$.createdAt") { value(clock.instant().toString()) }
        }
        clock.advance(Duration.ofMinutes(1))
        invite(board, alice, "viewer").andExpect { status { isCreated() } }

        mockMvc.get("/api/boards/$board/invites") { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$[*].role") { value(contains("editor", "viewer")) }
        }
    }

    @Test
    fun `whoever accepts an invitation becomes a member with its role and edits a board closed to others`() {
        val board = createBoard()
        changeLinkAccess(board, "none")
        val invitation = inviteToken(board, "editor")

        accept(invitation, bob).andExpect {
            status { isOk() }
            jsonPath("$.id") { value(board) }
            jsonPath("$.title") { value("Доска") }
            jsonPath("$.role") { value("editor") }
            jsonPath("$.owner.name") { value("Alice") }
        }

        mockMvc.get("/api/boards/$board") { with(bob.session()) }.andExpect { jsonPath("$.role") { value("editor") } }
        mockMvc.get("/api/boards/$board") { with(carol.session()) }.andExpect { status { isForbidden() } }
        mockMvc.get("/api/boards/$board/members") { with(alice.session()) }.andExpect {
            jsonPath("$[*].name") { value(contains("Alice", "Bob")) }
        }
    }

    @Test
    fun `an invitation raises a lower role, keeps a higher one and leaves the owner the owner`() {
        val board = createBoard()
        changeLinkAccess(board, "none")
        val editing = inviteToken(board, "editor")
        val viewing = inviteToken(board, "viewer")

        accept(viewing, bob).andExpect { jsonPath("$.role") { value("viewer") } }
        accept(editing, bob).andExpect { jsonPath("$.role") { value("editor") } }
        accept(viewing, bob).andExpect { jsonPath("$.role") { value("editor") } }
        accept(editing, alice).andExpect { jsonPath("$.role") { value("owner") } }

        mockMvc.get("/api/boards/$board/members") { with(alice.session()) }.andExpect {
            jsonPath("$[*].name") { value(contains("Alice", "Bob")) }
            jsonPath("$[*].role") { value(contains("owner", "editor")) }
        }
    }

    @Test
    fun `a revoked invitation is not valid any more, and who joined through it stays`() {
        val board = createBoard()
        changeLinkAccess(board, "none")
        invite(board, alice, "editor")
        val invitation = mockMvc.get("/api/boards/$board/invites") { with(alice.session()) }
            .andReturn().response.contentAsString
        val id = Regex(""""id":"([^"]+)"""").find(invitation)!!.groupValues[1]
        val token = Regex(""""path":"/invite/([^"]+)"""").find(invitation)!!.groupValues[1]
        accept(token, bob).andExpect { status { isOk() } }

        mockMvc.delete("/api/boards/$board/invites/$id") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        accept(token, carol).andExpect { status { isNotFound() } }
        mockMvc.get("/api/boards/$board") { with(bob.session()) }.andExpect { jsonPath("$.role") { value("editor") } }
        mockMvc.get("/api/boards/$board/invites") { with(alice.session()) }.andExpect { content { json("[]") } }
        mockMvc.delete("/api/boards/$board/invites/$id") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `an unknown invitation is not found`() {
        accept("AAAAAAAAAAAAAAAAAAAAAA", bob).andExpect { status { isNotFound() } }
        accept("short", bob).andExpect { status { isNotFound() } }
    }

    @Test
    fun `only the owner sees, creates and revokes invitations`() {
        val board = createBoard()
        val token = inviteToken(board, "editor")
        accept(token, bob).andExpect { status { isOk() } }

        mockMvc.get("/api/boards/$board/invites") { with(bob.session()) }.andExpect { status { isForbidden() } }
        invite(board, bob, "editor").andExpect { status { isForbidden() } }
    }

    @Test
    fun `accepting an invitation needs a sign-in and the CSRF token`() {
        val board = createBoard()
        val token = inviteToken(board, "editor")

        mockMvc.post("/api/invites/$token/accept") { with(csrf()) }.andExpect { status { isUnauthorized() } }
        mockMvc.post("/api/invites/$token/accept") { with(bob.session()) }.andExpect { status { isForbidden() } }

        mockMvc.get("/api/boards/$board/members") { with(alice.session()) }.andExpect {
            jsonPath("$[*].name") { value(contains("Alice")) }
        }
    }

    @Test
    fun `invitations go with their board`() {
        val board = createBoard()
        val token = inviteToken(board, "editor")

        mockMvc.delete("/api/boards/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        accept(token, bob).andExpect { status { isNotFound() } }
    }

    private fun invite(board: String, user: User, role: String): ResultActionsDsl =
        mockMvc.post("/api/boards/$board/invites") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "$role"}"""
        }

    /** Creates an invitation as the owner and returns its token. */
    private fun inviteToken(board: String, role: String): String {
        val response = invite(board, alice, role).andExpect { status { isCreated() } }.andReturn().response
        return Regex(""""path":"/invite/([^"]+)"""").find(response.contentAsString)!!.groupValues[1]
    }

    private fun accept(token: String, user: User): ResultActionsDsl = mockMvc.post("/api/invites/$token/accept") {
        with(user.session())
        with(csrf())
    }

    private fun changeLinkAccess(board: String, access: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$access"}"""
        }.andExpect { status { isOk() } }
    }

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
