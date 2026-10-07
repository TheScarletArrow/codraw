package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.internal.InternalTokenInterceptor
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
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.util.UUID
import kotlin.test.assertEquals

@IntegrationTest
class BoardSearchApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
) {

    private lateinit var alice: User
    private lateinit var bob: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
    }

    @Test
    fun `finds a board by the text of its document in any case and with «ё» as «е», with the line of the match`() {
        val board = createBoard(alice, "Схема\nusers\nemail_confirmed boolean\nЁлка")
        createBoard(alice, "Склад\nзаказы")

        search(alice, "EMAIL").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].boardId") { value(board) }
            jsonPath("$[0].fragment") { value("email_confirmed boolean") }
        }
        search(alice, "елк").andExpect { jsonPath("$[0].fragment") { value("Ёлка") } }
        search(alice, "  confirmed    BOOLEAN ").andExpect { jsonPath("$[0].boardId") { value(board) } }
    }

    @Test
    fun `a fragment keeps 40 characters of the line around the match and marks where the line goes on`() {
        val before = "а".repeat(50)
        val after = "б".repeat(50)
        createBoard(alice, "Начало\n${before}kafka$after\nКонец")
        createBoard(alice, "${"в".repeat(10)}redis${"г".repeat(10)}")

        search(alice, "kafka").andExpect {
            jsonPath("$[0].fragment") { value("…${"а".repeat(40)}kafka${"б".repeat(40)}…") }
        }
        search(alice, "redis").andExpect { jsonPath("$[0].fragment") { value("${"в".repeat(10)}redis${"г".repeat(10)}") } }
    }

    @Test
    fun `a fragment of a long text without line breaks is cut on both sides`() {
        createBoard(alice, "${"д".repeat(100)}postgres${"е".repeat(100)}")

        search(alice, "postgres").andExpect {
            jsonPath("$[0].fragment") { value("…${"д".repeat(40)}postgres${"е".repeat(40)}…") }
        }
    }

    @Test
    fun `a query does not match across two texts, and its percent and underscore are plain characters`() {
        createBoard(alice, "Заказы\nПлатежи\n100% готово")

        search(alice, "заказы платежи").andExpect { content { json("[]") } }
        search(alice, "0% г").andExpect { jsonPath("$.length()") { value(1) } }
        search(alice, "%%").andExpect { content { json("[]") } }
        search(alice, "_a").andExpect { content { json("[]") } }
    }

    @Test
    fun `finds the boards the user can open, their own, those they are a member of and those whose link opens to them`() {
        val own = createBoard(bob, "kafka своя")
        val throughLink = createBoard(alice, "kafka по ссылке")
        val member = createBoard(alice, "kafka участника")
        val closed = createBoard(alice, "kafka закрытая")
        createBoard(alice, "kafka не открывал")
        for (board in listOf(throughLink, member, closed)) open(board, bob)
        addMember(member, bob)
        changeLinkAccess(member, "none")
        changeLinkAccess(closed, "none")

        val found = search(bob, "kafka").andReturn().response.contentAsString
        assertEquals(
            setOf(own, throughLink, member),
            Regex("\"boardId\":\"([0-9a-f-]{36})\"").findAll(found).map { it.groupValues[1] }.toSet(),
        )
    }

    @Test
    fun `a board without a text for search is found by nothing`() {
        val board = createBoard(alice, null)
        storeDocument(board)

        search(alice, "доска").andExpect { content { json("[]") } }
    }

    @Test
    fun `a query shorter than 2 characters finds nothing, and one longer than 100 is refused`() {
        createBoard(alice, "a b c")

        search(alice, " a ").andExpect {
            status { isOk() }
            content { json("[]") }
        }
        search(alice, "я".repeat(101)).andExpect { status { isBadRequest() } }
        search(alice, "я".repeat(100)).andExpect { status { isOk() } }
        mockMvc.get("/api/boards/search") { with(alice.session()) }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `search needs a session`() {
        mockMvc.get("/api/boards/search") { param("q", "kafka") }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `finds at most 100 boards`() {
        // More boards than a user may create, as after a guest passed theirs.
        jdbcClient.sql(
            "INSERT INTO boards (title, owner_id, created_at, updated_at) SELECT 'Доска', :owner, now(), now() FROM generate_series(1, 101)",
        ).param("owner", alice.id).update()
        jdbcClient.sql(
            """
            INSERT INTO board_documents (board_id, state, updated_at, search_text)
            SELECT id, '\x01', now(), 'kafka' FROM boards WHERE owner_id = :owner
            """,
        ).param("owner", alice.id).update()

        search(alice, "kafka").andExpect { jsonPath("$.length()") { value(100) } }
    }

    @Test
    fun `a fragment does not cut a character outside the basic plane in half`() {
        val window = TextWindow(UUID.randomUUID(), "${"😀".repeat(21)}akafka", start = 1, full = false)

        val fragment = BoardSearchService.fragment(window, "kafka")

        assertEquals("…${"😀".repeat(19)}akafka", fragment)
    }

    private fun search(user: User, query: String): ResultActionsDsl = mockMvc.get("/api/boards/search") {
        with(user.session())
        param("q", query)
    }

    /** Creates a board of the [owner] whose stored document has the [text] for search. */
    private fun createBoard(owner: User, text: String?): String {
        val response = mockMvc.post("/api/boards") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Доска"}"""
        }.andExpect { status { isCreated() } }.andReturn().response
        val board = response.getHeader("Location")!!.substringAfterLast('/')
        if (text != null) {
            storeDocument(board)
            mockMvc.put("/internal/boards/$board/search-text") {
                header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
                contentType = MediaType("text", "plain", Charsets.UTF_8)
                content = text.toByteArray(Charsets.UTF_8)
            }.andExpect { status { isNoContent() } }
        }
        return board
    }

    private fun storeDocument(board: String) {
        mockMvc.put("/internal/boards/$board/document") {
            header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = byteArrayOf(1)
        }.andExpect { status { isNoContent() } }
    }

    private fun open(board: String, user: User) {
        mockMvc.get("/api/boards/$board") { with(user.session()) }.andExpect { status { isOk() } }
    }

    private fun addMember(board: String, user: User) {
        mockMvc.put("/api/boards/$board/members/${user.id}") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "viewer"}"""
        }.andExpect { status { isOk() } }
    }

    private fun changeLinkAccess(board: String, access: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$access"}"""
        }.andExpect { status { isOk() } }
    }
}
