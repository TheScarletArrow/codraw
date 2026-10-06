package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.hasSize
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

@IntegrationTest
class AccessRequestApiTest(
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
    fun `a user without access asks for editing, sees their request, and the owner sees it with their name`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")
        mockMvc.get("/api/boards/$board/access-request") { with(bob.session()) }.andExpect { status { isNoContent() } }

        ask(board, bob, "editor", "  Нужно поправить схему  ").andExpect {
            status { isOk() }
            jsonPath("$.userId") { value(bob.id.toString()) }
            jsonPath("$.role") { value("editor") }
            jsonPath("$.message") { value("Нужно поправить схему") }
            jsonPath("$.createdAt") { value(clock.instant().toString()) }
        }

        own(board, bob).andExpect {
            status { isOk() }
            jsonPath("$.role") { value("editor") }
            jsonPath("$.message") { value("Нужно поправить схему") }
        }
        pending(board, alice).andExpect {
            status { isOk() }
            jsonPath("$", hasSize<Any>(1))
            jsonPath("$[0].userId") { value(bob.id.toString()) }
            jsonPath("$[0].name") { value("Bob") }
            jsonPath("$[0].avatarUrl") { value("https://avatars.example.com/Bob.png") }
            jsonPath("$[0].role") { value("editor") }
        }
    }

    @Test
    fun `a new request replaces the earlier one, and the owner sees the requests oldest first`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")
        ask(board, bob, "viewer", "Посмотреть").andExpect { status { isOk() } }
        clock.advance(Duration.ofMinutes(1))
        ask(board, carol, "viewer").andExpect { status { isOk() } }
        clock.advance(Duration.ofMinutes(1))

        ask(board, bob, "editor", "Поправить").andExpect { status { isOk() } }

        pending(board, alice).andExpect {
            jsonPath("$[*].name") { value(contains("Carol", "Bob")) }
            jsonPath("$[*].role") { value(contains("viewer", "editor")) }
            jsonPath("$[0].message") { doesNotExist() }
            jsonPath("$[1].message") { value("Поправить") }
        }
    }

    @Test
    fun `a blank message is none, and a message longer than 500 characters is refused`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")

        ask(board, bob, "viewer", "   ").andExpect { jsonPath("$.message") { doesNotExist() } }
        ask(board, carol, "viewer", "а".repeat(501)).andExpect { status { isBadRequest() } }
        ask(board, carol, "viewer", " " + "а".repeat(500) + " ").andExpect { status { isOk() } }
        ask(board, carol, "owner").andExpect { status { isBadRequest() } }

        pending(board, alice).andExpect { jsonPath("$[*].name") { value(contains("Bob", "Carol")) } }
    }

    @Test
    fun `the user cancels their request, as often as they like`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")
        ask(board, bob, "editor").andExpect { status { isOk() } }

        repeat(2) { cancel(board, bob).andExpect { status { isNoContent() } } }

        own(board, bob).andExpect { status { isNoContent() } }
        pending(board, alice).andExpect { content { json("[]") } }
    }

    @Test
    fun `nobody asks for a role that the board gives them already`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "view")

        ask(board, bob, "viewer").andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Access already given") }
            jsonPath("$.role") { value("viewer") }
        }
        ask(board, alice, "editor").andExpect {
            status { isConflict() }
            jsonPath("$.role") { value("owner") }
        }
        changeLinkAccess(board, "edit")
        ask(board, bob, "editor").andExpect { jsonPath("$.role") { value("editor") } }

        pending(board, alice).andExpect { content { json("[]") } }
    }

    @Test
    fun `a viewer asks for editing`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "view")

        ask(board, bob, "editor", "Хочу помочь").andExpect { status { isOk() } }

        pending(board, alice).andExpect { jsonPath("$[0].role") { value("editor") } }
    }

    @Test
    fun `the owner gives editing, which makes the user a member, and the request is gone`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")
        val request = ask(board, bob, "editor").andExpect { status { isOk() } }.id()

        grant(board, alice, request, "editor").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(bob.id.toString()) }
            jsonPath("$.name") { value("Bob") }
            jsonPath("$.role") { value("editor") }
        }

        mockMvc.get("/api/boards/$board") { with(bob.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.role") { value("editor") }
        }
        own(board, bob).andExpect { status { isNoContent() } }
        pending(board, alice).andExpect { content { json("[]") } }
        grant(board, alice, request, "editor").andExpect { status { isNotFound() } }
    }

    @Test
    fun `the owner gives less than asked for, and the request is answered all the same`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")
        val request = ask(board, bob, "editor").andExpect { status { isOk() } }.id()

        grant(board, alice, request, "viewer").andExpect { jsonPath("$.role") { value("viewer") } }

        mockMvc.get("/api/boards/$board") { with(bob.session()) }.andExpect { jsonPath("$.role") { value("viewer") } }
        pending(board, alice).andExpect { content { json("[]") } }
    }

    @Test
    fun `the owner declines, the user still has no access and asks again`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")
        val request = ask(board, bob, "viewer").andExpect { status { isOk() } }.id()

        decline(board, alice, request).andExpect { status { isNoContent() } }

        own(board, bob).andExpect { status { isNoContent() } }
        mockMvc.get("/api/boards/$board") { with(bob.session()) }.andExpect { status { isForbidden() } }
        decline(board, alice, request).andExpect { status { isNotFound() } }
        ask(board, bob, "viewer").andExpect { status { isOk() } }
    }

    @Test
    fun `the owner answers only the request they saw, not the one that replaced it`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")
        val seen = ask(board, bob, "viewer").andExpect { status { isOk() } }.id()
        ask(board, bob, "editor").andExpect { status { isOk() } }

        grant(board, alice, seen, "viewer").andExpect { status { isNotFound() } }
        decline(board, alice, seen).andExpect { status { isNotFound() } }
        grant(board, alice, "not-a-uuid", "viewer").andExpect { status { isNotFound() } }

        mockMvc.get("/api/boards/$board") { with(bob.session()) }.andExpect { status { isForbidden() } }
        pending(board, alice).andExpect { jsonPath("$[0].role") { value("editor") } }
    }

    @Test
    fun `only the owner sees and answers the requests`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "view")
        open(board, carol)
        putMember(board, carol, "editor")
        val request = ask(board, bob, "editor").andExpect { status { isOk() } }.id()

        pending(board, carol).andExpect { status { isForbidden() } }
        grant(board, carol, request, "editor").andExpect { status { isForbidden() } }
        decline(board, carol, request).andExpect { status { isForbidden() } }
        pending(board, bob).andExpect { status { isForbidden() } }

        pending(board, alice).andExpect { jsonPath("$", hasSize<Any>(1)) }
    }

    @Test
    fun `a request needs an existing board and the CSRF token`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")

        ask("0199a000-0000-7000-8000-000000000000", bob, "viewer").andExpect { status { isNotFound() } }
        own("not-a-board", bob).andExpect { status { isNotFound() } }
        mockMvc.put("/api/boards/$board/access-request") {
            with(bob.session())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "viewer"}"""
        }.andExpect { status { isForbidden() } }

        own(board, bob).andExpect { status { isNoContent() } }
    }

    @Test
    fun `a link that gives the role asked for drops the request, and one that gives less keeps it`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")
        ask(board, bob, "editor").andExpect { status { isOk() } }
        ask(board, carol, "viewer").andExpect { status { isOk() } }

        changeLinkAccess(board, "view")

        pending(board, alice).andExpect { jsonPath("$[*].name") { value(contains("Bob")) } }
        own(board, carol).andExpect { status { isNoContent() } }

        changeLinkAccess(board, "edit")
        pending(board, alice).andExpect { content { json("[]") } }
    }

    @Test
    fun `a member who gets the role asked for, from the members or an invitation, asks no more`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "view")
        open(board, bob)
        ask(board, bob, "editor").andExpect { status { isOk() } }
        ask(board, carol, "editor").andExpect { status { isOk() } }

        putMember(board, bob, "viewer")
        pending(board, alice).andExpect { jsonPath("$[*].name") { value(contains("Bob", "Carol")) } }
        putMember(board, bob, "editor")
        accept(createInvite(board, "editor"), carol)

        pending(board, alice).andExpect { content { json("[]") } }
    }

    @Test
    fun `a member who becomes the owner asks for nothing any more`() {
        val board = createBoard(alice)
        open(board, bob)
        changeLinkAccess(board, "none")
        putMember(board, bob, "viewer")
        ask(board, bob, "editor").andExpect { status { isOk() } }

        mockMvc.put("/api/boards/$board/owner") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"userId": "${bob.id}"}"""
        }.andExpect { status { isOk() } }

        pending(board, bob).andExpect { content { json("[]") } }
    }

    @Test
    fun `requests go with their board`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")
        ask(board, bob, "editor").andExpect { status { isOk() } }

        mockMvc.delete("/api/boards/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM board_access_requests").query(Int::class.java).single())
    }

    private fun ask(board: String, user: User, role: String, message: String? = null): ResultActionsDsl =
        mockMvc.put("/api/boards/$board/access-request") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = if (message == null) """{"role": "$role"}""" else """{"role": "$role", "message": "$message"}"""
        }

    private fun own(board: String, user: User): ResultActionsDsl =
        mockMvc.get("/api/boards/$board/access-request") { with(user.session()) }

    private fun cancel(board: String, user: User): ResultActionsDsl =
        mockMvc.delete("/api/boards/$board/access-request") {
            with(user.session())
            with(csrf())
        }

    private fun pending(board: String, user: User): ResultActionsDsl =
        mockMvc.get("/api/boards/$board/access-requests") { with(user.session()) }

    private fun grant(board: String, owner: User, request: String, role: String): ResultActionsDsl =
        mockMvc.post("/api/boards/$board/access-requests/$request/grant") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "$role"}"""
        }

    private fun decline(board: String, owner: User, request: String): ResultActionsDsl =
        mockMvc.delete("/api/boards/$board/access-requests/$request") {
            with(owner.session())
            with(csrf())
        }

    private fun putMember(board: String, user: User, role: String) {
        mockMvc.put("/api/boards/$board/members/${user.id}") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "$role"}"""
        }.andExpect { status { isOk() } }
    }

    private fun createInvite(board: String, role: String): String {
        val response = mockMvc.post("/api/boards/$board/invites") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "$role"}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return Regex("\"path\":\"/invite/([^\"]+)\"").find(response)!!.groupValues[1]
    }

    private fun accept(token: String, user: User) {
        mockMvc.post("/api/invites/$token/accept") {
            with(user.session())
            with(csrf())
        }.andExpect { status { isOk() } }
    }

    private fun changeLinkAccess(board: String, access: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$access"}"""
        }.andExpect { status { isOk() } }
    }

    private fun open(board: String, user: User) {
        mockMvc.get("/api/boards/$board") { with(user.session()) }.andExpect { status { isOk() } }
    }

    private fun ResultActionsDsl.id(): String =
        Regex("\"id\":\"([^\"]+)\"").find(andReturn().response.contentAsString)!!.groupValues[1]

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
