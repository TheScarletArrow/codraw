package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
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
import java.time.Duration
import java.util.UUID
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

@IntegrationTest
class PublicBoardApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val documents: BoardDocumentService,
) {

    private val state = byteArrayOf(1, 2, 3, 0, -1)
    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var board: String

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        board = createBoard("Архитектура")
    }

    @Test
    fun `a board shown to anybody gives its title and its document without a sign-in, and creates nobody and no visit`() {
        changeLinkAccess("public")
        val usersBefore = count("users")

        mockMvc.get("/api/public/boards/$board").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(board) }
            jsonPath("$.title") { value("Архитектура") }
            jsonPath("$.updatedAt") { exists() }
            jsonPath("$.role") { doesNotExist() }
        }
        mockMvc.get("/api/public/boards/$board/document").andExpect { status { isNoContent() } }

        documents.save(UUID.fromString(board), state)
        val response = mockMvc.get("/api/public/boards/$board/document").andExpect {
            status { isOk() }
            content { contentType(MediaType.APPLICATION_OCTET_STREAM) }
            header { string("Cache-Control", "no-cache") }
            header { exists("ETag") }
        }.andReturn().response
        assertContentEquals(state, response.contentAsByteArray)

        assertEquals(usersBefore, count("users"))
        assertEquals(0, count("board_visits"))
    }

    @Test
    fun `the document answers 304 to its tag until the board is stored again`() {
        changeLinkAccess("public")
        documents.save(UUID.fromString(board), state)
        val tag = mockMvc.get("/api/public/boards/$board/document").andReturn().response.getHeader("ETag")!!

        mockMvc.get("/api/public/boards/$board/document") { header("If-None-Match", tag) }
            .andExpect { status { isNotModified() } }

        clock.advance(Duration.ofSeconds(5))
        documents.save(UUID.fromString(board), byteArrayOf(4, 5))
        val newer = mockMvc.get("/api/public/boards/$board/document") { header("If-None-Match", tag) }.andExpect {
            status { isOk() }
        }.andReturn().response
        assertContentEquals(byteArrayOf(4, 5), newer.contentAsByteArray)
        assertNotEquals(tag, newer.getHeader("ETag"))
    }

    @ParameterizedTest
    @ValueSource(strings = ["none", "view", "edit"])
    fun `a board that its link does not show without a sign-in is not found, with a session too`(linkAccess: String) {
        changeLinkAccess(linkAccess)
        documents.save(UUID.fromString(board), state)

        mockMvc.get("/api/public/boards/$board").andExpect { status { isNotFound() } }
        mockMvc.get("/api/public/boards/$board/document").andExpect { status { isNotFound() } }
        mockMvc.get("/api/public/boards/$board") { with(bob.session()) }.andExpect { status { isNotFound() } }
        mockMvc.get("/api/public/boards/$board") { with(alice.session()) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `a board in the trash, an unknown board and a wrong id are not found`() {
        changeLinkAccess("public")
        mockMvc.delete("/api/boards/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        for (id in listOf(board, "0199a000-0000-7000-8000-000000000000", "not-a-uuid")) {
            mockMvc.get("/api/public/boards/$id").andExpect { status { isNotFound() } }
            mockMvc.get("/api/public/boards/$id/document").andExpect { status { isNotFound() } }
        }
    }

    @Test
    fun `the API of boards stays closed without a sign-in`() {
        changeLinkAccess("public")

        mockMvc.get("/api/boards/$board").andExpect { status { isUnauthorized() } }
        mockMvc.get("/api/boards/$board/members").andExpect { status { isUnauthorized() } }
    }

    private fun changeLinkAccess(linkAccess: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$linkAccess"}"""
        }.andExpect { status { isOk() } }
    }

    private fun count(table: String) = jdbcClient.sql("SELECT count(*) FROM $table").query(Int::class.java).single()

    private fun createBoard(title: String): String = post("/api/boards", """{"title": "$title"}""")
        .andExpect { status { isCreated() } }.andReturn().response.getHeader("Location")!!.substringAfterLast('/')

    private fun post(path: String, body: String): ResultActionsDsl = mockMvc.post(path) {
        with(alice.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }
}
