package io.github.thescarletarrow.codraw.image

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.image.ImageFormatsTest.Companion.png
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import tools.jackson.databind.json.JsonMapper
import kotlin.test.assertEquals

/** The limits of images, set small. */
@IntegrationTest
@TestPropertySource(properties = ["codraw.limits.image-size=1KB", "codraw.limits.images-size-per-board=2KB"])
class BoardImageQuotaApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val registry: MeterRegistry,
    @Autowired private val json: JsonMapper,
) {

    private lateinit var alice: User
    private lateinit var board: String

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM board_images").update()
        alice = users.gitHubUser("Alice")
        board = createBoard()
    }

    @Test
    fun `images of a board take at most the room of the board, and a file at most the limit of a file`() {
        val reached = limitsReached("images")
        // 33 bytes of header and 967 of the rest: 1000 bytes each, each another file.
        val files = (1..3).map { png(10, 10, ByteArray(967) { _ -> it.toByte() }) }

        add(files[0]).andExpect { status { isCreated() } }
        add(files[1]).andExpect { status { isCreated() } }
        add(files[2]).andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Image quota reached") }
            jsonPath("$.limit") { value(2048) }
            jsonPath("$.used") { value(2000) }
        }
        // A file the board has takes no more room.
        add(files[0]).andExpect { status { isOk() } }
        add(png(10, 10, ByteArray(1000))).andExpect {
            status { isEqualTo(413) }
            jsonPath("$.limit") { value(1024) }
        }

        assertEquals(reached + 1, limitsReached("images"))
        mockMvc.get("/api/boards/$board/images/usage") { with(alice.session()) }.andExpect {
            jsonPath("$.used") { value(2000) }
            jsonPath("$.quota") { value(2048) }
            jsonPath("$.imageSize") { value(1024) }
        }
    }

    private fun add(bytes: ByteArray): ResultActionsDsl = mockMvc.post("/api/boards/$board/images") {
        with(alice.session())
        with(csrf())
        contentType = MediaType.APPLICATION_OCTET_STREAM
        content = bytes
    }

    private fun limitsReached(limit: String): Double = registry.get("codraw.limits.reached").tag("limit", limit).counter().count()

    private fun createBoard(): String = json.readTree(
        mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Доска"}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
    )["id"].asString()
}
