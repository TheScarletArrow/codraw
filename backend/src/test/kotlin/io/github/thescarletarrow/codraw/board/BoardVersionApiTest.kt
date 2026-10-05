package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.internal.InternalTokenInterceptor
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.hasSize
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
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.Duration
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals

@IntegrationTest
class BoardVersionApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
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
    fun `the first stored document of a board makes no version`() {
        val board = createBoard()

        store(board, byteArrayOf(1))

        assertEquals(0, versionCount(board))
    }

    @Test
    fun `a change after a pause keeps the document from before it as a version`() {
        val board = createBoard()
        store(board, byteArrayOf(1, 1))
        clock.advance(Duration.ofHours(1))
        val changedAt = clock.instant()

        store(board, byteArrayOf(2))

        versions(board, alice).andExpect {
            jsonPath("$") { value(hasSize<Any>(1)) }
            jsonPath("$[0].reason") { value("auto") }
            jsonPath("$[0].createdAt") { value(changedAt.toString()) }
        }
        assertContentEquals(byteArrayOf(1, 1), versionState(board, onlyVersion(board)))
    }

    @Test
    fun `continuous work makes a version at least every 10 minutes, not on every change`() {
        val board = createBoard()

        repeat(31) { minute ->
            store(board, byteArrayOf(minute.toByte()))
            clock.advance(Duration.ofMinutes(1))
        }

        // Stores at minutes 0 to 30: the first has nothing to keep, then versions at minutes 1, 11 and 21.
        val states = versionIds(board).map { versionState(board, it).single().toInt() }
        assertEquals(listOf(20, 10, 0), states)
    }

    @Test
    fun `a board keeps its 100 most recent versions`() {
        val board = createBoard()
        val first = save(board, byteArrayOf(0), "manual")
        repeat(100) { index ->
            clock.advance(Duration.ofSeconds(1))
            save(board, byteArrayOf((index + 1).toByte()), "manual")
        }

        val ids = versionIds(board)
        assertEquals(100, ids.size)
        assertEquals(false, first in ids)
    }

    @Test
    fun `the owner lists the versions most recent first`() {
        val board = createBoard()
        val older = save(board, byteArrayOf(1), "manual")
        clock.advance(Duration.ofHours(1))
        val newer = save(board, byteArrayOf(2), "restore")

        versions(board, alice).andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(newer) }
            jsonPath("$[0].reason") { value("restore") }
            jsonPath("$[0].createdAt") { value(clock.instant().toString()) }
            jsonPath("$[1].id") { value(older) }
            jsonPath("$[1].reason") { value("manual") }
        }
    }

    @Test
    fun `the owner gets the state of a version`() {
        val board = createBoard()
        val version = save(board, byteArrayOf(7, 0, -1), "manual")

        mockMvc.get("/api/boards/$board/versions/$version") { with(alice.session()) }.andExpect {
            status { isOk() }
            content { contentType(MediaType.APPLICATION_OCTET_STREAM) }
        }
        assertContentEquals(byteArrayOf(7, 0, -1), versionState(board, version))
    }

    @Test
    fun `a version of another board or an unknown version is not found`() {
        val board = createBoard()
        val other = createBoard()
        val versionOfOther = save(other, byteArrayOf(1), "manual")

        mockMvc.get("/api/boards/$board/versions/$versionOfOther") { with(alice.session()) }
            .andExpect { status { isNotFound() } }
        mockMvc.get("/api/boards/$board/versions/not-a-uuid") { with(alice.session()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `only the owner sees and saves versions`() {
        val board = createBoard()
        val version = save(board, byteArrayOf(1), "manual")

        versions(board, bob).andExpect { status { isForbidden() } }
        mockMvc.get("/api/boards/$board/versions/$version") { with(bob.session()) }
            .andExpect { status { isForbidden() } }
        post(board, bob, byteArrayOf(2), "manual").andExpect { status { isForbidden() } }
        assertEquals(1, versionCount(board))
    }

    @Test
    fun `versions of an unknown board are not found`() {
        versions("0199a000-0000-7000-8000-000000000000", alice).andExpect { status { isNotFound() } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["auto", "MANUAL", ""])
    fun `rejects other reasons`(reason: String) {
        val board = createBoard()

        post(board, alice, byteArrayOf(1), reason).andExpect { status { isBadRequest() } }

        assertEquals(0, versionCount(board))
    }

    @Test
    fun `rejects an empty state`() {
        val board = createBoard()

        post(board, alice, byteArrayOf(), "manual").andExpect { status { isBadRequest() } }

        assertEquals(0, versionCount(board))
    }

    @Test
    fun `versions go with their board`() {
        val board = createBoard()
        save(board, byteArrayOf(1), "manual")

        mockMvc.delete("/api/boards/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM board_versions").query(Int::class.java).single())
    }

    private fun store(board: String, state: ByteArray) {
        mockMvc.put("/internal/boards/$board/document") {
            header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = state
        }.andExpect { status { isNoContent() } }
    }

    private fun post(board: String, user: User, state: ByteArray, reason: String): ResultActionsDsl =
        mockMvc.post("/api/boards/$board/versions") {
            with(user.session())
            with(csrf())
            param("reason", reason)
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = state
        }

    /** Saves a version as the owner and returns its id. */
    private fun save(board: String, state: ByteArray, reason: String): String {
        val response = post(board, alice, state, reason).andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    private fun versions(board: String, user: User): ResultActionsDsl =
        mockMvc.get("/api/boards/$board/versions") { with(user.session()) }

    private fun versionIds(board: String): List<String> = jdbcClient.sql(
        "SELECT id::text FROM board_versions WHERE board_id = :board::uuid ORDER BY created_at DESC, id DESC",
    ).param("board", board).query(String::class.java).list().filterNotNull()

    private fun onlyVersion(board: String): String = versionIds(board).single()

    private fun versionCount(board: String) = versionIds(board).size

    private fun versionState(board: String, version: String): ByteArray =
        mockMvc.get("/api/boards/$board/versions/$version") { with(alice.session()) }
            .andExpect { status { isOk() } }
            .andReturn().response.contentAsByteArray

    private fun createBoard(): String {
        val response = mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Доска"}"""
        }.andExpect { status { isCreated() } }.andReturn().response

        return response.getHeader("Location")!!.substringAfterLast('/')
    }
}
