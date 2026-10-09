package io.github.thescarletarrow.codraw.library

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.image.ImageFormatsTest.Companion.encoded
import io.github.thescarletarrow.codraw.image.ImageFormatsTest.Companion.png
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.GuestCleanup
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.matchesPattern
import org.hamcrest.Matchers.nullValue
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
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import java.util.Base64
import kotlin.test.assertEquals

@IntegrationTest
class LibraryApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val clock: MutableClock,
    @Autowired private val cleanup: GuestCleanup,
) {

    private val json = JsonMapper()
    private val unknown = "0199a000-0000-7000-8000-000000000000"
    private lateinit var alice: User
    private lateinit var bob: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM shape_libraries").update()
        jdbcClient.sql("DELETE FROM users WHERE provider = 'guest'").update()
        jdbcClient.sql("DELETE FROM spring_session").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
    }

    @Test
    fun `libraries are created trimmed, listed by name regardless of case with their components, renamed and deleted`() {
        val payments = createLibrary(alice, "  Платежи   команды ")
        createLibrary(alice, "архив")
        createLibrary(alice, "Брокеры")

        mockMvc.get("/api/libraries") { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$[*].name") { value(contains("архив", "Брокеры", "Платежи команды")) }
            jsonPath("$[2].id") { value(payments) }
            jsonPath("$[2].components") { value(empty<Any>()) }
        }

        rename(alice, payments, "Платежи").andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Платежи") }
        }
        deleteLibrary(alice, payments).andExpect { status { isNoContent() } }
        mockMvc.get("/api/libraries") { with(alice.session()) }.andExpect { jsonPath("$[*].name") { value(contains("архив", "Брокеры")) } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["""{"name": ""}""", """{"name": "   "}""", """{}"""])
    fun `a library needs a name`(body: String) {
        mockMvc.post("/api/libraries") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a name of a library has at most 60 characters, of a component 80`() {
        createLibraryRequest(alice, "я".repeat(61)).andExpect { status { isBadRequest() } }
        val library = createLibrary(alice, "я".repeat(60))

        addComponent(alice, library, "я".repeat(81), diagram()).andExpect { status { isBadRequest() } }
        addComponent(alice, library, "я".repeat(80), diagram()).andExpect { status { isCreated() } }
    }

    @Test
    fun `a component is listed with its preview but without its content, which comes by its address`() {
        val library = createLibrary(alice, "Платежи")
        val preview = "data:image/png;base64,${base64(encoded("png", 96, 72))}"
        val content = diagram(shape("Шлюз оплаты", "rounded=1;fillColor=#d5e8d4;"))

        val component = addComponent(alice, library, " Шлюз  оплаты ", content, preview).andExpect {
            status { isCreated() }
            header { string("Location", matchesPattern("/api/libraries/$library/components/[0-9a-f-]{36}")) }
            jsonPath("$.name") { value("Шлюз оплаты") }
            jsonPath("$.preview") { value(preview) }
            jsonPath("$.updatedAt") { exists() }
            jsonPath("$.content") { doesNotExist() }
        }.idOf()
        addComponent(alice, library, "Без образца", diagram()).andExpect { jsonPath("$.preview") { value(nullValue()) } }

        mockMvc.get("/api/libraries") { with(alice.session()) }.andExpect {
            jsonPath("$[0].components[*].name") { value(contains("Шлюз оплаты", "Без образца")) }
            jsonPath("$[0].components[0].id") { value(component) }
            jsonPath("$[0].components[0].content") { doesNotExist() }
        }
        getComponent(alice, library, component).andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Шлюз оплаты") }
            jsonPath("$.content") { value(content) }
        }
    }

    @Test
    fun `a component is renamed, gets new content with a new preview or none, and is deleted`() {
        val library = createLibrary(alice, "Платежи")
        val preview = "data:image/png;base64,${base64(encoded("png", 10, 10))}"
        val component = addComponent(alice, library, "Сервис", diagram(shape("Сервис")), preview).idOf()
        clock.advance(Duration.ofMinutes(5))

        updateComponent(alice, library, component, """{"name": "Сервис команды"}""").andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Сервис команды") }
            jsonPath("$.preview") { value(preview) }
        }
        val replaced = diagram(shape("База данных", "shape=cylinder3;"))
        updateComponent(alice, library, component, json.writeValueAsString(mapOf("content" to replaced))).andExpect {
            status { isOk() }
            jsonPath("$.preview") { value(nullValue()) }
        }
        getComponent(alice, library, component).andExpect {
            jsonPath("$.name") { value("Сервис команды") }
            jsonPath("$.content") { value(replaced) }
            jsonPath("$.preview") { value(nullValue()) }
        }
        updateComponent(alice, library, component, "{}").andExpect { status { isBadRequest() } }

        mockMvc.delete("/api/libraries/$library/components/$component") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        getComponent(alice, library, component).andExpect { status { isNotFound() } }
    }

    @Test
    fun `nobody but its owner sees or changes a library or its components`() {
        val library = createLibrary(alice, "Платежи")
        val component = addComponent(alice, library, "Сервис", diagram()).idOf()

        mockMvc.get("/api/libraries") { with(bob.session()) }.andExpect { jsonPath("$") { value(empty<Any>()) } }
        getComponent(bob, library, component).andExpect { status { isNotFound() } }
        rename(bob, library, "Моя").andExpect { status { isNotFound() } }
        addComponent(bob, library, "Чужой", diagram()).andExpect { status { isNotFound() } }
        updateComponent(bob, library, component, """{"name": "Чужой"}""").andExpect { status { isNotFound() } }
        mockMvc.delete("/api/libraries/$library/components/$component") {
            with(bob.session())
            with(csrf())
        }.andExpect { status { isNotFound() } }
        deleteLibrary(bob, library).andExpect { status { isNotFound() } }
        // A component of the owner is found only in its own library.
        val other = createLibrary(alice, "Другая")
        getComponent(alice, other, component).andExpect { status { isNotFound() } }
        getComponent(alice, unknown, component).andExpect { status { isNotFound() } }
        getComponent(alice, "not-a-uuid", component).andExpect { status { isNotFound() } }
        getComponent(alice, library, "not-a-uuid").andExpect { status { isNotFound() } }
        mockMvc.get("/api/libraries").andExpect { status { isUnauthorized() } }

        getComponent(alice, library, component).andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Сервис") }
        }
    }

    @Test
    fun `content that is no diagram or refers to pictures outside it is refused, as are unfit pictures and previews`() {
        val library = createLibrary(alice, "Платежи")
        val board = "/api/boards/0199a000-0000-7000-8000-000000000001/images/0199a000-0000-7000-8000-000000000002"
        val html = base64("<!doctype html><script>alert(1)</script>".toByteArray())
        val script = base64("""<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>""".toByteArray())

        addComponent(alice, library, "Пусто", "").andExpect { status { isBadRequest() } }
        addComponent(alice, library, "Текст", "просто текст").andExpect { status { isBadRequest() } }
        addComponent(alice, library, "Доска", diagram(shape("", "shape=image;image=$board;"))).andExpect {
            status { isBadRequest() }
            jsonPath("$.title") { value("Invalid component") }
        }
        addComponent(alice, library, "HTML", diagram(shape("", "shape=image;image=data:image/png,$html;"))).andExpect {
            status { isUnsupportedMediaType() }
            jsonPath("$.title") { value("Unsupported image") }
        }
        addComponent(alice, library, "Скрипт", diagram(shape("", "shape=image;image=data:image/svg+xml,$script;"))).andExpect {
            status { isUnsupportedMediaType() }
        }
        addComponent(alice, library, "Образец", diagram(), "data:image/svg+xml;base64,$script").andExpect { status { isBadRequest() } }
        mockMvc.get("/api/libraries") { with(alice.session()) }.andExpect { jsonPath("$[0].components") { value(empty<Any>()) } }

        val logo = base64(png(32, 32))
        val icon = base64("""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="2" height="2"/></svg>""".toByteArray())
        addComponent(
            alice,
            library,
            "Логотипы",
            diagram(shape("", "shape=image;image=data:image/png,$logo;"), shape("", "shape=image;image=data:image/svg+xml,$icon;")),
        ).andExpect { status { isCreated() } }
    }

    @Test
    fun `the room of the libraries of the user counts the bytes of the content and the preview of their components`() {
        mockMvc.get("/api/libraries/usage") { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.used") { value(0) }
            jsonPath("$.quota") { value(50L * 1024 * 1024) }
            jsonPath("$.componentSize") { value(4L * 1024 * 1024) }
            jsonPath("$.imageSize") { value(2L * 1024 * 1024) }
        }
        val library = createLibrary(alice, "Платежи")
        val content = diagram(shape("Сервис"))
        val preview = "data:image/png;base64,${base64(encoded("png", 10, 10))}"
        addComponent(alice, library, "Сервис", content, preview)

        mockMvc.get("/api/libraries/usage") { with(alice.session()) }.andExpect {
            jsonPath("$.used") { value(content.toByteArray().size + preview.length) }
        }
        mockMvc.get("/api/libraries/usage") { with(bob.session()) }.andExpect { jsonPath("$.used") { value(0) } }
    }

    @Test
    fun `the libraries of a guest pass to the user who signs in, and go with a guest whom the cleanup deletes`() {
        val guest = users.createGuest()
        val sketches = createLibrary(guest, "Эскизы")
        addComponent(guest, sketches, "Набросок", diagram())

        val dave = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Dave", "Dave", null), guest.id)

        mockMvc.get("/api/libraries") { with(dave.session()) }.andExpect {
            jsonPath("$[*].name") { value(contains("Эскизы")) }
            jsonPath("$[0].components[*].name") { value(contains("Набросок")) }
        }

        val gone = users.createGuest()
        addComponent(gone, createLibrary(gone, "Черновики"), "Набросок", diagram())
        clock.advance(Duration.ofDays(2))
        cleanup.cleanUp()

        assertEquals(1, count("shape_libraries"))
        assertEquals(1, count("library_components"))
    }

    private fun count(table: String) = jdbcClient.sql("SELECT count(*) FROM $table").query(Int::class.java).single()

    private fun createLibraryRequest(user: User, name: String) = mockMvc.post("/api/libraries") {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = json.writeValueAsString(mapOf("name" to name))
    }

    private fun createLibrary(user: User, name: String): String =
        createLibraryRequest(user, name).andExpect { status { isCreated() } }.idOf()

    private fun rename(user: User, library: String, name: String) = mockMvc.patch("/api/libraries/$library") {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = json.writeValueAsString(mapOf("name" to name))
    }

    private fun deleteLibrary(user: User, library: String) = mockMvc.delete("/api/libraries/$library") {
        with(user.session())
        with(csrf())
    }

    private fun addComponent(user: User, library: String, name: String, diagram: String, preview: String? = null) =
        mockMvc.post("/api/libraries/$library/components") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = json.writeValueAsString(mapOf("name" to name, "content" to diagram, "preview" to preview))
        }

    private fun updateComponent(user: User, library: String, component: String, body: String) =
        mockMvc.patch("/api/libraries/$library/components/$component") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private fun getComponent(user: User, library: String, component: String) =
        mockMvc.get("/api/libraries/$library/components/$component") { with(user.session()) }

    private fun ResultActionsDsl.idOf(): String =
        json.readTree(andReturn().response.contentAsString).get("id").asString()

    private fun base64(bytes: ByteArray) = Base64.getEncoder().encodeToString(bytes)

    companion object {
        private var nextId = 2

        fun shape(label: String, style: String = "rounded=1;") =
            """<mxCell id="${nextId++}" value="$label" style="$style" vertex="1" parent="1"><mxGeometry width="120" height="60" as="geometry"/></mxCell>"""

        fun diagram(vararg cells: String = arrayOf(shape("Сервис"))) =
            """<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.joinToString("")}</root></mxGraphModel>"""
    }
}
