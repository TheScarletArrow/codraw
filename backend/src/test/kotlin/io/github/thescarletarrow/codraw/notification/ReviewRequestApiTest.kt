package io.github.thescarletarrow.codraw.notification

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
import java.time.Duration
import kotlin.test.assertEquals

@IntegrationTest
class ReviewRequestApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var carol: User
    private lateinit var board: String

    @BeforeEach
    fun cleanDatabase() {
        // Every notification is about a board: they go with the boards.
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
        board = createBoard(alice, "Схема БД")
    }

    @Test
    fun `an editor asks the owner to review an element, and the owner hears of it with its page and element`() {
        val createdAt = clock.instant()

        ask(board, bob, "page-2", "orders").andExpect { status { isNoContent() } }

        mockMvc.get("/api/notifications") { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.notifications") { value(hasSize<Any>(1)) }
            jsonPath("$.notifications[0].kind") { value("review-request") }
            jsonPath("$.notifications[0].boardId") { value(board) }
            jsonPath("$.notifications[0].access") { value(true) }
            jsonPath("$.notifications[0].boardTitle") { value("Схема БД") }
            jsonPath("$.notifications[0].pageId") { value("page-2") }
            jsonPath("$.notifications[0].cellId") { value("orders") }
            jsonPath("$.notifications[0].threadId") { value(nullValue()) }
            jsonPath("$.notifications[0].commentId") { value(nullValue()) }
            jsonPath("$.notifications[0].proposalId") { value(nullValue()) }
            jsonPath("$.notifications[0].snippet") { value(nullValue()) }
            jsonPath("$.notifications[0].actor.name") { value("Bob") }
            jsonPath("$.notifications[0].role") { value(nullValue()) }
            jsonPath("$.notifications[0].createdAt") { value(createdAt.toString()) }
            jsonPath("$.notifications[0].readAt") { value(nullValue()) }
        }
        assertEquals(1, unread(alice))
        assertEquals(0, unread(bob))
    }

    @Test
    fun `the owner asking for a review hears nothing of it`() {
        ask(board, alice, "page-1", "orders").andExpect { status { isNoContent() } }

        assertEquals(0, unread(alice))
    }

    @Test
    fun `only whoever edits the board asks for a review, with the ids of a page and an element`() {
        setLinkAccess(board, "view")
        ask(board, bob, "page-1", "orders").andExpect { status { isForbidden() } }
        setLinkAccess(board, "none")
        ask(board, carol, "page-1", "orders").andExpect { status { isForbidden() } }
        setLinkAccess(board, "edit")
        ask(board, bob, "", "orders").andExpect { status { isBadRequest() } }
        ask(board, bob, "page-1", "x".repeat(101)).andExpect { status { isBadRequest() } }
        ask("0199a000-0000-7000-8000-000000000999", bob, "page-1", "orders").andExpect { status { isNotFound() } }
        mockMvc.post("/api/boards/$board/review-requests") {
            with(bob.session())
            contentType = MediaType.APPLICATION_JSON
            content = """{"pageId": "page-1", "cellId": "orders"}"""
        }.andExpect { status { isForbidden() } }

        assertEquals(0, unread(alice))
        ask(board, bob, "page-1", "x".repeat(100)).andExpect { status { isNoContent() } }
        assertEquals(1, unread(alice))
    }

    @Test
    fun `the owner hears of an element once in the interval, whoever asks, and of another element or later again`() {
        ask(board, bob, "page-1", "orders").andExpect { status { isNoContent() } }
        clock.advance(Duration.ofMinutes(1))
        ask(board, carol, "page-1", "orders").andExpect { status { isNoContent() } }
        assertEquals(listOf("Bob"), actors(alice))

        // Another element, and the same id on another page, are other elements.
        ask(board, carol, "page-1", "users").andExpect { status { isNoContent() } }
        ask(board, carol, "page-2", "orders").andExpect { status { isNoContent() } }
        assertEquals(listOf("Carol", "Carol", "Bob"), actors(alice))

        clock.advance(Duration.ofMinutes(9).plusSeconds(1))
        ask(board, carol, "page-1", "orders").andExpect { status { isNoContent() } }
        mockMvc.get("/api/notifications") { with(alice.session()) }.andExpect {
            jsonPath("$.notifications[*].cellId") { value(contains("orders", "orders", "users", "orders")) }
            jsonPath("$.notifications[*].pageId") { value(contains("page-1", "page-2", "page-1", "page-1")) }
        }
    }

    @Test
    fun `the notifications about reviews go with their board`() {
        ask(board, bob, "page-1", "orders").andExpect { status { isNoContent() } }

        mockMvc.delete("/api/boards/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        assertEquals(0, unread(alice))
    }

    private fun ask(board: String, user: User, pageId: String, cellId: String): ResultActionsDsl =
        mockMvc.post("/api/boards/$board/review-requests") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"pageId": "$pageId", "cellId": "$cellId"}"""
        }

    private fun unread(user: User): Int {
        val response = mockMvc.get("/api/notifications/unread-count") { with(user.session()) }
            .andExpect { status { isOk() } }.andReturn().response
        return Regex("\"count\":(\\d+)").find(response.contentAsString)!!.groupValues[1].toInt()
    }

    /** The names of who caused the notifications of the user, newest first. */
    private fun actors(user: User): List<String> = jdbcClient.sql(
        """
        SELECT a.name FROM notifications n JOIN users a ON a.id = n.actor_id
        WHERE n.user_id = :userId ORDER BY n.id DESC
        """,
    ).param("userId", user.id).query(String::class.java).list().filterNotNull()

    private fun createBoard(owner: User, title: String): String {
        val response = mockMvc.post("/api/boards") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "$title"}"""
        }.andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    private fun setLinkAccess(board: String, linkAccess: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$linkAccess"}"""
        }.andExpect { status { isOk() } }
    }
}
