package io.github.thescarletarrow.codraw.decision

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.nullValue
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
import org.springframework.test.web.servlet.put
import tools.jackson.databind.json.JsonMapper
import java.time.LocalDate

@IntegrationTest
class DecisionApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val json: JsonMapper,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var board: String

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        board = createBoard(alice)
    }

    @Test
    fun `the owner writes a decision down with the next number of the board, and a viewer reads it`() {
        val kafka = add(
            alice,
            """
            {"title": "  Kafka для событий ", "status": "accepted", "context": "Нужна очередь событий заказов",
             "options": "* Kafka\n* RabbitMQ", "outcome": "Kafka: есть в компании", "consequences": "Нужен кластер",
             "elements": [{"pageId": "page-1", "cellId": "kafka"}, {"pageId": "page-2", "cellId": "kafka-2"}]}
            """,
        ).andExpect {
            status { isCreated() }
            jsonPath("$.number") { value(1) }
            jsonPath("$.title") { value("Kafka для событий") }
            jsonPath("$.status") { value("accepted") }
            jsonPath("$.decidedOn") { value(LocalDate.now(clock).toString()) }
            jsonPath("$.author.name") { value("Alice") }
            jsonPath("$.elements[*].cellId") { value(contains("kafka", "kafka-2")) }
        }.id()
        add(alice, """{"title": "PostgreSQL", "decidedOn": "2026-09-01"}""").andExpect {
            jsonPath("$.number") { value(2) }
            jsonPath("$.status") { value("proposed") }
            jsonPath("$.decidedOn") { value("2026-09-01") }
            jsonPath("$.elements") { value(empty<Any>()) }
        }

        setLinkAccess("view")
        open(bob)
        decisions(bob).andExpect {
            status { isOk() }
            jsonPath("$[*].number") { value(contains(1, 2)) }
            jsonPath("$[0].id") { value(kafka) }
            jsonPath("$[0].options") { value("* Kafka\n* RabbitMQ") }
        }
        add(bob, """{"title": "Redis"}""").andExpect { status { isForbidden() } }
        update(bob, kafka, """{"title": "Kafka", "status": "rejected"}""").andExpect { status { isForbidden() } }
        mockMvc.delete("/api/boards/$board/decisions/$kafka") {
            with(bob.session())
            with(csrf())
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `a decision keeps the number of its file, which is the board's own, and checks its title, status and successor`() {
        add(alice, """{"number": 8, "title": "Kafka"}""").andExpect { jsonPath("$.number") { value(8) } }
        add(alice, """{"title": "RabbitMQ"}""").andExpect { jsonPath("$.number") { value(9) } }

        add(alice, """{"number": 8, "title": "Другое"}""").andExpect {
            status { isConflict() }
            jsonPath("$.number") { value(8) }
        }
        add(alice, """{"number": 0, "title": "Ноль"}""").andExpect { status { isBadRequest() } }
        add(alice, """{"title": "   "}""").andExpect { status { isBadRequest() } }
        add(alice, """{"title": "Kafka", "status": "done"}""").andExpect { status { isBadRequest() } }
        add(alice, """{"title": "Kafka", "status": "accepted", "supersededBy": "0199a000-0000-7000-8000-000000000001"}""")
            .andExpect { status { isBadRequest() } }
        add(alice, """{"title": "Kafka", "status": "superseded", "supersededBy": "0199a000-0000-7000-8000-000000000001"}""")
            .andExpect { status { isBadRequest() } }
        decisions(alice).andExpect { jsonPath("$") { value(hasSize<Any>(2)) } }
    }

    @Test
    fun `an editor changes what a decision says, the elements it is about, supersedes it and deletes it`() {
        setLinkAccess("edit")
        open(bob)
        val first = add(alice, """{"title": "RabbitMQ", "status": "accepted"}""").id()
        val second = add(bob, """{"title": "Kafka", "status": "proposed"}""").id()

        update(bob, first, """{"title": "RabbitMQ для событий", "status": "superseded", "supersededBy": "$second", "outcome": "Был"}""")
            .andExpect {
                status { isOk() }
                jsonPath("$.number") { value(1) }
                jsonPath("$.author.name") { value("Alice") }
                jsonPath("$.status") { value("superseded") }
                jsonPath("$.supersededBy") { value(second) }
                jsonPath("$.outcome") { value("Был") }
                jsonPath("$.context") { value("") }
            }
        update(bob, first, """{"title": "Сам себя", "status": "superseded", "supersededBy": "$first"}""")
            .andExpect { status { isBadRequest() } }

        mockMvc.put("/api/boards/$board/decisions/$second/elements") {
            with(bob.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"elements": [{"pageId": "page-1", "cellId": "kafka"}, {"pageId": "page-1", "cellId": "kafka"}]}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.elements") { value(hasSize<Any>(1)) }
        }

        // The discussion of the decision is a thread of comments about it, which goes with it.
        post(
            "/api/boards/$board/threads",
            alice,
            """{"pageId": "page-1", "decisionId": "$second", "body": "Почему не Pulsar?"}""",
        ).andExpect {
            status { isCreated() }
            jsonPath("$.decisionId") { value(second) }
            jsonPath("$.cellId") { value(nullValue()) }
        }
        post("/api/boards/$board/threads", alice, """{"pageId": "page-1", "cellId": "kafka", "decisionId": "$second", "body": "?"}""")
            .andExpect { status { isBadRequest() } }
        post("/api/boards/$board/threads", alice, """{"pageId": "page-1", "decisionId": "$board", "body": "?"}""")
            .andExpect { status { isNotFound() } }

        mockMvc.delete("/api/boards/$board/decisions/$second") {
            with(bob.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        decisions(alice).andExpect {
            jsonPath("$[*].id") { value(contains(first)) }
            jsonPath("$[0].status") { value("superseded") }
            jsonPath("$[0].supersededBy") { value(nullValue()) }
        }
        mockMvc.get("/api/boards/$board/threads") { with(alice.session()) }.andExpect { jsonPath("$") { value(empty<Any>()) } }
        mockMvc.get("/api/boards/$board/decisions/$second") { with(alice.session()) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `nobody else reads the decisions of a board whose link is closed`() {
        add(alice, """{"title": "Kafka"}""")
        setLinkAccess("none")
        decisions(bob).andExpect { status { isForbidden() } }
    }

    private fun createBoard(owner: User): String {
        val response = post("/api/boards", owner, """{"title": "Доска"}""").andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    /** Opens the board through its link, which gives the user the role of the link. */
    private fun open(user: User) {
        mockMvc.get("/api/boards/$board") { with(user.session()) }.andExpect { status { isOk() } }
    }

    private fun setLinkAccess(linkAccess: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$linkAccess"}"""
        }.andExpect { status { isOk() } }
    }

    private fun add(user: User, body: String): ResultActionsDsl = post("/api/boards/$board/decisions", user, body)

    private fun update(user: User, decision: String, body: String): ResultActionsDsl =
        mockMvc.put("/api/boards/$board/decisions/$decision") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private fun decisions(user: User): ResultActionsDsl = mockMvc.get("/api/boards/$board/decisions") { with(user.session()) }

    private fun ResultActionsDsl.id(): String = json.readTree(andReturn().response.contentAsString)["id"].asString()

    private fun post(path: String, user: User, body: String): ResultActionsDsl = mockMvc.post(path) {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }
}
