package io.github.thescarletarrow.codraw.proposal

import com.nimbusds.jwt.SignedJWT
import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.board.BoardMembers
import io.github.thescarletarrow.codraw.board.MemberRole
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.internal.InternalTokenInterceptor
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import java.util.UUID
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNull

@IntegrationTest
class ProposalApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val members: BoardMembers,
    @Autowired private val json: JsonMapper,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var carol: User
    private lateinit var board: String

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM users WHERE provider = 'guest'").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
        board = createBoard(alice, "Схема БД")
    }

    @Test
    fun `a viewer proposes changes with a draft that starts as the stored document of the board`() {
        setLinkAccess("view")
        storeBoard(byteArrayOf(1, 2, 3))
        val createdAt = clock.instant()

        val response = propose(bob, """{"title": "  Добавить очередь  ", "description": "Между API и БД"}""")
            .andExpect {
                status { isCreated() }
                jsonPath("$.boardId") { value(board) }
                jsonPath("$.title") { value("Добавить очередь") }
                jsonPath("$.description") { value("Между API и БД") }
                jsonPath("$.status") { value("open") }
                jsonPath("$.author.id") { value(bob.id.toString()) }
                jsonPath("$.author.name") { value("Bob") }
                jsonPath("$.author.avatarUrl") { value("https://avatars.example.com/Bob.png") }
                jsonPath("$.createdAt") { value(createdAt.toString()) }
                jsonPath("$.decidedAt") { value(nullValue()) }
                jsonPath("$.decidedBy") { value(nullValue()) }
                jsonPath("$.comment") { value(nullValue()) }
            }.andReturn().response
        val proposal = response.id()

        assertEquals("/api/boards/$board/proposals/$proposal", response.getHeader("Location"))
        assertContentEquals(byteArrayOf(1, 2, 3), base(proposal, bob))
        assertContentEquals(byteArrayOf(1, 2, 3), loadDraft(proposal).andExpect { status { isOk() } }.bytes())
        // The draft is a copy: the board goes on without it.
        storeBoard(byteArrayOf(4))
        assertContentEquals(byteArrayOf(1, 2, 3), base(proposal, bob))
    }

    @Test
    fun `a proposal of a board without a stored document has empty documents`() {
        val proposal = propose(alice).id()

        mockMvc.get("/api/boards/$board/proposals/$proposal/base") { with(alice.session()) }
            .andExpect { status { isNoContent() } }
        loadDraft(proposal).andExpect { status { isNoContent() } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["   ", "121", "description"])
    fun `a title of 1 to 120 characters and a description of at most 2000 are required`(wrong: String) {
        val body = when (wrong) {
            "121" -> """{"title": "${"а".repeat(121)}"}"""
            "description" -> """{"title": "Очередь", "description": "${"а".repeat(2001)}"}"""
            else -> """{"title": "$wrong"}"""
        }

        propose(alice, body).andExpect { status { isBadRequest() } }

        assertEquals(0, count())
    }

    @Test
    fun `a title of 120 characters fits, and a blank description is none`() {
        propose(alice, """{"title": "${"а".repeat(120)}", "description": "  "}""").andExpect {
            status { isCreated() }
            jsonPath("$.description") { value(nullValue()) }
        }
    }

    @Test
    fun `nobody without a role on the board proposes changes or sees its proposals`() {
        val proposal = propose(alice).id()
        setLinkAccess("none")

        propose(bob).andExpect { status { isForbidden() } }
        list(bob).andExpect { status { isForbidden() } }
        get(proposal, bob).andExpect { status { isForbidden() } }
        mockMvc.get("/api/boards/0199a000-0000-7000-8000-000000000000/proposals") { with(alice.session()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `the owner and editors see all proposals, anybody else their own`() {
        setLinkAccess("view")
        members.put(id(board), carol.id, MemberRole.EDITOR, clock.instant())
        val dave = users.gitHubUser("Dave")
        val first = propose(bob, """{"title": "Первое"}""").id()
        val second = propose(dave, """{"title": "Второе"}""").id()

        list(alice).andExpect { jsonPath("$[*].title") { value(contains("Второе", "Первое")) } }
        list(carol).andExpect { jsonPath("$[*].id") { value(contains(second, first)) } }
        list(bob).andExpect { jsonPath("$[*].id") { value(contains(first)) } }
        get(first, carol).andExpect { status { isOk() } }
        get(second, bob).andExpect { status { isNotFound() } }
        mockMvc.get("/api/boards/$board/proposals/$second/base") { with(bob.session()) }
            .andExpect { status { isNotFound() } }
        token(second, bob).andExpect { status { isNotFound() } }
        get("not-a-uuid", alice).andExpect { status { isNotFound() } }
    }

    @Test
    fun `a proposal is not found through another board`() {
        val proposal = propose(alice).id()
        val other = createBoard(alice, "Другая")

        mockMvc.get("/api/boards/$other/proposals/$proposal") { with(alice.session()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `issues a token of the draft that names the proposal and no board`() {
        setLinkAccess("view")
        val proposal = propose(bob).id()

        val claims = SignedJWT.parse(token(proposal, alice).andExpect { status { isOk() } }.field("token")).jwtClaimsSet

        assertEquals(alice.id.toString(), claims.subject)
        assertEquals(proposal, claims.getStringClaim("proposal"))
        assertNull(claims.getStringClaim("board"))
        assertEquals(listOf("codraw-collab"), claims.audience)
    }

    @Test
    fun `accepting keeps the board as a version and closes the proposal, in one go`() {
        setLinkAccess("view")
        val proposal = propose(bob).id()
        clock.advance(Duration.ofMinutes(5))
        val acceptedAt = clock.instant()

        accept(proposal, alice, byteArrayOf(7, 7)).andExpect {
            status { isOk() }
            jsonPath("$.status") { value("accepted") }
            jsonPath("$.decidedAt") { value(acceptedAt.toString()) }
            jsonPath("$.decidedBy.id") { value(alice.id.toString()) }
        }

        mockMvc.get("/api/boards/$board/versions") { with(alice.session()) }.andExpect {
            jsonPath("$", hasSize<Any>(1))
            jsonPath("$[0].reason") { value("proposal") }
            jsonPath("$[0].createdAt") { value(acceptedAt.toString()) }
        }
        val version = versionIds().single()
        assertContentEquals(
            byteArrayOf(7, 7),
            mockMvc.get("/api/boards/$board/versions/$version") { with(alice.session()) }.bytes(),
        )
        accept(proposal, alice, byteArrayOf(8)).andExpect { status { isConflict() } }
        assertEquals(1, versionIds().size)
    }

    @Test
    fun `an editor accepts and declines, a viewer does neither, and only the author withdraws`() {
        setLinkAccess("view")
        members.put(id(board), carol.id, MemberRole.EDITOR, clock.instant())
        val first = propose(bob).id()
        val second = propose(bob).id()
        val dave = users.gitHubUser("Dave")
        members.put(id(board), dave.id, MemberRole.VIEWER, clock.instant())

        accept(first, bob, byteArrayOf(1)).andExpect { status { isForbidden() } }
        decline(first, bob, """{}""").andExpect { status { isForbidden() } }
        withdraw(first, alice).andExpect { status { isForbidden() } }
        withdraw(first, dave).andExpect { status { isNotFound() } }

        accept(first, carol, byteArrayOf(1)).andExpect { jsonPath("$.status") { value("accepted") } }
        decline(second, carol, """{"comment": "  Очередь уже есть  "}""").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("declined") }
            jsonPath("$.comment") { value("Очередь уже есть") }
            jsonPath("$.decidedBy.name") { value("Carol") }
        }
        withdraw(second, bob).andExpect { status { isConflict() } }
        assertEquals(1, versionIds().size)
    }

    @Test
    fun `the author withdraws an open proposal, which leaves the board and its versions alone`() {
        setLinkAccess("view")
        val proposal = propose(bob).id()

        withdraw(proposal, bob).andExpect {
            status { isOk() }
            jsonPath("$.status") { value("withdrawn") }
            jsonPath("$.decidedBy.id") { value(bob.id.toString()) }
        }

        decline(proposal, alice, """{}""").andExpect { status { isConflict() } }
        assertEquals(0, versionIds().size)
    }

    @Test
    fun `a comment of a declined proposal has at most 2000 characters, and an empty one is none`() {
        val proposal = propose(alice).id()

        decline(proposal, alice, """{"comment": "${"а".repeat(2001)}"}""").andExpect { status { isBadRequest() } }
        decline(proposal, alice, """{"comment": " "}""").andExpect { jsonPath("$.comment") { value(nullValue()) } }
    }

    @Test
    fun `accepting needs the state of the board`() {
        val proposal = propose(alice).id()

        accept(proposal, alice, ByteArray(0)).andExpect { status { isBadRequest() } }
        get(proposal, alice).andExpect { jsonPath("$.status") { value("open") } }
    }

    @Test
    fun `collab stores the draft while the proposal is open and not after`() {
        setLinkAccess("view")
        val proposal = propose(bob).id()

        storeDraft(proposal, byteArrayOf(5, 6)).andExpect { status { isNoContent() } }
        assertContentEquals(byteArrayOf(5, 6), loadDraft(proposal).bytes())

        withdraw(proposal, bob)
        storeDraft(proposal, byteArrayOf(9)).andExpect { status { isConflict() } }
        assertContentEquals(byteArrayOf(5, 6), loadDraft(proposal).bytes())

        storeDraft("0199a000-0000-7000-8000-000000000000", byteArrayOf(1)).andExpect { status { isNotFound() } }
        loadDraft("not-a-uuid").andExpect { status { isNotFound() } }
        mockMvc.get("/internal/proposals/$proposal/document").andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `collab learns the author of the draft, whether it is open and the access to its board`() {
        setLinkAccess("view")
        members.put(id(board), carol.id, MemberRole.EDITOR, clock.instant())
        val proposal = propose(bob).id()

        draftAccess(proposal).andExpect {
            status { isOk() }
            jsonPath("$.authorId") { value(bob.id.toString()) }
            jsonPath("$.open") { value(true) }
            jsonPath("$.board.ownerId") { value(alice.id.toString()) }
            jsonPath("$.board.linkAccess") { value("view") }
            jsonPath("$.board.members.${carol.id}") { value("editor") }
        }
        accept(proposal, alice, byteArrayOf(1))
        draftAccess(proposal).andExpect { jsonPath("$.open") { value(false) } }

        mockMvc.delete("/api/boards/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        draftAccess(proposal).andExpect { status { isNotFound() } }
        assertEquals(1, count())
        mockMvc.delete("/api/boards/trash/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        assertEquals(0, count())
    }

    @Test
    fun `a new proposal notifies the owner and the editors among the members, a decision its author`() {
        setLinkAccess("view")
        members.put(id(board), carol.id, MemberRole.EDITOR, clock.instant())
        val dave = users.gitHubUser("Dave")
        members.put(id(board), dave.id, MemberRole.VIEWER, clock.instant())

        val proposal = propose(bob, """{"title": "Добавить очередь"}""").id()

        for (reviewer in listOf(alice, carol)) {
            notifications(reviewer).andExpect {
                jsonPath("$.notifications", hasSize<Any>(1))
                jsonPath("$.notifications[0].kind") { value("proposal-created") }
                jsonPath("$.notifications[0].proposalId") { value(proposal) }
                jsonPath("$.notifications[0].snippet") { value("Добавить очередь") }
                jsonPath("$.notifications[0].actor.name") { value("Bob") }
                jsonPath("$.notifications[0].commentId") { value(nullValue()) }
            }
        }
        notifications(dave).andExpect { jsonPath("$.notifications") { value(empty<Any>()) } }
        notifications(bob).andExpect { jsonPath("$.notifications") { value(empty<Any>()) } }

        accept(proposal, carol, byteArrayOf(1))

        notifications(bob).andExpect {
            jsonPath("$.notifications[0].kind") { value("proposal-accepted") }
            jsonPath("$.notifications[0].actor.name") { value("Carol") }
            jsonPath("$.notifications[0].proposalId") { value(proposal) }
            jsonPath("$.notifications[0].readAt") { value(nullValue()) }
        }
        // Carol answered; Alice still has something to read: whose decision it was.
        assertEquals(listOf(true), readFlags(carol))
        assertEquals(listOf(false), readFlags(alice))
    }

    @Test
    fun `a declined proposal notifies its author, and a withdrawn one takes back the unread notifications about it`() {
        setLinkAccess("view")
        val declined = propose(bob, """{"title": "Первое"}""").id()
        val withdrawn = propose(bob, """{"title": "Второе"}""").id()

        decline(declined, alice, """{"comment": "Нет"}""")
        withdraw(withdrawn, bob)

        notifications(bob).andExpect {
            jsonPath("$.notifications", hasSize<Any>(1))
            jsonPath("$.notifications[0].kind") { value("proposal-declined") }
            jsonPath("$.notifications[0].snippet") { value("Первое") }
        }
        notifications(alice).andExpect { jsonPath("$.notifications[*].proposalId") { value(contains(declined)) } }
    }

    @Test
    fun `a notification about a proposal on a board the user can no longer open names no proposal`() {
        setLinkAccess("view")
        val proposal = propose(bob).id()
        accept(proposal, alice, byteArrayOf(1))

        setLinkAccess("none")

        notifications(bob).andExpect {
            jsonPath("$.notifications[0].kind") { value("proposal-accepted") }
            jsonPath("$.notifications[0].access") { value(false) }
            jsonPath("$.notifications[0].proposalId") { value(nullValue()) }
            jsonPath("$.notifications[0].snippet") { value(nullValue()) }
        }
    }

    @Test
    fun `a guest who signs in passes their proposals to the account`() {
        setLinkAccess("view")
        val guest = users.createGuest()
        val accepted = propose(guest).id()
        accept(accepted, alice, byteArrayOf(1))
        val open = propose(guest).id()

        val account = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Guesty", "Guesty", null), guest.id)

        list(account).andExpect { jsonPath("$[*].id") { value(contains(open, accepted)) } }
        get(open, account).andExpect { jsonPath("$.author.name") { value("Guesty") } }
        withdraw(open, account).andExpect { status { isOk() } }
    }

    @Test
    fun `a proposal goes with its author and stays without who decided it`() {
        setLinkAccess("view")
        members.put(id(board), carol.id, MemberRole.EDITOR, clock.instant())
        val dave = users.gitHubUser("Dave")
        val decided = propose(bob).id()
        accept(decided, carol, byteArrayOf(1))
        propose(dave)

        jdbcClient.sql("DELETE FROM users WHERE id IN (:carol, :dave)").param("carol", carol.id).param("dave", dave.id).update()

        list(alice).andExpect {
            jsonPath("$[*].id") { value(contains(decided)) }
            jsonPath("$[0].status") { value("accepted") }
            jsonPath("$[0].decidedBy") { value(nullValue()) }
        }
    }

    private fun propose(user: User, body: String = """{"title": "Предложение"}"""): ResultActionsDsl =
        post("/api/boards/$board/proposals", user, body)

    private fun list(user: User): ResultActionsDsl = mockMvc.get("/api/boards/$board/proposals") { with(user.session()) }

    private fun get(proposal: String, user: User): ResultActionsDsl =
        mockMvc.get("/api/boards/$board/proposals/$proposal") { with(user.session()) }

    private fun base(proposal: String, user: User): ByteArray =
        mockMvc.get("/api/boards/$board/proposals/$proposal/base") { with(user.session()) }
            .andExpect { status { isOk() } }
            .bytes()

    private fun token(proposal: String, user: User): ResultActionsDsl =
        mockMvc.post("/api/boards/$board/proposals/$proposal/collab-token") {
            with(user.session())
            with(csrf())
        }

    private fun accept(proposal: String, user: User, state: ByteArray): ResultActionsDsl =
        mockMvc.post("/api/boards/$board/proposals/$proposal/accept") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = state
        }

    private fun decline(proposal: String, user: User, body: String): ResultActionsDsl =
        post("/api/boards/$board/proposals/$proposal/decline", user, body)

    private fun withdraw(proposal: String, user: User): ResultActionsDsl =
        mockMvc.post("/api/boards/$board/proposals/$proposal/withdraw") {
            with(user.session())
            with(csrf())
        }

    private fun loadDraft(proposal: String): ResultActionsDsl = mockMvc.get("/internal/proposals/$proposal/document") {
        header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
    }

    private fun storeDraft(proposal: String, state: ByteArray): ResultActionsDsl =
        mockMvc.put("/internal/proposals/$proposal/document") {
            header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = state
        }

    private fun draftAccess(proposal: String): ResultActionsDsl = mockMvc.get("/internal/proposals/$proposal/access") {
        header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
    }

    private fun storeBoard(state: ByteArray) {
        mockMvc.put("/internal/boards/$board/document") {
            header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = state
        }.andExpect { status { isNoContent() } }
    }

    private fun notifications(user: User): ResultActionsDsl = mockMvc.get("/api/notifications") { with(user.session()) }

    private fun readFlags(user: User): List<Boolean> {
        val page = json.readTree(notifications(user).andReturn().response.contentAsString)["notifications"]
        return (0 until page.size()).map { !page[it]["readAt"].isNull }
    }

    private fun versionIds(): List<String> = jdbcClient.sql(
        "SELECT id::text FROM board_versions WHERE board_id = :board::uuid ORDER BY created_at DESC",
    ).param("board", board).query(String::class.java).list().filterNotNull()

    private fun count(): Int = jdbcClient.sql("SELECT count(*) FROM proposals").query(Int::class.java).single()

    private fun createBoard(owner: User, title: String): String = post("/api/boards", owner, """{"title": "$title"}""")
        .andExpect { status { isCreated() } }
        .id()

    private fun setLinkAccess(linkAccess: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$linkAccess"}"""
        }.andExpect { status { isOk() } }
    }

    private fun post(path: String, user: User, body: String): ResultActionsDsl = mockMvc.post(path) {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private fun id(board: String): UUID = UUID.fromString(board)

    private fun ResultActionsDsl.bytes(): ByteArray = andReturn().response.contentAsByteArray

    private fun ResultActionsDsl.field(name: String): String = json.readTree(andReturn().response.contentAsString)[name].asString()

    private fun ResultActionsDsl.id(): String = field("id")

    private fun MockHttpServletResponse.id(): String = json.readTree(contentAsString)["id"].asString()
}
