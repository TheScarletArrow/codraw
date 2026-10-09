package io.github.thescarletarrow.codraw.library

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.image.ImageFormatsTest.Companion.png
import io.github.thescarletarrow.codraw.library.LibraryApiTest.Companion.diagram
import io.github.thescarletarrow.codraw.library.LibraryApiTest.Companion.shape
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
import org.hamcrest.Matchers.contains
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
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import tools.jackson.databind.json.JsonMapper
import java.util.Base64
import kotlin.test.assertEquals

/** The limits of libraries, set small. */
@IntegrationTest
@TestPropertySource(
    properties = [
        "codraw.limits.libraries-per-user=2",
        "codraw.limits.components-per-library=2",
        "codraw.limits.library-component-size=2KB",
        "codraw.limits.library-image-size=300B",
        "codraw.limits.libraries-size-per-user=3KB",
    ],
)
class LibraryLimitsApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val registry: MeterRegistry,
) {

    private val json = JsonMapper()
    private lateinit var alice: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM shape_libraries").update()
        jdbcClient.sql("DELETE FROM users WHERE provider = 'guest'").update()
        alice = users.gitHubUser("Alice")
    }

    @Test
    fun `a user has at most the limit of libraries, but a guest who signs in keeps all of theirs`() {
        createLibrary(alice, "Первая").andExpect { status { isCreated() } }
        createLibrary(alice, "Вторая").andExpect { status { isCreated() } }
        val before = reached("libraries")

        createLibrary(alice, "Третья").andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Library limit reached") }
            jsonPath("$.limit") { value(2) }
            jsonPath("$.scope") { value("libraries") }
        }
        assertEquals(before + 1, reached("libraries"))

        val guest = users.createGuest()
        createLibrary(guest, "Гостевая")
        users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Alice", "Alice", null), guest.id)
        mockMvc.get("/api/libraries") { with(alice.session()) }.andExpect {
            jsonPath("$[*].name") { value(contains("Вторая", "Гостевая", "Первая")) }
        }
    }

    @Test
    fun `a library holds at most the limit of components`() {
        val library = createLibrary(alice, "Платежи").idOf()
        addComponent(library, diagram()).andExpect { status { isCreated() } }
        addComponent(library, diagram()).andExpect { status { isCreated() } }
        val before = reached("library-components")

        addComponent(library, diagram()).andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Component limit reached") }
            jsonPath("$.limit") { value(2) }
            jsonPath("$.scope") { value("components") }
        }
        assertEquals(before + 1, reached("library-components"))
    }

    @Test
    fun `a component and a picture in it have at most their limits of bytes`() {
        val library = createLibrary(alice, "Платежи").idOf()
        val before = reached("library-component")

        addComponent(library, diagram(shape("x".repeat(2100)))).andExpect {
            status { isPayloadTooLarge() }
            jsonPath("$.title") { value("Component too large") }
            jsonPath("$.limit") { value(2048) }
        }
        val picture = Base64.getEncoder().encodeToString(png(4, 4, ByteArray(400)))
        addComponent(library, diagram(shape("", "shape=image;image=data:image/png,$picture;"))).andExpect {
            status { isPayloadTooLarge() }
            jsonPath("$.title") { value("Image too large") }
            jsonPath("$.limit") { value(300) }
            jsonPath("$.scope") { value("image") }
        }
        assertEquals(before + 2, reached("library-component"))
    }

    @Test
    fun `the components of all libraries of a user take at most the room of the user, and one that does not grow fits`() {
        val first = createLibrary(alice, "Первая").idOf()
        val second = createLibrary(alice, "Вторая").idOf()
        val large = diagram(shape("x".repeat(1200)))
        val component = addComponent(first, large).andExpect { status { isCreated() } }.idOf()
        addComponent(second, large).andExpect { status { isCreated() } }
        val before = reached("libraries-size")

        addComponent(second, large).andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Library quota reached") }
            jsonPath("$.limit") { value(3072) }
            jsonPath("$.used") { value(2 * large.toByteArray().size) }
            jsonPath("$.scope") { value("size") }
        }
        assertEquals(before + 1, reached("libraries-size"))

        mockMvc.patch("/api/libraries/$first/components/$component") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = json.writeValueAsString(mapOf("content" to diagram(shape("y".repeat(1200)))))
        }.andExpect { status { isOk() } }
    }

    private fun reached(limit: String): Double = registry.get("codraw.limits.reached").tag("limit", limit).counter().count()

    private fun createLibrary(user: User, name: String) = mockMvc.post("/api/libraries") {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = json.writeValueAsString(mapOf("name" to name))
    }

    private fun addComponent(library: String, diagram: String) = mockMvc.post("/api/libraries/$library/components") {
        with(alice.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = json.writeValueAsString(mapOf("name" to "Компонент", "content" to diagram))
    }

    private fun ResultActionsDsl.idOf(): String = json.readTree(andReturn().response.contentAsString).get("id").asString()
}
