package io.github.thescarletarrow.codraw.internal

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
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.Duration
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals

@IntegrationTest
class BoardDocumentApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
) {

    private val unknownBoard = "0199a000-0000-7000-8000-000000000000"
    private val state = byteArrayOf(1, 2, 3, 0, -1)
    private lateinit var owner: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        owner = users.gitHubUser("Owner")
    }

    @Test
    fun `returns 204 for a board without a document`() {
        val board = createBoard("Пустая")

        mockMvc.get(documentUrl(board)) { header(TOKEN_HEADER, IntegrationTest.INTERNAL_TOKEN) }
            .andExpect { status { isNoContent() } }
    }

    @Test
    fun `stores and returns the document`() {
        val board = createBoard("Схема")

        putDocument(board, state).andExpect { status { isNoContent() } }

        val response = mockMvc.get(documentUrl(board)) { header(TOKEN_HEADER, IntegrationTest.INTERNAL_TOKEN) }
            .andExpect {
                status { isOk() }
                content { contentType(MediaType.APPLICATION_OCTET_STREAM) }
            }.andReturn().response
        assertContentEquals(state, response.contentAsByteArray)
    }

    @Test
    fun `replaces the previous document`() {
        val board = createBoard("Схема")
        putDocument(board, byteArrayOf(9, 9))

        putDocument(board, state).andExpect { status { isNoContent() } }

        val response = mockMvc.get(documentUrl(board)) { header(TOKEN_HEADER, IntegrationTest.INTERNAL_TOKEN) }
            .andReturn().response
        assertContentEquals(state, response.contentAsByteArray)
    }

    @Test
    fun `storing a document marks the board as changed`() {
        val first = createBoard("A")
        clock.advance(Duration.ofMinutes(1))
        val second = createBoard("B")
        clock.advance(Duration.ofMinutes(1))

        putDocument(first, state)

        mockMvc.get("/api/boards") { with(owner.session()) }.andExpect {
            jsonPath("$[0].id") { value(first) }
            jsonPath("$[0].updatedAt") { value(clock.instant().toString()) }
            jsonPath("$[1].id") { value(second) }
        }
    }

    @ParameterizedTest
    @ValueSource(strings = ["0199a000-0000-7000-8000-000000000000", "not-a-uuid"])
    fun `returns 404 for an unknown board`(board: String) {
        mockMvc.get(documentUrl(board)) { header(TOKEN_HEADER, IntegrationTest.INTERNAL_TOKEN) }
            .andExpect { status { isNotFound() } }
        putDocument(board, state).andExpect { status { isNotFound() } }

        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM board_documents").query(Int::class.java).single())
    }

    @ParameterizedTest
    @ValueSource(strings = ["", "wrong-token"])
    fun `rejects requests without a valid internal token`(token: String) {
        val board = createBoard("Секрет")

        mockMvc.get(documentUrl(board)) { if (token.isNotEmpty()) header(TOKEN_HEADER, token) }
            .andExpect { status { isUnauthorized() } }
        mockMvc.put(documentUrl(board)) {
            if (token.isNotEmpty()) header(TOKEN_HEADER, token)
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = state
        }.andExpect { status { isUnauthorized() } }
        mockMvc.get(documentUrl(unknownBoard)).andExpect { status { isUnauthorized() } }

        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM board_documents").query(Int::class.java).single())
    }

    private fun documentUrl(board: String) = "/internal/boards/$board/document"

    private fun putDocument(board: String, bytes: ByteArray) = mockMvc.put(documentUrl(board)) {
        header(TOKEN_HEADER, IntegrationTest.INTERNAL_TOKEN)
        contentType = MediaType.APPLICATION_OCTET_STREAM
        content = bytes
    }

    private fun createBoard(title: String): String {
        val response = mockMvc.post("/api/boards") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "$title"}"""
        }.andExpect { status { isCreated() } }.andReturn().response

        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    private companion object {
        const val TOKEN_HEADER = "X-Internal-Token"
    }
}
