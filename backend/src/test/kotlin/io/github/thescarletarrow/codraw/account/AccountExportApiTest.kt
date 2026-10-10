package io.github.thescarletarrow.codraw.account

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.board.BoardDocumentService
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@IntegrationTest
@TestPropertySource(properties = ["codraw.limits.exports-per-user-per-day=3"])
class AccountExportApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val boards: BoardService,
    @Autowired private val documents: BoardDocumentService,
) {

    private lateinit var alice: User
    private lateinit var bob: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM issue_tracker_connections").update()
        alice = users.gitHubUser("Alice-${System.nanoTime()}")
        bob = users.gitHubUser("Bob")
    }

    @Test
    fun `exports the profile, the boards, the comments and the secrets of the user without the token`() {
        val own = boards.create("Схема", alice.id)
        val others = boards.create("Чужая", bob.id)
        val thread = jdbcClient.sql("INSERT INTO comment_threads (board_id, page_id, created_at) VALUES (:board, 'page', now()) RETURNING id")
            .param("board", others.id).query(java.util.UUID::class.java).single()
        jdbcClient.sql("INSERT INTO comments (thread_id, author_id, body, created_at) VALUES (:thread, :user, 'Мой комментарий', now())")
            .param("thread", thread).param("user", alice.id).update()
        jdbcClient.sql("INSERT INTO comments (thread_id, author_id, body, created_at) VALUES (:thread, :user, 'Ответ Боба', now())")
            .param("thread", thread).param("user", bob.id).update()
        jdbcClient.sql(
            "INSERT INTO issue_tracker_connections (user_id, tracker, token, login, created_at) VALUES (:user, 'GITHUB', 'ghp_secret', 'alice', now())",
        ).param("user", alice.id).update()

        export(alice).andExpect {
            status { isOk() }
            jsonPath("$.profile.id") { value(alice.id.toString()) }
            jsonPath("$.profile.name") { value(alice.name) }
            jsonPath("$.boards[*].title") { value(contains("Схема")) }
            jsonPath("$.boards[0].id") { value(own.id.toString()) }
            jsonPath("$.comments[*].body") { value(contains("Мой комментарий")) }
            jsonPath("$.comments[0].boardTitle") { value("Чужая") }
            jsonPath("$.issueTrackers[0].login") { value("alice") }
            jsonPath("$.templates") { isArray() }
            jsonPath("$.libraries") { isArray() }
            jsonPath("$.decisions") { isArray() }
            content { string(not(containsString("ghp_secret"))) }
        }
    }

    @Test
    fun `gives the document of an own board, and nothing of a board of somebody else`() {
        val own = boards.create("Схема", alice.id)
        val empty = boards.create("Пустая", alice.id)
        val others = boards.create("Чужая", bob.id)
        documents.save(own.id!!, byteArrayOf(1, 2, 3))
        documents.save(others.id!!, byteArrayOf(4, 5, 6))

        mockMvc.get("/api/me/export/boards/${own.id}") { with(alice.session()) }.andExpect {
            status { isOk() }
            content { bytes(byteArrayOf(1, 2, 3)) }
        }
        mockMvc.get("/api/me/export/boards/${empty.id}") { with(alice.session()) }.andExpect { status { isNoContent() } }
        mockMvc.get("/api/me/export/boards/${others.id}") { with(alice.session()) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `lets a user export as many times a day as the limit allows`() {
        repeat(3) { export(alice).andExpect { status { isOk() } } }

        export(alice).andExpect {
            status { isTooManyRequests() }
            header { exists("Retry-After") }
        }
        export(bob).andExpect { status { isOk() } }
    }

    @Test
    fun `needs a CSRF token`() {
        mockMvc.post("/api/me/export") { with(alice.session()) }.andExpect { status { isForbidden() } }
    }

    private fun export(user: User): ResultActionsDsl = mockMvc.post("/api/me/export") {
        with(user.session())
        with(csrf())
    }
}
