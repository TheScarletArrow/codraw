package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.matchesPattern
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
import java.time.Duration
import kotlin.test.assertEquals

@IntegrationTest
class BoardApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
) {

    private val uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    private lateinit var alice: User
    private lateinit var bob: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
    }

    @Test
    fun `creates a board with a valid title`() {
        mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Архитектура"}"""
        }.andExpect {
            status { isCreated() }
            header { string("Location", matchesPattern("/api/boards/$uuidPattern")) }
            jsonPath("$.id") { value(matchesPattern(uuidPattern)) }
            jsonPath("$.title") { value("Архитектура") }
            jsonPath("$.createdAt") { value(clock.instant().toString()) }
        }
    }

    @Test
    fun `makes the creator the owner of the board`() {
        val id = createBoard("Своя", alice)

        val owner = jdbcClient.sql("SELECT owner_id FROM boards WHERE id = :id::uuid").param("id", id)
            .query(String::class.java).single()
        assertEquals(alice.id.toString(), owner)
        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect {
            jsonPath("$[*].id") { value(contains(id)) }
        }
    }

    @Test
    fun `trims the title`() {
        mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "  Схема  "}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.title") { value("Схема") }
        }
    }

    @ParameterizedTest
    @ValueSource(strings = ["""{"title": ""}""", """{"title": "   "}""", """{}""", """{"title": null}"""])
    fun `rejects a missing or blank title`(body: String) {
        assertBadRequest(body)
    }

    @Test
    fun `rejects a title longer than 200 characters`() {
        assertBadRequest("""{"title": "${"a".repeat(201)}"}""")
    }

    @Test
    fun `accepts a title of exactly 200 characters`() {
        mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "${"a".repeat(200)}"}"""
        }.andExpect { status { isCreated() } }
    }

    @Test
    fun `lists recently changed boards first`() {
        val first = createBoard("A", alice)
        clock.advance(Duration.ofMinutes(1))
        val second = createBoard("B", alice)

        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].id") { value(second) }
            jsonPath("$[1].id") { value(first) }
        }
    }

    @Test
    fun `returns an empty list when the user has no boards`() {
        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect {
            status { isOk() }
            content { json("[]") }
        }
    }

    @Test
    fun `does not list boards of other users`() {
        createBoard("Доска Алисы", alice)
        val bobBoard = createBoard("Доска Боба", bob)

        mockMvc.get("/api/boards") { with(bob.session()) }.andExpect {
            status { isOk() }
            jsonPath("$[*].id") { value(contains(bobBoard)) }
        }
    }

    @Test
    fun `returns an own board`() {
        val id = createBoard("Сеть", alice)

        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(id) }
            jsonPath("$.title") { value("Сеть") }
            jsonPath("$.createdAt") { value(clock.instant().toString()) }
            jsonPath("$.updatedAt") { value(clock.instant().toString()) }
        }
    }

    @Test
    fun `returns a board of another user by its id, as a link gives access`() {
        val id = createBoard("Доска Алисы", alice)

        mockMvc.get("/api/boards/$id") { with(bob.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Доска Алисы") }
        }
        mockMvc.get("/api/boards") { with(bob.session()) }.andExpect { content { json("[]") } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["0199a000-0000-7000-8000-000000000000", "not-a-uuid", "1-1-1-1-1"])
    fun `returns 404 for an unknown board`(id: String) {
        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect { status { isNotFound() } }
    }

    private fun assertBadRequest(body: String) {
        mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isBadRequest() } }

        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM boards").query(Int::class.java).single())
    }

    private fun createBoard(title: String, owner: User): String {
        val response = mockMvc.post("/api/boards") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "$title"}"""
        }.andExpect { status { isCreated() } }.andReturn().response

        return response.getHeader("Location")!!.substringAfterLast('/')
    }
}
