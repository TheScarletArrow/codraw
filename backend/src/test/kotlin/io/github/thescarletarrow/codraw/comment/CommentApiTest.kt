package io.github.thescarletarrow.codraw.comment

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
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
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import kotlin.test.assertEquals

@IntegrationTest
class CommentApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val json: JsonMapper,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var carol: User
    private lateinit var board: String

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
        board = createBoard(alice)
    }

    @Test
    fun `a participant starts a thread about an element and another answers in it`() {
        open(board, bob)
        val createdAt = clock.instant()
        val thread = start(board, bob, cellId = "cell-api", body = "  Почему без кэша?  ")
        clock.advance(Duration.ofMinutes(1))

        reply(board, thread, alice, "Кэш будет позже").andExpect {
            status { isCreated() }
            jsonPath("$.comments[*].body") { value(contains("Почему без кэша?", "Кэш будет позже")) }
        }

        threads(board, bob).andExpect {
            status { isOk() }
            jsonPath("$") { value(hasSize<Any>(1)) }
            jsonPath("$[0].id") { value(thread) }
            jsonPath("$[0].pageId") { value("page-1") }
            jsonPath("$[0].cellId") { value("cell-api") }
            jsonPath("$[0].createdAt") { value(createdAt.toString()) }
            jsonPath("$[0].resolvedAt") { value(nullValue()) }
            jsonPath("$[0].comments[0].author.name") { value("Bob") }
            jsonPath("$[0].comments[0].author.avatarUrl") { value("https://avatars.example.com/Bob.png") }
            jsonPath("$[0].comments[0].editedAt") { value(nullValue()) }
            jsonPath("$[0].comments[1].author.name") { value("Alice") }
            jsonPath("$[0].comments[1].createdAt") { value(clock.instant().toString()) }
        }
    }

    @Test
    fun `threads come oldest first, about elements and about pages`() {
        val first = start(board, alice, cellId = "a")
        clock.advance(Duration.ofSeconds(1))
        val second = start(board, alice, pageId = "page-2", cellId = null)

        threads(board, alice).andExpect {
            jsonPath("$[*].id") { value(contains(first, second)) }
            jsonPath("$[1].pageId") { value("page-2") }
            jsonPath("$[1].cellId") { value(nullValue()) }
        }
    }

    @Test
    fun `a viewer comments, since comments do not change the diagram`() {
        setLinkAccess(board, "view")
        open(board, bob)

        val thread = start(board, bob, body = "Здесь опечатка")

        threads(board, alice).andExpect { jsonPath("$[0].id") { value(thread) } }
    }

    @Test
    fun `nobody but the owner reads or writes comments once the link is closed`() {
        val thread = start(board, alice)
        setLinkAccess(board, "none")

        threads(board, bob).andExpect { status { isForbidden() } }
        post("/api/boards/$board/threads", bob, """{"pageId": "page-1", "body": "Привет"}""").andExpect { status { isForbidden() } }
        reply(board, thread, bob, "Ответ").andExpect { status { isForbidden() } }
        threads(board, alice).andExpect { status { isOk() } }
    }

    @Test
    fun `a board that does not exist has no threads`() {
        threads("00000000-0000-0000-0000-000000000000", alice).andExpect { status { isNotFound() } }
        threads("not-a-board", alice).andExpect { status { isNotFound() } }
    }

    @Test
    fun `a thread of another board is not found through this one`() {
        val other = createBoard(alice)
        val thread = start(other, alice)

        reply(board, thread, alice, "Ответ").andExpect { status { isNotFound() } }
        mockMvc.get("/api/boards/$board/threads/$thread") { with(alice.session()) }.andExpect { status { isNotFound() } }
        resolve(board, thread, alice, true).andExpect { status { isNotFound() } }
        reply(board, "not-a-thread", alice, "Ответ").andExpect { status { isNotFound() } }
    }

    @Test
    fun `the author changes the text of their comment`() {
        val thread = start(board, alice, body = "Чревовато")
        clock.advance(Duration.ofMinutes(5))

        edit(board, thread, firstComment(thread), alice, "Чревато").andExpect {
            status { isOk() }
            jsonPath("$.comments[0].body") { value("Чревато") }
            jsonPath("$.comments[0].editedAt") { value(clock.instant().toString()) }
        }
    }

    @Test
    fun `nobody but the author changes a comment, not even the owner`() {
        open(board, bob)
        val thread = start(board, bob, body = "Мой текст")

        edit(board, thread, firstComment(thread), alice, "Чужой текст").andExpect { status { isForbidden() } }

        threads(board, bob).andExpect { jsonPath("$[0].comments[0].body") { value("Мой текст") } }
    }

    @Test
    fun `a participant who is not the owner cannot delete the comment of another`() {
        open(board, bob)
        open(board, carol)
        val thread = start(board, bob)
        val answer = replyId(board, thread, bob, "Ответ")

        delete(board, thread, answer, carol).andExpect { status { isForbidden() } }

        threads(board, bob).andExpect { jsonPath("$[0].comments") { value(hasSize<Any>(2)) } }
    }

    @Test
    fun `the author and the owner delete answers, and the thread stays`() {
        open(board, bob)
        val thread = start(board, alice)
        val bobAnswer = replyId(board, thread, bob, "От Боба")
        val secondAnswer = replyId(board, thread, bob, "Ещё от Боба")

        delete(board, thread, bobAnswer, bob).andExpect { status { isNoContent() } }
        delete(board, thread, secondAnswer, alice).andExpect { status { isNoContent() } }

        threads(board, alice).andExpect {
            jsonPath("$") { value(hasSize<Any>(1)) }
            jsonPath("$[0].comments") { value(hasSize<Any>(1)) }
        }
    }

    @Test
    fun `deleting the first comment deletes the whole thread`() {
        open(board, bob)
        val thread = start(board, bob)
        replyId(board, thread, alice, "Ответ")

        delete(board, thread, firstComment(thread), bob).andExpect { status { isNoContent() } }

        threads(board, alice).andExpect { jsonPath("$") { value(empty<Any>()) } }
    }

    @Test
    fun `any participant resolves a thread and opens it again`() {
        open(board, bob)
        val thread = start(board, alice)

        resolve(board, thread, bob, true).andExpect {
            status { isOk() }
            jsonPath("$.resolvedAt") { value(clock.instant().toString()) }
            jsonPath("$.resolvedBy.name") { value("Bob") }
        }
        resolve(board, thread, alice, false).andExpect {
            status { isOk() }
            jsonPath("$.resolvedAt") { value(nullValue()) }
            jsonPath("$.resolvedBy") { value(nullValue()) }
        }
    }

    @Test
    fun `a comment mentions participants of the board and drops everybody else`() {
        open(board, bob)

        start(board, alice, body = "@Bob @Carol посмотрите", mentions = listOf(bob, carol, alice)).let { thread ->
            threads(board, bob).andExpect {
                jsonPath("$[0].id") { value(thread) }
                jsonPath("$[0].comments[0].mentions[*].name") { value(contains("Alice", "Bob")) }
            }
        }
    }

    @Test
    fun `a changed comment mentions whom the new text mentions`() {
        open(board, bob)
        open(board, carol)
        val thread = start(board, alice, body = "@Bob", mentions = listOf(bob))

        edit(board, thread, firstComment(thread), alice, "@Carol", mentions = listOf(carol)).andExpect {
            jsonPath("$.comments[0].mentions[*].name") { value(contains("Carol")) }
        }
    }

    @Test
    fun `the people to mention are the owner first and then who opened the board`() {
        open(board, carol)
        clock.advance(Duration.ofMinutes(1))
        open(board, bob)

        people(board, bob).andExpect {
            status { isOk() }
            jsonPath("$[*].name") { value(contains("Alice", "Bob", "Carol")) }
            jsonPath("$[0].id") { value(alice.id.toString()) }
        }
    }

    @Test
    fun `once the link is closed only the owner is offered and kept as mentioned`() {
        open(board, bob)
        setLinkAccess(board, "none")

        people(board, alice).andExpect { jsonPath("$[*].name") { value(contains("Alice")) } }
        start(board, alice, body = "@Bob", mentions = listOf(bob))
        threads(board, alice).andExpect { jsonPath("$[0].comments[0].mentions") { value(empty<Any>()) } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["", "   "])
    fun `a comment needs some text`(body: String) {
        post("/api/boards/$board/threads", alice, """{"pageId": "page-1", "body": "$body"}""").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a comment has at most 4000 characters`() {
        val thread = start(board, alice, body = "а".repeat(4000))

        reply(board, thread, alice, "а".repeat(4001)).andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a thread needs a page and ids of reasonable length`() {
        post("/api/boards/$board/threads", alice, """{"pageId": "", "body": "Текст"}""").andExpect { status { isBadRequest() } }
        post("/api/boards/$board/threads", alice, """{"pageId": "${"p".repeat(101)}", "body": "Текст"}""")
            .andExpect { status { isBadRequest() } }
        post("/api/boards/$board/threads", alice, """{"pageId": "page-1", "cellId": "", "body": "Текст"}""")
            .andExpect { status { isBadRequest() } }
        post("/api/boards/$board/threads", alice, """{"body": "Текст"}""").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `the comments of a guest pass to the account they sign in with`() {
        val guest = users.createGuest()
        open(board, guest)
        val thread = start(board, guest, body = "Комментарий гостя")
        start(board, alice, body = "@Гость", mentions = listOf(guest))
        resolve(board, thread, guest, true)

        val dave = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Dave", "Dave", null), guest.id)

        threads(board, alice).andExpect {
            jsonPath("$[0].comments[0].author.id") { value(dave.id.toString()) }
            jsonPath("$[0].resolvedBy.id") { value(dave.id.toString()) }
            jsonPath("$[1].comments[0].mentions[0].id") { value(dave.id.toString()) }
        }
    }

    @Test
    fun `the comment of a deleted user stays without its author`() {
        open(board, bob)
        val thread = start(board, bob, body = "Остаюсь")

        jdbcClient.sql("DELETE FROM users WHERE id = :id").param("id", bob.id).update()

        threads(board, alice).andExpect {
            jsonPath("$[0].id") { value(thread) }
            jsonPath("$[0].comments[0].author") { value(nullValue()) }
            jsonPath("$[0].comments[0].body") { value("Остаюсь") }
        }
    }

    @Test
    fun `changing comments needs the CSRF token`() {
        mockMvc.post("/api/boards/$board/threads") {
            with(alice.session())
            contentType = MediaType.APPLICATION_JSON
            content = """{"pageId": "page-1", "body": "Текст"}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `comments need a sign-in`() {
        mockMvc.get("/api/boards/$board/threads").andExpect { status { isUnauthorized() } }
    }

    private fun createBoard(owner: User): String {
        val response = post("/api/boards", owner, """{"title": "Доска"}""").andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    /** Opens the board through its link, which makes the user a participant to mention. */
    private fun open(board: String, user: User) {
        mockMvc.get("/api/boards/$board") { with(user.session()) }.andExpect { status { isOk() } }
    }

    private fun setLinkAccess(board: String, linkAccess: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$linkAccess"}"""
        }.andExpect { status { isOk() } }
    }

    private fun start(
        board: String,
        user: User,
        pageId: String = "page-1",
        cellId: String? = "cell-1",
        body: String = "Комментарий",
        mentions: List<User> = emptyList(),
    ): String {
        val request = mapOf("pageId" to pageId, "cellId" to cellId, "body" to body, "mentions" to mentions.map { it.id })
        val response = post("/api/boards/$board/threads", user, json.writeValueAsString(request))
            .andExpect { status { isCreated() } }
            .andReturn().response
        val thread = json.readTree(response.contentAsString)["id"].asString()
        assertEquals("/api/boards/$board/threads/$thread", response.getHeader("Location"))
        return thread
    }

    private fun reply(board: String, thread: String, user: User, body: String): ResultActionsDsl =
        post("/api/boards/$board/threads/$thread/comments", user, json.writeValueAsString(mapOf("body" to body)))

    private fun replyId(board: String, thread: String, user: User, body: String): String {
        val response = reply(board, thread, user, body).andExpect { status { isCreated() } }.andReturn().response
        return json.readTree(response.contentAsString)["comments"].last()["id"].asString()
    }

    private fun firstComment(thread: String): String = jdbcClient.sql(
        "SELECT id::text FROM comments WHERE thread_id = :thread::uuid ORDER BY created_at, id LIMIT 1",
    ).param("thread", thread).query(String::class.java).single()

    private fun edit(board: String, thread: String, comment: String, user: User, body: String, mentions: List<User> = emptyList()) =
        mockMvc.patch("/api/boards/$board/threads/$thread/comments/$comment") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = json.writeValueAsString(mapOf("body" to body, "mentions" to mentions.map { it.id }))
        }

    private fun delete(board: String, thread: String, comment: String, user: User) =
        mockMvc.delete("/api/boards/$board/threads/$thread/comments/$comment") {
            with(user.session())
            with(csrf())
        }

    private fun resolve(board: String, thread: String, user: User, resolved: Boolean) =
        mockMvc.patch("/api/boards/$board/threads/$thread") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"resolved": $resolved}"""
        }

    private fun threads(board: String, user: User): ResultActionsDsl = mockMvc.get("/api/boards/$board/threads") { with(user.session()) }

    private fun people(board: String, user: User): ResultActionsDsl = mockMvc.get("/api/boards/$board/people") { with(user.session()) }

    private fun post(path: String, user: User, body: String): ResultActionsDsl = mockMvc.post(path) {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }
}
