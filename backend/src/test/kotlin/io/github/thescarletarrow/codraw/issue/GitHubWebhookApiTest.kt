package io.github.thescarletarrow.codraw.issue

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
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
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.HexFormat
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.test.assertTrue

@IntegrationTest
class GitHubWebhookApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val json: JsonMapper,
) {

    private lateinit var alice: User
    private lateinit var board: String
    private lateinit var issue: FakeGitHub.Issue

    @BeforeEach
    fun clean() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM issue_tracker_connections").update()
        FakeGitHub.reset()
        FakeGitHub.account(TOKEN, "alice-gh", "acme/shop")
        issue = FakeGitHub.issue("acme/shop", 12, "Кэш для каталога")
        alice = users.gitHubUser("Alice")
        board = mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Доска"}"""
        }.andReturn().response.getHeader("Location")!!.substringAfterLast('/')
        mockMvc.put("/api/issue-tracker/connection") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"token": "$TOKEN"}"""
        }.andExpect { status { isOk() } }
        mockMvc.post("/api/boards/$board/issue-links") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"pageId": "page-1", "cellId": "api", "repository": "acme/shop", "number": 12}"""
        }.andExpect { status { isCreated() } }
    }

    @Test
    fun `a signed event of a changed issue changes its links at once, and a repeated or late one changes nothing`() {
        FakeGitHub.requests.clear()
        issue.title = "Кэш каталога"
        issue.state = "closed"
        issue.stateReason = "completed"
        issue.updatedAt = Instant.parse("2026-01-02T00:00:00Z")
        val closed = event("closed", issue)
        send("issues", closed).andExpect { status { isNoContent() } }
        link().andExpect {
            jsonPath("$[0].title") { value("Кэш каталога") }
            jsonPath("$[0].state") { value("closed") }
            jsonPath("$[0].stateReason") { value("completed") }
        }

        // GitHub repeats the event and sends an earlier one late: the link keeps the latest change.
        send("issues", closed).andExpect { status { isNoContent() } }
        val earlier = issue.copy(title = "Старое название", state = "open", stateReason = null, updatedAt = Instant.parse("2026-01-01T12:00:00Z"))
        send("issues", event("edited", earlier)).andExpect { status { isNoContent() } }
        link().andExpect {
            jsonPath("$[0].title") { value("Кэш каталога") }
            jsonPath("$[0].state") { value("closed") }
        }
        // The events themselves tell everything: CoDraw did not ask GitHub.
        assertTrue(FakeGitHub.requests.isEmpty())
    }

    @Test
    fun `deleted and transferred issues are told by their events`() {
        val moved = issue.copy(id = 9999, repository = "acme/new", number = 3, updatedAt = Instant.parse("2026-01-03T00:00:00Z"))
        val transferred = json.writeValueAsString(
            mapOf(
                "action" to "transferred",
                "issue" to FakeGitHub.issueJson(issue),
                "repository" to FakeGitHub.repositoryJson("acme/shop"),
                "changes" to mapOf(
                    "new_issue" to FakeGitHub.issueJson(moved),
                    "new_repository" to mapOf("full_name" to "acme/new", "private" to true),
                ),
            ),
        )
        send("issues", transferred).andExpect { status { isNoContent() } }
        link().andExpect {
            jsonPath("$[0].repository") { value("acme/new") }
            jsonPath("$[0].number") { value(3) }
            jsonPath("$[0].private") { value(true) }
        }

        send("issues", event("deleted", moved)).andExpect { status { isNoContent() } }
        link().andExpect { jsonPath("$[0].sync") { value("deleted") } }
    }

    @Test
    fun `an event without the right signature changes nothing, and other events are taken without a change`() {
        issue.title = "Подмена"
        issue.updatedAt = Instant.parse("2026-01-02T00:00:00Z")
        val body = event("edited", issue)
        mockMvc.post(PATH) {
            header("X-GitHub-Event", "issues")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isUnauthorized() } }
        mockMvc.post(PATH) {
            header("X-GitHub-Event", "issues")
            header("X-Hub-Signature-256", sign(body, "another-secret"))
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isUnauthorized() } }
        link().andExpect { jsonPath("$[0].title") { value("Кэш для каталога") } }

        send("ping", """{"zen": "Keep it logically awesome."}""").andExpect { status { isNoContent() } }
        send("issues", """{"action": "edited"}""").andExpect { status { isBadRequest() } }
        send("issues", "not json").andExpect { status { isBadRequest() } }
    }

    private fun link(): ResultActionsDsl = mockMvc.get("/api/boards/$board/issue-links") { with(alice.session()) }

    private fun event(action: String, issue: FakeGitHub.Issue): String = json.writeValueAsString(
        mapOf("action" to action, "issue" to FakeGitHub.issueJson(issue), "repository" to FakeGitHub.repositoryJson(issue.repository)),
    )

    private fun send(event: String, body: String): ResultActionsDsl = mockMvc.post(PATH) {
        header("X-GitHub-Event", event)
        header("X-GitHub-Delivery", "72d3162e-cc78-11e3-81ab-4c9367dc0958")
        header("X-Hub-Signature-256", sign(body, FakeGitHubConfiguration.WEBHOOK_SECRET))
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private fun sign(body: String, secret: String): String = "sha256=" + Mac.getInstance("HmacSHA256").run {
        init(SecretKeySpec(secret.toByteArray(), "HmacSHA256"))
        HexFormat.of().formatHex(doFinal(body.toByteArray()))
    }

    private companion object {
        const val PATH = "/api/integrations/github/webhook"
        const val TOKEN = "github_pat_alice"
    }
}
