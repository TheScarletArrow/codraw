package io.github.thescarletarrow.codraw.comment

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.board.BoardMembers
import io.github.thescarletarrow.codraw.board.MemberRole
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
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
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

@IntegrationTest
class AssigneeApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val json: JsonMapper,
    @Autowired private val members: BoardMembers,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var carol: User
    private lateinit var board: String
    private lateinit var thread: String

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
        board = createBoard(alice)
        open(board, bob)
        thread = start(board, alice, "Поправь связь")
    }

    @Test
    fun `a participant assigns a thread to another, who is its assignee for everybody`() {
        assign(bob, alice).andExpect {
            status { isOk() }
            jsonPath("$.id") { value(thread) }
            jsonPath("$.assignee.id") { value(bob.id.toString()) }
            jsonPath("$.assignee.name") { value("Bob") }
            jsonPath("$.assignee.avatarUrl") { value("https://avatars.example.com/Bob.png") }
        }

        threads(bob).andExpect { jsonPath("$[0].assignee.name") { value("Bob") } }
    }

    @Test
    fun `a thread has no assignee at first, and none once it is taken away`() {
        threads(alice).andExpect { jsonPath("$[0].assignee") { value(nullValue()) } }
        assign(bob, alice)

        unassign(bob).andExpect {
            status { isOk() }
            jsonPath("$.assignee") { value(nullValue()) }
        }
        unassign(alice).andExpect { status { isOk() } }

        threads(alice).andExpect { jsonPath("$[0].assignee") { value(nullValue()) } }
    }

    @Test
    fun `another assignee takes the place of the previous one`() {
        open(board, carol)
        assign(bob, alice)

        assign(carol, bob).andExpect { jsonPath("$.assignee.name") { value("Carol") } }
    }

    @Test
    fun `a viewer takes a thread for themselves`() {
        setLinkAccess("view")

        assign(bob, bob).andExpect {
            status { isOk() }
            jsonPath("$.assignee.name") { value("Bob") }
        }
    }

    @Test
    fun `only those whom comments may mention are assigned`() {
        assign(carol, alice).andExpect { status { isNotFound() } }
        mockMvc.put("/api/boards/$board/threads/$thread/assignee") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"userId": "${UUID.randomUUID()}"}"""
        }.andExpect { status { isNotFound() } }

        members.put(UUID.fromString(board), carol.id, MemberRole.VIEWER, clock.instant())
        assign(carol, alice).andExpect { status { isOk() } }
    }

    @Test
    fun `an assignment needs a user`() {
        mockMvc.put("/api/boards/$board/threads/$thread/assignee") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `resolving and opening a thread again keep its assignee`() {
        assign(bob, alice)

        resolve(true).andExpect { jsonPath("$.assignee.name") { value("Bob") } }
        resolve(false).andExpect { jsonPath("$.assignee.name") { value("Bob") } }
    }

    @Test
    fun `an assignee who can no longer open the board stays the assignee and is not offered any more`() {
        assign(bob, alice)

        setLinkAccess("none")

        threads(alice).andExpect { jsonPath("$[0].assignee.name") { value("Bob") } }
        mockMvc.get("/api/boards/$board/people") { with(alice.session()) }
            .andExpect { jsonPath("$[*].name") { value(contains("Alice")) } }
        assign(bob, alice).andExpect { status { isNotFound() } }
    }

    @Test
    fun `a thread of a deleted assignee has none`() {
        assign(bob, alice)

        jdbcClient.sql("DELETE FROM users WHERE id = :id").param("id", bob.id).update()

        threads(alice).andExpect { jsonPath("$[0].assignee") { value(nullValue()) } }
    }

    @Test
    fun `the thread must be on the board, and the link open to others`() {
        val other = createBoard(alice)
        mockMvc.put("/api/boards/$other/threads/$thread/assignee") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"userId": "${alice.id}"}"""
        }.andExpect { status { isNotFound() } }
        mockMvc.delete("/api/boards/$board/threads/not-a-thread/assignee") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNotFound() } }

        setLinkAccess("none")
        assign(alice, bob).andExpect { status { isForbidden() } }
    }

    @Test
    fun `the threads assigned to a guest pass to the account they sign in with`() {
        val guest = users.createGuest()
        open(board, guest)
        assign(guest, alice)

        val dave = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Dave", "Dave", null), guest.id)

        threads(alice).andExpect { jsonPath("$[0].assignee.id") { value(dave.id.toString()) } }
    }

    @Test
    fun `assigning needs the CSRF token`() {
        assign(bob, alice)

        mockMvc.delete("/api/boards/$board/threads/$thread/assignee") { with(alice.session()) }
            .andExpect { status { isForbidden() } }

        threads(alice).andExpect { jsonPath("$[0].assignee.name") { value("Bob") } }
    }

    private fun assign(assignee: User, by: User): ResultActionsDsl = mockMvc.put("/api/boards/$board/threads/$thread/assignee") {
        with(by.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"userId": "${assignee.id}"}"""
    }

    private fun unassign(by: User): ResultActionsDsl = mockMvc.delete("/api/boards/$board/threads/$thread/assignee") {
        with(by.session())
        with(csrf())
    }

    private fun resolve(resolved: Boolean): ResultActionsDsl = mockMvc.patch("/api/boards/$board/threads/$thread") {
        with(alice.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"resolved": $resolved}"""
    }

    private fun createBoard(owner: User): String {
        val response = post("/api/boards", owner, """{"title": "Доска"}""").andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    /** Opens the board through its link, which makes the user a participant. */
    private fun open(board: String, user: User) {
        mockMvc.get("/api/boards/$board") { with(user.session()) }.andExpect { status { isOk() } }
    }

    private fun setLinkAccess(linkAccess: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$linkAccess"}"""
        }.andExpect { status { isOk() } }
    }

    private fun start(board: String, user: User, body: String): String {
        val response = post("/api/boards/$board/threads", user, json.writeValueAsString(mapOf("pageId" to "page-1", "body" to body)))
            .andExpect { status { isCreated() } }
            .andReturn().response
        return json.readTree(response.contentAsString)["id"].asString()
    }

    private fun threads(user: User): ResultActionsDsl = mockMvc.get("/api/boards/$board/threads") { with(user.session()) }

    private fun post(path: String, user: User, body: String): ResultActionsDsl = mockMvc.post(path) {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }
}
