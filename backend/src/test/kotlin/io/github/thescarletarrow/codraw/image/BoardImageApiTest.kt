package io.github.thescarletarrow.codraw.image

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.image.ImageFormatsTest.Companion.encoded
import io.github.thescarletarrow.codraw.image.ImageFormatsTest.Companion.png
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
import org.hamcrest.Matchers.containsString
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
import tools.jackson.databind.json.JsonMapper
import java.util.UUID
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

@IntegrationTest
class BoardImageApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val storage: ImageStorage,
    @Autowired private val cleanup: ImageCleanup,
    @Autowired private val registry: MeterRegistry,
    @Autowired private val json: JsonMapper,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var carol: User
    private lateinit var board: String

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM board_images").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
        board = createBoard(alice)
    }

    @Test
    fun `a participant who edits adds an image, which every participant gets with its type, safety headers and a year of cache`() {
        val file = encoded("png", 120, 45)

        val response = add(bob, file, contentType = MediaType.APPLICATION_OCTET_STREAM).andExpect {
            status { isCreated() }
            jsonPath("$.contentType") { value("image/png") }
            jsonPath("$.size") { value(file.size) }
            jsonPath("$.width") { value(120) }
            jsonPath("$.height") { value(45) }
        }.andReturn().response
        val url = field(response.contentAsString, "url")

        assertEquals("/api/boards/$board/images/${field(response.contentAsString, "id")}", url)
        assertEquals(url, response.getHeader("Location"))
        val image = mockMvc.get(url) { with(alice.session()) }.andExpect {
            status { isOk() }
            content { contentType("image/png") }
            header { string("Content-Length", file.size.toString()) }
            header { string("X-Content-Type-Options", "nosniff") }
            header { string("Cache-Control", "max-age=31536000, private, immutable") }
            header { string("Content-Security-Policy", containsString("sandbox")) }
            header { exists("ETag") }
        }.andReturn().response
        assertContentEquals(file, image.contentAsByteArray)

        mockMvc.get(url) {
            with(alice.session())
            header("If-None-Match", image.getHeader("ETag")!!)
        }.andExpect {
            status { isNotModified() }
            header { string("Cache-Control", "max-age=31536000, private, immutable") }
        }
    }

    @Test
    fun `the same file added twice is one image, and the board counts its room once`() {
        val file = encoded("jpg", 64, 33)
        val first = add(alice, file).andExpect { status { isCreated() } }.andReturn().response.contentAsString

        val second = add(bob, file).andExpect { status { isOk() } }.andReturn().response.contentAsString

        assertEquals(field(first, "id"), field(second, "id"))
        mockMvc.get("/api/boards/$board/images/usage") { with(bob.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.used") { value(file.size) }
            jsonPath("$.quota") { value(100L * 1024 * 1024) }
            jsonPath("$.imageSize") { value(10L * 1024 * 1024) }
        }
    }

    @Test
    fun `a viewer sees the images of the board but adds none, unless in the draft of their own open proposal`() {
        val url = url(add(alice, encoded("gif", 10, 10)).andExpect { status { isCreated() } })
        setLinkAccess("view")

        mockMvc.get(url) { with(bob.session()) }.andExpect { status { isOk() } }
        add(bob, encoded("png", 5, 5)).andExpect { status { isForbidden() } }

        val proposal = field(
            post("/api/boards/$board/proposals", bob, """{"title": "Логотип"}""").andExpect { status { isCreated() } }
                .andReturn().response.contentAsString,
            "id",
        )
        add(bob, encoded("png", 5, 5), proposal = proposal).andExpect { status { isCreated() } }
        // Not into the proposal of another author, nor one that is closed.
        add(carol, encoded("png", 6, 6), proposal = proposal).andExpect { status { isForbidden() } }
        mockMvc.post("/api/boards/$board/proposals/$proposal/withdraw") {
            with(bob.session())
            with(csrf())
        }.andExpect { status { isOk() } }
        add(bob, encoded("png", 7, 7), proposal = proposal).andExpect { status { isForbidden() } }
    }

    @Test
    fun `without a session only a board shown to anybody gives its images, and its room stays closed`() {
        val file = encoded("png", 12, 12)
        val url = url(add(alice, file))
        setLinkAccess("public")

        val image = mockMvc.get(url).andExpect {
            status { isOk() }
            content { contentType("image/png") }
            header { string("Content-Security-Policy", containsString("sandbox")) }
        }.andReturn().response
        assertContentEquals(file, image.contentAsByteArray)
        mockMvc.get("/api/boards/$board/images/usage").andExpect { status { isUnauthorized() } }
        mockMvc.get("/api/boards/$board/images/${UUID.randomUUID()}").andExpect { status { isNotFound() } }

        setLinkAccess("view")
        mockMvc.get(url).andExpect { status { isUnauthorized() } }
        mockMvc.get(url) { with(carol.session()) }.andExpect { status { isOk() } }
    }

    @Test
    fun `nobody without a role on the board gets or adds its images, and an image of another board is not found here`() {
        val url = url(add(alice, encoded("png", 8, 8)))
        setLinkAccess("none")

        mockMvc.get(url) { with(carol.session()) }.andExpect { status { isForbidden() } }
        add(carol, encoded("png", 9, 9)).andExpect { status { isForbidden() } }
        mockMvc.get("/api/boards/$board/images/usage") { with(carol.session()) }.andExpect { status { isForbidden() } }

        val other = createBoard(carol)
        val imageId = url.substringAfterLast('/')
        mockMvc.get("/api/boards/$other/images/$imageId") { with(carol.session()) }.andExpect { status { isNotFound() } }
        mockMvc.get("/api/boards/$board/images/${UUID.randomUUID()}") { with(alice.session()) }.andExpect { status { isNotFound() } }
        mockMvc.get("/api/boards/$board/images/not-an-id") { with(alice.session()) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `files that are no PNG, JPEG, GIF or WebP by their bytes are refused, whatever the request says`() {
        val html = "<!doctype html><script>alert(document.cookie)</script>".toByteArray()
        val svg = """<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>""".toByteArray()

        add(alice, html, contentType = MediaType.IMAGE_PNG).andExpect {
            status { isUnsupportedMediaType() }
            jsonPath("$.title") { value("Unsupported image") }
        }
        add(alice, svg, contentType = MediaType("image", "svg+xml")).andExpect { status { isUnsupportedMediaType() } }
        assertEquals(0, imageCount())
    }

    @Test
    fun `a file above the limit and an image of more pixels than allowed are refused, and counted as limits reached`() {
        val reached = limitsReached("image")

        add(alice, png(100, 100, ByteArray(10 * 1024 * 1024))).andExpect {
            status { isEqualTo(413) }
            jsonPath("$.title") { value("Image too large") }
            jsonPath("$.limit") { value(10L * 1024 * 1024) }
        }
        add(alice, png(20_000, 20_000, ByteArray(1000))).andExpect {
            status { isEqualTo(413) }
            jsonPath("$.limit") { value(ImageFormats.MAX_PIXELS) }
            jsonPath("$.scope") { value("pixels") }
        }

        assertEquals(reached + 2, limitsReached("image"))
        assertEquals(0, imageCount())
    }

    @Test
    fun `trashing preserves images and permanent deletion removes them from storage`() {
        val url = url(add(alice, encoded("png", 3, 3)))
        val key = storageKey(UUID.fromString(board), UUID.fromString(url.substringAfterLast('/')))
        assertNotNull(storage.get(key)).close()

        mockMvc.delete("/api/boards/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        assertNotNull(storage.get(key)).close()
        assertEquals(1, imageCount())
        mockMvc.delete("/api/boards/trash/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        assertNull(storage.get(key))
        assertEquals(0, imageCount())
    }

    @Test
    fun `the cleanup deletes the images of boards that went without their owner, e g with a gone guest`() {
        val kept = url(add(alice, encoded("png", 4, 4)))
        val other = createBoard(bob)
        val gone = url(add(bob, encoded("png", 5, 5), board = other))
        // As the cleanup of gone guests deletes boards: in SQL, without the service.
        jdbcClient.sql("DELETE FROM boards WHERE id = :id::uuid").param("id", other).update()
        val goneKey = storageKey(UUID.fromString(other), UUID.fromString(gone.substringAfterLast('/')))
        assertNotNull(storage.get(goneKey)).close()

        assertEquals(1, cleanup.cleanUp())

        assertNull(storage.get(goneKey))
        assertEquals(1, imageCount())
        mockMvc.get(kept) { with(alice.session()) }.andExpect { status { isOk() } }
        assertEquals(0, cleanup.cleanUp())
    }

    private fun add(
        user: User,
        bytes: ByteArray,
        contentType: MediaType = MediaType.APPLICATION_OCTET_STREAM,
        proposal: String? = null,
        board: String = this.board,
    ): ResultActionsDsl = mockMvc.post("/api/boards/$board/images") {
        with(user.session())
        with(csrf())
        if (proposal != null) param("proposal", proposal)
        this.contentType = contentType
        content = bytes
    }

    private fun url(result: ResultActionsDsl) = field(result.andReturn().response.contentAsString, "url")

    private fun field(body: String, name: String): String = json.readTree(body)[name].asString()

    private fun imageCount(): Int = jdbcClient.sql("SELECT count(*) FROM board_images").query(Int::class.java).single()

    private fun limitsReached(limit: String): Double = registry.get("codraw.limits.reached").tag("limit", limit).counter().count()

    private fun createBoard(owner: User): String =
        field(post("/api/boards", owner, """{"title": "Доска"}""").andExpect { status { isCreated() } }.andReturn().response.contentAsString, "id")

    private fun setLinkAccess(linkAccess: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$linkAccess"}"""
        }.andExpect { status { isOk() } }
    }

    private fun post(path: String, user: User, body: String): ResultActionsDsl = mockMvc.post(path) {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }
}
