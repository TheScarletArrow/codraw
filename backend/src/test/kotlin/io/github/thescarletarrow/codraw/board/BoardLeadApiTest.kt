package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.internal.InternalTokenInterceptor
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.ProviderProfile
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
import tools.jackson.databind.json.JsonMapper
import kotlin.test.assertEquals

@IntegrationTest
class BoardLeadApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val json: JsonMapper,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var carol: User
    private lateinit var dave: User
    private lateinit var board: String

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
        dave = users.gitHubUser("Dave")
        board = createBoard(alice)
    }

    @Test
    fun `the owner makes a viewer the lead, who becomes an editor, and dismisses them, who stays one`() {
        addMember(bob, "viewer")
        addMember(carol, "viewer")

        appoint(alice, bob).andExpect {
            status { isOk() }
            jsonPath("$[*].name") { value(contains("Alice", "Bob", "Carol")) }
            jsonPath("$[*].role") { value(contains("owner", "lead", "viewer")) }
        }
        mockMvc.get("/api/boards/$board") { with(bob.session()) }.andExpect { jsonPath("$.role") { value("lead") } }
        mockMvc.get("/api/boards/shared") { with(bob.session()) }.andExpect { jsonPath("$[0].role") { value("lead") } }

        appoint(alice, carol).andExpect { jsonPath("$[*].role") { value(contains("owner", "editor", "lead")) } }

        dismiss(alice).andExpect {
            status { isOk() }
            jsonPath("$[*].role") { value(contains("owner", "editor", "editor")) }
        }
        mockMvc.get("/api/boards/$board") { with(carol.session()) }.andExpect { jsonPath("$.role") { value("editor") } }
    }

    @Test
    fun `only a member becomes the lead, and only the owner chooses them`() {
        addMember(bob, "editor")
        addMember(carol, "editor")
        open(dave)

        appoint(alice, dave).andExpect { status { isNotFound() } }
        appoint(alice, alice).andExpect { status { isNotFound() } }
        members(alice).andExpect { jsonPath("$[*].role") { value(contains("owner", "editor", "editor")) } }

        appoint(carol, bob).andExpect { status { isForbidden() } }
        appoint(alice, bob).andExpect { status { isOk() } }
        appoint(bob, carol).andExpect { status { isForbidden() } }
        dismiss(bob).andExpect { status { isForbidden() } }
        members(alice).andExpect { jsonPath("$[1].role") { value("lead") } }
    }

    @Test
    fun `the lead renames the board, closes its link, and manages its members, invitations and live image`() {
        addMember(bob, "editor")
        addMember(carol, "viewer")
        open(dave)
        appoint(alice, bob).andExpect { status { isOk() } }

        mockMvc.get("/api/boards/$board/visitors") { with(bob.session()) }.andExpect {
            status { isOk() }
            jsonPath("$[*].name") { value(contains("Dave")) }
        }
        putMember(bob, dave, "editor").andExpect { status { isOk() } }
        putMember(bob, carol, "editor").andExpect { jsonPath("$.role") { value("editor") } }
        patch(bob, """{"title": "Платежи", "linkAccess": "none"}""").andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Платежи") }
            jsonPath("$.linkAccess") { value("none") }
            jsonPath("$.role") { value("lead") }
        }
        removeMember(bob, dave).andExpect { status { isNoContent() } }
        mockMvc.get("/api/boards/$board") { with(dave.session()) }.andExpect { status { isForbidden() } }

        val invite = mockMvc.post("/api/boards/$board/invites") {
            with(bob.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "viewer"}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        mockMvc.get("/api/boards/$board/invites") { with(bob.session()) }.andExpect { jsonPath("$") { value(hasSize<Any>(1)) } }
        mockMvc.delete("/api/boards/$board/invites/${json.readTree(invite)["id"].asString()}") {
            with(bob.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        mockMvc.put("/api/boards/$board/embed") {
            with(bob.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"pageId": "page-1"}"""
        }.andExpect { status { isOk() } }
        mockMvc.delete("/api/boards/$board/embed") {
            with(bob.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
    }

    @Test
    fun `the lead neither deletes the board, nor gives it away, nor leaves being the lead, and an editor manages nothing`() {
        addMember(bob, "editor")
        addMember(carol, "editor")
        appoint(alice, bob).andExpect { status { isOk() } }

        mockMvc.delete("/api/boards/$board") {
            with(bob.session())
            with(csrf())
        }.andExpect { status { isForbidden() } }
        transfer(bob, carol).andExpect { status { isForbidden() } }
        removeMember(bob, bob).andExpect { status { isForbidden() } }

        patch(carol, """{"title": "Чужая"}""").andExpect { status { isForbidden() } }
        putMember(carol, bob, "viewer").andExpect { status { isForbidden() } }
        mockMvc.get("/api/boards/$board") { with(alice.session()) }.andExpect { jsonPath("$.title") { value("Доска") } }
        members(alice).andExpect { jsonPath("$[*].role") { value(contains("owner", "lead", "editor")) } }
    }

    @Test
    fun `the lead whom the owner removes from the members is no lead any more`() {
        addMember(bob, "editor")
        appoint(alice, bob).andExpect { status { isOk() } }

        removeMember(alice, bob).andExpect { status { isNoContent() } }
        addMember(bob, "editor")

        members(alice).andExpect { jsonPath("$[*].role") { value(contains("owner", "editor")) } }
        patch(bob, """{"title": "Чужая"}""").andExpect { status { isForbidden() } }
    }

    @Test
    fun `the lead who gets the board is no lead, and the previous owner stays an editor`() {
        addMember(bob, "editor")
        appoint(alice, bob).andExpect { status { isOk() } }

        transfer(alice, bob).andExpect {
            status { isOk() }
            jsonPath("$.role") { value("editor") }
        }

        members(bob).andExpect {
            jsonPath("$[*].name") { value(contains("Bob", "Alice")) }
            jsonPath("$[*].role") { value(contains("owner", "editor")) }
        }
        assertEquals(null, leadOf(board))
    }

    @Test
    fun `the lead whom the owner makes a viewer stays the lead and edits the document`() {
        addMember(bob, "editor")
        appoint(alice, bob).andExpect { status { isOk() } }

        putMember(alice, bob, "viewer").andExpect { jsonPath("$.role") { value("lead") } }

        mockMvc.get("/api/boards/$board") { with(bob.session()) }.andExpect { jsonPath("$.role") { value("lead") } }
        mockMvc.get("/internal/boards/$board/access") { header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN) }
            .andExpect { jsonPath("$.members['${bob.id}']") { value("editor") } }
    }

    @Test
    fun `the lead deletes the comments of others and moves their threads`() {
        addMember(bob, "editor")
        addMember(carol, "editor")
        appoint(alice, bob).andExpect { status { isOk() } }
        val thread = post(
            "/api/boards/$board/threads",
            carol,
            """{"pageId": "page-1", "point": {"x": 1, "y": 2}, "body": "Комментарий Кэрол"}""",
        ).andExpect { status { isCreated() } }.andReturn().response.let { json.readTree(it.contentAsString)["id"].asString() }
        val reply = post("/api/boards/$board/threads/$thread/comments", carol, """{"body": "Ответ Кэрол"}""")
            .andExpect { status { isCreated() } }
            .andReturn().response.let { json.readTree(it.contentAsString)["comments"].last()["id"].asString() }

        mockMvc.patch("/api/boards/$board/threads/$thread") {
            with(bob.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"point": {"x": 5, "y": 6}}"""
        }.andExpect { status { isOk() } }
        mockMvc.delete("/api/boards/$board/threads/$thread/comments/$reply") {
            with(bob.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        mockMvc.get("/api/boards/$board/threads") { with(carol.session()) }.andExpect {
            jsonPath("$[0].point.x") { value(5.0) }
            jsonPath("$[0].comments") { value(hasSize<Any>(1)) }
        }
    }

    @Test
    fun `a request for access notifies the owner and the lead, and the answer of the lead is read by both`() {
        addMember(bob, "editor")
        appoint(alice, bob).andExpect { status { isOk() } }
        patch(alice, """{"linkAccess": "none"}""").andExpect { status { isOk() } }
        // Bob has read that Alice made him a member.
        post("/api/notifications/read-all", bob, "").andExpect { status { isNoContent() } }

        val request = mockMvc.put("/api/boards/$board/access-request") {
            with(carol.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "editor"}"""
        }
            .andExpect { status { isOk() } }
            .andReturn().response.let { json.readTree(it.contentAsString)["id"].asString() }
        for (answering in listOf(alice, bob)) {
            mockMvc.get("/api/notifications") { with(answering.session()) }.andExpect {
                jsonPath("$.notifications[?(@.kind == 'access-request')].actor.name") { value(contains("Carol")) }
            }
        }
        mockMvc.get("/api/boards/$board/access-requests") { with(bob.session()) }.andExpect { jsonPath("$[0].id") { value(request) } }

        post("/api/boards/$board/access-requests/$request/grant", bob, """{"role": "editor"}""").andExpect { status { isOk() } }

        for (answering in listOf(alice, bob)) {
            mockMvc.get("/api/notifications/unread-count") { with(answering.session()) }.andExpect { jsonPath("$.count") { value(0) } }
        }
        mockMvc.get("/api/boards/$board") { with(carol.session()) }.andExpect { jsonPath("$.role") { value("editor") } }
    }

    @Test
    fun `a guest who is the lead stays the lead as the account they sign in with`() {
        val guest = users.createGuest()
        addMember(guest, "editor")
        appoint(alice, guest).andExpect { status { isOk() } }

        val erin = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Erin", "Erin", null), guest.id)

        members(alice).andExpect {
            jsonPath("$[1].name") { value("Erin") }
            jsonPath("$[1].role") { value("lead") }
        }
        patch(erin, """{"title": "Платежи"}""").andExpect { status { isOk() } }
    }

    /** Makes [user] a member: they open the board through its link, and the owner adds them. */
    private fun addMember(user: User, role: String) {
        open(user)
        putMember(alice, user, role).andExpect { status { isOk() } }
    }

    private fun appoint(by: User, lead: User): ResultActionsDsl = mockMvc.put("/api/boards/$board/lead") {
        with(by.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"userId": "${lead.id}"}"""
    }

    private fun dismiss(by: User): ResultActionsDsl = mockMvc.delete("/api/boards/$board/lead") {
        with(by.session())
        with(csrf())
    }

    private fun putMember(by: User, user: User, role: String): ResultActionsDsl =
        mockMvc.put("/api/boards/$board/members/${user.id}") {
            with(by.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "$role"}"""
        }

    private fun removeMember(by: User, user: User): ResultActionsDsl = mockMvc.delete("/api/boards/$board/members/${user.id}") {
        with(by.session())
        with(csrf())
    }

    private fun members(user: User): ResultActionsDsl = mockMvc.get("/api/boards/$board/members") { with(user.session()) }

    private fun transfer(by: User, to: User): ResultActionsDsl = mockMvc.put("/api/boards/$board/owner") {
        with(by.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"userId": "${to.id}"}"""
    }

    private fun patch(by: User, body: String): ResultActionsDsl = mockMvc.patch("/api/boards/$board") {
        with(by.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private fun open(user: User) {
        mockMvc.get("/api/boards/$board") { with(user.session()) }.andExpect { status { isOk() } }
    }

    private fun leadOf(board: String): String? =
        jdbcClient.sql("SELECT lead_id::text FROM boards WHERE id = :board::uuid").param("board", board).query(String::class.java).list().single()

    private fun post(path: String, user: User, body: String): ResultActionsDsl = mockMvc.post(path) {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private fun createBoard(owner: User): String {
        val response = post("/api/boards", owner, """{"title": "Доска"}""").andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }
}
