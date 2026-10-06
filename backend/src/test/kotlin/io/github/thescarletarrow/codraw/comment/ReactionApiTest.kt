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
import kotlin.test.assertEquals

@IntegrationTest
class ReactionApiTest(
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
    private lateinit var thread: String
    private lateinit var comment: String

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
        board = createBoard(alice)
        open(board, bob)
        open(board, carol)
        thread = start(board, bob, "Почему без кэша?")
        comment = firstComment(thread)
    }

    @Test
    fun `participants put reactions of the set on a comment, which come in the order of the set with who put them`() {
        react(alice, "eyes").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(thread) }
            jsonPath("$.comments[0].reactions[0].reaction") { value("eyes") }
        }
        clock.advance(Duration.ofSeconds(1))
        react(carol, "thumbs-up")
        clock.advance(Duration.ofSeconds(1))
        react(alice, "thumbs-up")

        threads(bob).andExpect {
            jsonPath("$[0].comments[0].reactions[*].reaction") { value(contains("thumbs-up", "eyes")) }
            jsonPath("$[0].comments[0].reactions[0].people[*].name") { value(contains("Carol", "Alice")) }
            jsonPath("$[0].comments[0].reactions[0].people[0].avatarUrl") { value("https://avatars.example.com/Carol.png") }
            jsonPath("$[0].comments[0].reactions[1].people[*].name") { value(contains("Alice")) }
        }
    }

    @Test
    fun `a reaction is put once and taken away by the user who put it only`() {
        react(alice, "heart")
        react(alice, "heart").andExpect { status { isOk() } }
        react(carol, "heart")

        unreact(alice, "heart").andExpect {
            status { isOk() }
            jsonPath("$.comments[0].reactions[0].people[*].name") { value(contains("Carol")) }
        }
        unreact(alice, "heart").andExpect { status { isOk() } }

        threads(alice).andExpect { jsonPath("$[0].comments[0].reactions[0].people[*].name") { value(contains("Carol")) } }
    }

    @Test
    fun `a comment without reactions has none, and the last reaction taken away leaves none`() {
        threads(alice).andExpect { jsonPath("$[0].comments[0].reactions") { value(empty<Any>()) } }

        react(alice, "party")
        unreact(alice, "party")

        threads(alice).andExpect { jsonPath("$[0].comments[0].reactions") { value(empty<Any>()) } }
    }

    @Test
    fun `every reaction of the set is taken, and nothing else`() {
        listOf("thumbs-up", "heart", "party", "smile", "eyes", "check").forEach { react(alice, it).andExpect { status { isOk() } } }

        react(alice, "fire").andExpect { status { isBadRequest() } }
        react(alice, "THUMBS_UP").andExpect { status { isBadRequest() } }
        unreact(alice, "fire").andExpect { status { isBadRequest() } }

        threads(alice).andExpect {
            jsonPath("$[0].comments[0].reactions[*].reaction") {
                value(contains("thumbs-up", "heart", "party", "smile", "eyes", "check"))
            }
        }
    }

    @Test
    fun `a viewer reacts, and the reaction notifies nobody`() {
        setLinkAccess("view")

        react(carol, "check").andExpect { status { isOk() } }

        assertNoNotifications()
    }

    @Test
    fun `the comment must be in the thread of the board`() {
        val other = createBoard(alice)
        val otherThread = start(other, alice, "Другая доска")

        put("/api/boards/$other/threads/$otherThread/comments/$comment/reactions/heart", alice).andExpect { status { isNotFound() } }
        put("/api/boards/$board/threads/$otherThread/comments/$comment/reactions/heart", alice).andExpect { status { isNotFound() } }
        put("/api/boards/$board/threads/$thread/comments/not-a-comment/reactions/heart", alice).andExpect { status { isNotFound() } }
    }

    @Test
    fun `nobody but the members reacts once the link is closed`() {
        setLinkAccess("none")

        react(bob, "heart").andExpect { status { isForbidden() } }
        react(alice, "heart").andExpect { status { isOk() } }
    }

    @Test
    fun `reactions go with their comment and with their user`() {
        react(carol, "heart")
        react(alice, "smile")
        val answer = reply(thread, alice, "Ответ")
        put("/api/boards/$board/threads/$thread/comments/$answer/reactions/heart", bob).andExpect { status { isOk() } }

        mockMvc.delete("/api/boards/$board/threads/$thread/comments/$answer") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        jdbcClient.sql("DELETE FROM users WHERE id = :id").param("id", carol.id).update()

        threads(alice).andExpect { jsonPath("$[0].comments[0].reactions[*].reaction") { value(contains("smile")) } }
        assertEquals(1, jdbcClient.sql("SELECT count(*) FROM comment_reactions").query(Int::class.java).single())
    }

    @Test
    fun `the reactions of a guest pass to the account they sign in with, once where both put the same`() {
        val guest = users.createGuest()
        open(board, guest)
        val dave = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Dave", "Dave", null))
        open(board, dave)
        react(dave, "thumbs-up")
        react(guest, "thumbs-up")
        react(guest, "eyes")

        users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Dave", "Dave", null), guest.id)

        threads(alice).andExpect {
            jsonPath("$[0].comments[0].reactions[0].people[*].name") { value(contains("Dave")) }
            jsonPath("$[0].comments[0].reactions[1].people[*].name") { value(contains("Dave")) }
        }
    }

    @Test
    fun `reacting needs the CSRF token`() {
        mockMvc.put("/api/boards/$board/threads/$thread/comments/$comment/reactions/heart") { with(alice.session()) }
            .andExpect { status { isForbidden() } }
    }

    private fun react(user: User, reaction: String) =
        put("/api/boards/$board/threads/$thread/comments/$comment/reactions/$reaction", user)

    private fun unreact(user: User, reaction: String) =
        mockMvc.delete("/api/boards/$board/threads/$thread/comments/$comment/reactions/$reaction") {
            with(user.session())
            with(csrf())
        }

    private fun assertNoNotifications() {
        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM notifications").query(Int::class.java).single())
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

    private fun reply(thread: String, user: User, body: String): String {
        val response = post("/api/boards/$board/threads/$thread/comments", user, json.writeValueAsString(mapOf("body" to body)))
            .andExpect { status { isCreated() } }
            .andReturn().response
        return json.readTree(response.contentAsString)["comments"].last()["id"].asString()
    }

    private fun firstComment(thread: String): String = jdbcClient.sql(
        "SELECT id::text FROM comments WHERE thread_id = :thread::uuid ORDER BY created_at, id LIMIT 1",
    ).param("thread", thread).query(String::class.java).single()

    private fun threads(user: User): ResultActionsDsl = mockMvc.get("/api/boards/$board/threads") { with(user.session()) }

    private fun put(path: String, user: User): ResultActionsDsl = mockMvc.put(path) {
        with(user.session())
        with(csrf())
    }

    private fun post(path: String, user: User, body: String): ResultActionsDsl = mockMvc.post(path) {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }
}
