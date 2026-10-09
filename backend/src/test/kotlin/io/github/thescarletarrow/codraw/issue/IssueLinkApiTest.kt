package io.github.thescarletarrow.codraw.issue

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.hasSize
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
import java.time.Duration
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@IntegrationTest
class IssueLinkApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val json: JsonMapper,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var board: String
    private lateinit var cache: FakeGitHub.Issue

    @BeforeEach
    fun clean() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM issue_tracker_connections").update()
        jdbcClient.sql("DELETE FROM issue_creations").update()
        FakeGitHub.reset()
        FakeGitHub.account(ALICE_TOKEN, "alice-gh", "acme/shop", "acme/secret")
        FakeGitHub.account(BOB_TOKEN, "bob-gh", "acme/shop")
        FakeGitHub.privateRepository("acme/secret")
        cache = FakeGitHub.issue("acme/shop", 12, "Кэш для каталога")
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        board = createBoard(alice)
        connect(alice, ALICE_TOKEN)
        connect(bob, BOB_TOKEN)
        FakeGitHub.requests.clear()
    }

    @Test
    fun `the owner links an issue to an element once, and a viewer sees its number, title and state`() {
        val link = link(alice, element("api"), "acme/shop", 12).andExpect {
            status { isCreated() }
            jsonPath("$.pageId") { value("page-1") }
            jsonPath("$.cellId") { value("api") }
            jsonPath("$.threadId") { value(nullValue()) }
            jsonPath("$.tracker") { value("github") }
            jsonPath("$.repository") { value("acme/shop") }
            jsonPath("$.number") { value(12) }
            jsonPath("$.title") { value("Кэш для каталога") }
            jsonPath("$.state") { value("open") }
            jsonPath("$.url") { value("https://github.com/acme/shop/issues/12") }
            jsonPath("$.private") { value(false) }
            jsonPath("$.sync") { value("ok") }
            jsonPath("$.linkedBy.name") { value("Alice") }
            jsonPath("$.createdHere") { value(false) }
        }.id()
        // Linking it again brings the same link up to date.
        cache.title = "Кэш каталога"
        link(alice, element("api"), "acme/shop", 12).andExpect {
            status { isOk() }
            jsonPath("$.id") { value(link) }
            jsonPath("$.title") { value("Кэш каталога") }
        }

        setLinkAccess("view")
        open(bob)
        links(bob).andExpect {
            status { isOk() }
            jsonPath("$") { value(hasSize<Any>(1)) }
            jsonPath("$[0].title") { value("Кэш каталога") }
        }
        link(bob, element("api"), "acme/shop", 12).andExpect {
            status { isForbidden() }
            jsonPath("$.reason") { value("forbidden") }
        }
        unlink(bob, link).andExpect { status { isForbidden() } }
        unlink(alice, link).andExpect { status { isNoContent() } }
        links(alice).andExpect { jsonPath("$") { value(hasSize<Any>(0)) } }
    }

    @Test
    fun `a viewer links an issue to a thread, which they may unlink, and an issue of a private repository says so`() {
        setLinkAccess("view")
        open(bob)
        val thread = thread(alice)
        val bobs = link(bob, thread(thread), "acme/shop", 12).andExpect {
            status { isCreated() }
            jsonPath("$.threadId") { value(thread) }
            jsonPath("$.pageId") { value(nullValue()) }
        }.id()
        FakeGitHub.issue("acme/secret", 3, "Ротация ключей")
        link(alice, thread(thread), "acme/secret", 3).andExpect { jsonPath("$.private") { value(true) } }
        // Bob's token does not reach the private repository: he cannot link its issues, nor anything to an element.
        link(bob, thread(thread), "acme/secret", 3).andExpect { jsonPath("$.reason") { value("not-found") } }
        link(bob, element("api"), "acme/shop", 12).andExpect { status { isForbidden() } }
        link(alice, thread(UUID.randomUUID().toString()), "acme/shop", 12).andExpect {
            status { isNotFound() }
            jsonPath("$.reason") { value("no-thread") }
        }

        unlink(bob, bobs).andExpect { status { isNoContent() } }
        // Deleting the thread takes its links with it.
        jdbcClient.sql("DELETE FROM comment_threads").update()
        links(alice).andExpect { jsonPath("$") { value(hasSize<Any>(0)) } }
    }

    @Test
    fun `linking needs a connection, an issue the token reaches and a target, and a guest links nothing`() {
        jdbcClient.sql("DELETE FROM issue_tracker_connections WHERE user_id = :id").param("id", alice.id).update()
        link(alice, element("api"), "acme/shop", 12).andExpect {
            status { isConflict() }
            jsonPath("$.reason") { value("not-connected") }
        }
        connect(alice, ALICE_TOKEN)
        link(alice, element("api"), "acme/shop", 99).andExpect { jsonPath("$.reason") { value("not-found") } }
        FakeGitHub.issue("acme/shop", 14, "Обновить зависимости", pullRequest = true)
        link(alice, element("api"), "acme/shop", 14).andExpect { jsonPath("$.reason") { value("not-an-issue") } }
        link(alice, """"pageId": "page-1"""", "acme/shop", 12).andExpect { status { isBadRequest() } }
        link(alice, """"pageId": "page-1", "cellId": "api", "threadId": "${UUID.randomUUID()}"""", "acme/shop", 12)
            .andExpect { status { isBadRequest() } }
        link(alice, element("api"), "acme", 12).andExpect { status { isBadRequest() } }

        setLinkAccess("edit")
        val guest = users.createGuest()
        open(guest)
        links(guest).andExpect { status { isOk() } }
        link(guest, element("api"), "acme/shop", 12).andExpect { jsonPath("$.reason") { value("guest") } }
    }

    @Test
    fun `an issue created from CoDraw links back to its element, and a repeated request creates nothing`() {
        val request = UUID.randomUUID()
        val body = """
            {"requestId": "$request", "pageId": "page-1", "cellId": "api", "repository": "acme/shop",
             "title": "  Добавить кэш  ", "description": "Нужен Redis перед @catalog", "elementLabel": "API [v2]"}
        """
        val link = create(alice, body).andExpect {
            status { isCreated() }
            jsonPath("$.number") { value(13) }
            jsonPath("$.title") { value("Добавить кэш") }
            jsonPath("$.createdHere") { value(true) }
            jsonPath("$.cellId") { value("api") }
        }.id()
        val created = FakeGitHub.requests.single { it.method == "POST" }
        val sent = json.readTree(created.body)
        assertEquals("Добавить кэш", sent["title"].asString())
        assertEquals(
            "Нужен Redis перед @catalog\n\n---\nСоздано в CoDraw: [элемент «API \\[v2\\]» на доске «Доска»]" +
                "(https://codraw.example.com/boards/$board?page=page-1&cell=api)",
            sent["body"].asString(),
        )

        create(alice, body).andExpect {
            status { isOk() }
            jsonPath("$.id") { value(link) }
        }
        assertEquals(1, FakeGitHub.requests.count { it.method == "POST" })
        links(alice).andExpect { jsonPath("$") { value(hasSize<Any>(1)) } }
    }

    @Test
    fun `an issue created from a thread links back to it, and a request still creating its issue is not repeated`() {
        val thread = thread(alice)
        create(
            alice,
            """{"requestId": "${UUID.randomUUID()}", "threadId": "$thread", "repository": "acme/shop", "title": "Решить"}""",
        ).andExpect { status { isCreated() } }
        assertEquals(
            "Создано в CoDraw: [обсуждение на доске «Доска»](https://codraw.example.com/boards/$board?thread=$thread)",
            json.readTree(FakeGitHub.requests.single { it.method == "POST" }.body)["body"].asString(),
        )

        val request = UUID.randomUUID()
        jdbcClient.sql("INSERT INTO issue_creations (user_id, request_id, created_at) VALUES (:user, :request, :at)")
            .param("user", alice.id)
            .param("request", request)
            .param("at", clock.instant().atOffset(java.time.ZoneOffset.UTC))
            .update()
        val body = """{"requestId": "$request", "threadId": "$thread", "repository": "acme/shop", "title": "Ещё"}"""
        create(alice, body).andExpect {
            status { isConflict() }
            jsonPath("$.reason") { value("creation-in-progress") }
        }
        // A request that never finished is taken as lost.
        clock.advance(Duration.ofMinutes(3))
        create(alice, body).andExpect { status { isCreated() } }
    }

    @Test
    fun `a token that may not write creates nothing, and a failed request may be repeated`() {
        FakeGitHub.account(ALICE_TOKEN, "alice-gh", "acme/shop", writes = false)
        val body = """{"requestId": "${UUID.randomUUID()}", "pageId": "page-1", "cellId": "api", "repository": "acme/shop", "title": "Кэш"}"""
        create(alice, body).andExpect {
            status { isConflict() }
            jsonPath("$.reason") { value("tracker-forbidden") }
        }
        FakeGitHub.account(ALICE_TOKEN, "alice-gh", "acme/shop")
        create(alice, body).andExpect { status { isCreated() } }
        create(alice, body.replace("\"Кэш\"", "\"\"")).andExpect { status { isBadRequest() } }
    }

    @Test
    fun `links are brought up to date with the token of the user who linked them, at most once a minute`() {
        val link = link(alice, element("api"), "acme/shop", 12).id()
        FakeGitHub.requests.clear()

        cache.state = "closed"
        cache.stateReason = "completed"
        refresh(bob, link).andExpect { jsonPath("$[0].state") { value("open") } }
        assertTrue(FakeGitHub.requests.isEmpty())

        clock.advance(Duration.ofMinutes(2))
        refresh(bob, link).andExpect {
            status { isOk() }
            jsonPath("$[0].state") { value("closed") }
            jsonPath("$[0].stateReason") { value("completed") }
            jsonPath("$[0].sync") { value("ok") }
        }
        assertEquals(listOf(ALICE_TOKEN), FakeGitHub.requests.map { it.token })

        // The issue moved to another repository: GitHub redirects, and the link follows.
        val moved = FakeGitHub.transfer(cache, "acme/secret", 40)
        clock.advance(Duration.ofMinutes(2))
        refresh(alice, link).andExpect {
            jsonPath("$[0].repository") { value("acme/secret") }
            jsonPath("$[0].number") { value(40) }
            jsonPath("$[0].title") { value(moved.title) }
        }

        // The token no longer reaches the repository.
        FakeGitHub.forbid(ALICE_TOKEN, "acme/secret")
        clock.advance(Duration.ofMinutes(2))
        refresh(alice, link).andExpect {
            jsonPath("$[0].sync") { value("no-access") }
            jsonPath("$[0].title") { value(moved.title) }
        }

        // Ids of other boards are left out.
        refresh(alice, UUID.randomUUID().toString()).andExpect { jsonPath("$") { value(hasSize<Any>(0)) } }
    }

    @Test
    fun `a deleted issue and a disconnected user are told, and another user takes the link over on purpose`() {
        val link = link(alice, element("api"), "acme/shop", 12).id()
        cache.deleted = true
        clock.advance(Duration.ofMinutes(2))
        refresh(alice, link).andExpect { jsonPath("$[0].sync") { value("deleted") } }
        cache.deleted = false

        // A deleted issue stays deleted until somebody takes the link over.
        clock.advance(Duration.ofMinutes(2))
        refresh(alice, link).andExpect { jsonPath("$[0].sync") { value("deleted") } }
        takeOver(alice, link).andExpect { jsonPath("$.sync") { value("ok") } }

        mockMvc.delete("/api/issue-tracker/connection") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        links(alice).andExpect { jsonPath("$[0].sync") { value("disconnected") } }
        FakeGitHub.requests.clear()
        clock.advance(Duration.ofMinutes(2))
        refresh(alice, link).andExpect { jsonPath("$[0].sync") { value("disconnected") } }
        assertTrue(FakeGitHub.requests.isEmpty())

        // Bob may open the board but not edit it: he does not take over a link of an element.
        setLinkAccess("view")
        open(bob)
        takeOver(bob, link).andExpect { status { isForbidden() } }
        setLinkAccess("edit")
        takeOver(bob, link).andExpect {
            status { isOk() }
            jsonPath("$.linkedBy.name") { value("Bob") }
            jsonPath("$.sync") { value("ok") }
        }
        assertEquals(listOf(BOB_TOKEN), FakeGitHub.requests.map { it.token }.distinct())
    }

    @Test
    fun `nobody but participants sees the links of a board`() {
        link(alice, element("api"), "acme/shop", 12).andExpect { status { isCreated() } }
        setLinkAccess("none")
        links(bob).andExpect { status { isForbidden() } }
        refresh(bob, UUID.randomUUID().toString()).andExpect { status { isForbidden() } }
    }

    private fun element(cellId: String) = """"pageId": "page-1", "cellId": "$cellId""""

    private fun thread(threadId: String) = """"threadId": "$threadId""""

    private fun link(user: User, target: String, repository: String, number: Int): ResultActionsDsl =
        post("/api/boards/$board/issue-links", user, """{$target, "repository": "$repository", "number": $number}""")

    private fun create(user: User, body: String): ResultActionsDsl = post("/api/boards/$board/issues", user, body)

    private fun refresh(user: User, vararg ids: String): ResultActionsDsl =
        post("/api/boards/$board/issue-links/refresh", user, """{"ids": [${ids.joinToString { "\"$it\"" }}]}""")

    private fun takeOver(user: User, link: String): ResultActionsDsl =
        post("/api/boards/$board/issue-links/$link/take-over", user, "")

    private fun unlink(user: User, link: String): ResultActionsDsl = mockMvc.delete("/api/boards/$board/issue-links/$link") {
        with(user.session())
        with(csrf())
    }

    private fun links(user: User): ResultActionsDsl = mockMvc.get("/api/boards/$board/issue-links") { with(user.session()) }

    private fun thread(user: User): String =
        post("/api/boards/$board/threads", user, """{"pageId": "page-1", "cellId": "api", "body": "Где кэш?"}""")
            .andExpect { status { isCreated() } }
            .id()

    private fun connect(user: User, token: String) {
        mockMvc.put("/api/issue-tracker/connection") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"token": "$token"}"""
        }.andExpect { status { isOk() } }
    }

    private fun createBoard(owner: User): String {
        val response = post("/api/boards", owner, """{"title": "Доска"}""").andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    /** Opens the board through its link, which gives the user the role of the link. */
    private fun open(user: User) {
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

    private fun ResultActionsDsl.id(): String = json.readTree(andReturn().response.contentAsString)["id"].asString()

    private fun post(path: String, user: User, body: String): ResultActionsDsl = mockMvc.post(path) {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private companion object {
        const val ALICE_TOKEN = "github_pat_alice"
        const val BOB_TOKEN = "github_pat_bob"
    }
}
