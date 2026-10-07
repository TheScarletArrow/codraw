package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertNull

@IntegrationTest
class BoardSearchTextApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
) {

    private lateinit var owner: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        owner = users.gitHubUser("Owner")
    }

    @Test
    fun `stores the text of a stored document, replacing the previous one, without changing the board`() {
        val board = createBoard()
        storeDocument(board)
        clock.advance(Duration.ofMinutes(5))

        putText(board, "Схема\nЗаказы").andExpect { status { isNoContent() } }
        putText(board, "Схема\nПлатежи").andExpect { status { isNoContent() } }

        assertEquals("Схема\nПлатежи", text(board))
        mockMvc.get("/api/boards/$board") { with(owner.session()) }.andExpect {
            jsonPath("$.updatedAt") { value(clock.instant().minus(Duration.ofMinutes(5)).toString()) }
        }
    }

    @Test
    fun `a board without a stored document or without a board has no text`() {
        val board = createBoard()

        putText(board, "Схема").andExpect { status { isNotFound() } }
        putText("0199a000-0000-7000-8000-000000000000", "Схема").andExpect { status { isNotFound() } }
        putText("not-a-uuid", "Схема").andExpect { status { isNotFound() } }
    }

    @Test
    fun `with If-None-Match a text is stored only while the document has none`() {
        val board = createBoard()
        storeDocument(board)

        putText(board, "Старый", onlyIfMissing = true).andExpect { status { isNoContent() } }
        putText(board, "Ещё старее", onlyIfMissing = true).andExpect { status { isPreconditionFailed() } }
        assertEquals("Старый", text(board))
        putText(createBoard(), "Нет документа", onlyIfMissing = true).andExpect { status { isNotFound() } }
    }

    @Test
    fun `a text of 100 000 characters is stored and a longer one is refused`() {
        val board = createBoard()
        storeDocument(board)

        putText(board, "я".repeat(100_001)).andExpect { status { isPayloadTooLarge() } }
        assertNull(text(board))
        putText(board, "я".repeat(100_000)).andExpect { status { isNoContent() } }
    }

    @Test
    fun `lists the boards with a document without a text by id, page by page`() {
        val boards = List(3) { createBoard().also(::storeDocument) }.sorted()
        val withText = createBoard().also(::storeDocument)
        putText(withText, "Есть")
        createBoard()

        missing(after = null, limit = 2).andExpect { jsonPath("$[*]") { value(contains(boards[0], boards[1])) } }
        missing(after = boards[1], limit = 2).andExpect { jsonPath("$[*]") { value(contains(boards[2])) } }
        missing(after = boards[2], limit = 2).andExpect { content { json("[]") } }
    }

    @Test
    fun `the internal API of texts requires the internal token`() {
        val board = createBoard()
        storeDocument(board)

        mockMvc.put("/internal/boards/$board/search-text") {
            contentType = MediaType.TEXT_PLAIN
            content = "Схема"
        }.andExpect { status { isUnauthorized() } }
        mockMvc.get("/internal/boards/without-search-text").andExpect { status { isUnauthorized() } }
        assertNull(text(board))
    }

    private fun putText(board: String, text: String, onlyIfMissing: Boolean = false): ResultActionsDsl =
        mockMvc.put("/internal/boards/$board/search-text") {
            header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
            if (onlyIfMissing) header("If-None-Match", "*")
            contentType = MediaType("text", "plain", Charsets.UTF_8)
            content = text.toByteArray(Charsets.UTF_8)
        }

    private fun missing(after: String?, limit: Int): ResultActionsDsl = mockMvc.get("/internal/boards/without-search-text") {
        header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
        if (after != null) param("after", after)
        param("limit", limit.toString())
    }

    private fun text(board: String): String? = jdbcClient.sql("SELECT search_text FROM board_documents WHERE board_id = :id::uuid")
        .param("id", board)
        .query(String::class.java)
        .list()
        .single()

    private fun storeDocument(board: String) {
        mockMvc.put("/internal/boards/$board/document") {
            header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = byteArrayOf(1)
        }.andExpect { status { isNoContent() } }
    }

    private fun createBoard(): String {
        val response = mockMvc.post("/api/boards") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Доска"}"""
        }.andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }
}
