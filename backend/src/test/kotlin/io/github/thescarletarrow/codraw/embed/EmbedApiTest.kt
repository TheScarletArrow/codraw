package io.github.thescarletarrow.codraw.embed

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.matchesPattern
import org.hamcrest.Matchers.not
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

@IntegrationTest
@TestPropertySource(properties = ["codraw.limits.embed-size=4KB"])
class EmbedApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val registry: MeterRegistry,
    @Autowired private val json: JsonMapper,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var board: String

    private val picture = """<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><text x="5" y="20">Платежи</text></svg>"""

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        board = createBoard()
    }

    @Test
    fun `the owner turns the live image of a page on, and its address serves a placeholder until the first picture`() {
        val path = enable("page-1")

        assertEquals(true, path.matches(Regex("^/api/embeds/[A-Za-z0-9_-]{22}\\.svg$")))
        image(path).andExpect {
            status { isOk() }
            content { contentTypeCompatibleWith("image/svg+xml") }
            content { string(containsString("Схема ещё не нарисована")) }
        }
        mockMvc.get("/api/boards/$board/embed") { with(bob.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.path") { value(path) }
            jsonPath("$.pageId") { value("page-1") }
            jsonPath("$.updatedAt") { value(nullValue()) }
        }
    }

    @Test
    fun `a participant who edits publishes the picture, and anybody gets it cleaned, with headers for embedding`() {
        val path = enable("page-1")
        open(bob)

        publish(bob, "page-1", picture.replace("<text", """<script>alert(1)</script><text onclick="alert(2)"""")).andExpect {
            status { isNoContent() }
        }

        image(path).andExpect {
            status { isOk() }
            content { string(containsString("Платежи")) }
            content { string(not(containsString("script"))) }
            content { string(not(containsString("onclick"))) }
            header { string("Cache-Control", containsString("max-age=60")) }
            header { string("Cache-Control", containsString("public")) }
            header { string("Content-Security-Policy", containsString("sandbox")) }
            header { string("Cross-Origin-Resource-Policy", "cross-origin") }
            header { string("X-Content-Type-Options", "nosniff") }
            header { string("ETag", matchesPattern("\"\\d+\"")) }
        }
        mockMvc.get("/api/boards/$board/embed") { with(alice.session()) }.andExpect {
            jsonPath("$.updatedAt") { value(clock.instant().toString()) }
        }
    }

    @Test
    fun `the address answers 304 to a request with the tag of the latest picture, and a new picture gets a new tag`() {
        val path = enable("page-1")
        publish(alice, "page-1", picture)
        val tag = image(path).andReturn().response.getHeader("ETag")!!

        image(path) { header("If-None-Match", tag) }.andExpect { status { isNotModified() } }

        clock.advance(Duration.ofMinutes(1))
        publish(alice, "page-1", picture.replace("Платежи", "Заказы"))
        val newer = image(path) { header("If-None-Match", tag) }.andExpect {
            status { isOk() }
            content { string(containsString("Заказы")) }
        }.andReturn().response.getHeader("ETag")
        assertNotEquals(tag, newer)
    }

    @Test
    fun `a viewer cannot publish, and nobody publishes a page other than that of the image`() {
        enable("page-1")
        patchLinkAccess("view")
        open(bob)

        publish(bob, "page-1", picture).andExpect { status { isForbidden() } }
        publish(alice, "page-2", picture).andExpect { status { isConflict() } }
    }

    @Test
    fun `nothing is published to a board without a live image`() {
        publish(alice, "page-1", picture).andExpect { status { isConflict() } }
        mockMvc.get("/api/boards/$board/embed") { with(alice.session()) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `a picture larger than the limit or not an SVG document is refused`() {
        enable("page-1")
        val reached = registry.get("codraw.limits.reached").tag("limit", "embed").counter().count()

        publish(alice, "page-1", picture.replace("Платежи", "x".repeat(5000))).andExpect { status { isPayloadTooLarge() } }
        publish(alice, "page-1", "<html/>").andExpect { status { isBadRequest() } }

        assertEquals(reached + 1, registry.get("codraw.limits.reached").tag("limit", "embed").counter().count())
    }

    @Test
    fun `only the owner turns the image on and off`() {
        open(bob)

        mockMvc.put("/api/boards/$board/embed") {
            with(bob.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"pageId": "page-1"}"""
        }.andExpect { status { isForbidden() } }
        val path = enable("page-1")
        mockMvc.delete("/api/boards/$board/embed") {
            with(bob.session())
            with(csrf())
        }.andExpect { status { isForbidden() } }
        image(path).andExpect { status { isOk() } }
    }

    @Test
    fun `turning the image off retires its address, and turning it on again gives a new one`() {
        val first = enable("page-1")

        mockMvc.delete("/api/boards/$board/embed") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        image(first).andExpect { status { isNotFound() } }
        val second = enable("page-1")
        assertNotEquals(first, second)
    }

    @Test
    fun `another page keeps the address and drops the picture of the page before`() {
        val path = enable("page-1")
        publish(alice, "page-1", picture)

        assertEquals(path, enable("page-2"))

        image(path).andExpect { content { string(containsString("Схема ещё не нарисована")) } }
    }

    @Test
    fun `the image goes with its board`() {
        val path = enable("page-1")

        mockMvc.delete("/api/boards/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        image(path).andExpect { status { isNotFound() } }
    }

    @Test
    fun `an address of the wrong form is not found`() {
        image("/api/embeds/short.svg").andExpect { status { isNotFound() } }
        image("/api/embeds/AAAAAAAAAAAAAAAAAAAAAA.svg").andExpect { status { isNotFound() } }
    }

    private fun createBoard(): String {
        val response = mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Доска"}"""
        }.andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    private fun open(user: User) {
        mockMvc.get("/api/boards/$board") { with(user.session()) }.andExpect { status { isOk() } }
    }

    private fun patchLinkAccess(linkAccess: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$linkAccess"}"""
        }.andExpect { status { isOk() } }
    }

    private fun enable(pageId: String): String {
        val response = mockMvc.put("/api/boards/$board/embed") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"pageId": "$pageId"}"""
        }.andExpect { status { isOk() } }.andReturn().response
        return json.readTree(response.contentAsString)["path"].asString()
    }

    private fun publish(user: User, pageId: String, svg: String): ResultActionsDsl =
        mockMvc.put("/api/boards/$board/embed/image") {
            with(user.session())
            with(csrf())
            param("pageId", pageId)
            contentType = MediaType.valueOf("image/svg+xml")
            content = svg.toByteArray()
        }

    /** The image as a reader of a document gets it: without a session. */
    private fun image(path: String, setup: org.springframework.test.web.servlet.MockHttpServletRequestDsl.() -> Unit = {}) =
        mockMvc.get(path, dsl = setup)
}
