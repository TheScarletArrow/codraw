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
import java.util.UUID
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

    @Test
    fun `collects who changed the stored document since the latest version, without repeats`() {
        val board = createBoard("Схема")
        val (anna, boris, vera) = listOf("Anna", "Boris", "Vera").map { users.gitHubUser(it).id }
        // The first change after the first store keeps that store as a version; the stores after it collect.
        putDocument(board, state).andExpect { status { isNoContent() } }

        putDocument(board, state, anna, boris).andExpect { status { isNoContent() } }
        putDocument(board, state, boris, vera).andExpect { status { isNoContent() } }
        putDocument(board, state).andExpect { status { isNoContent() } }

        assertEquals(listOf(anna, boris, vera), editors(board))
    }

    @Test
    fun `keeps the first 100 who changed the stored document`() {
        val board = createBoard("Схема")
        val ids = List(120) { UUID.randomUUID() }
        putDocument(board, state).andExpect { status { isNoContent() } }

        putDocument(board, state, *ids.take(60).toTypedArray()).andExpect { status { isNoContent() } }
        putDocument(board, state, *ids.drop(60).toTypedArray()).andExpect { status { isNoContent() } }

        assertEquals(ids.take(100), editors(board))
    }

    @ParameterizedTest
    @ValueSource(strings = ["not-a-uuid", "0199a000-0000-7000-8000-0000000000a1, Alice"])
    fun `rejects a store that names who changed the document by anything but ids`(editors: String) {
        val board = createBoard("Схема")
        putDocument(board, byteArrayOf(9)).andExpect { status { isNoContent() } }

        mockMvc.put(documentUrl(board)) {
            header(TOKEN_HEADER, IntegrationTest.INTERNAL_TOKEN)
            header(BoardDocumentController.EDITORS_HEADER, editors)
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = state
        }.andExpect { status { isBadRequest() } }

        val response = mockMvc.get(documentUrl(board)) { header(TOKEN_HEADER, IntegrationTest.INTERNAL_TOKEN) }
            .andReturn().response
        assertContentEquals(byteArrayOf(9), response.contentAsByteArray)
        assertEquals(emptyList(), editors(board))
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

    private fun putDocument(board: String, bytes: ByteArray, vararg editors: UUID) = mockMvc.put(documentUrl(board)) {
        header(TOKEN_HEADER, IntegrationTest.INTERNAL_TOKEN)
        if (editors.isNotEmpty()) header(BoardDocumentController.EDITORS_HEADER, editors.joinToString(", "))
        contentType = MediaType.APPLICATION_OCTET_STREAM
        content = bytes
    }

    /** Who changed the stored document of the board since its latest version, in the order of their first change. */
    private fun editors(board: String): List<UUID> = jdbcClient.sql(
        """
        SELECT editor FROM board_documents, unnest(editors) WITH ORDINALITY AS e (editor, n)
        WHERE board_id = :board::uuid ORDER BY n
        """,
    ).param("board", board).query(UUID::class.java).list().filterNotNull()

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
