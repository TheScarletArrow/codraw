package io.github.thescarletarrow.codraw.issue

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.not
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
import org.springframework.test.web.servlet.put
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@IntegrationTest
class IssueTrackerApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
) {

    private lateinit var alice: User

    @BeforeEach
    fun clean() {
        jdbcClient.sql("DELETE FROM issue_tracker_connections").update()
        FakeGitHub.reset()
        FakeGitHub.account(TOKEN, "alice-gh", "acme/shop", "acme/secret")
        FakeGitHub.privateRepository("acme/secret")
        alice = users.gitHubUser("Alice")
    }

    @Test
    fun `a user connects with a token that GitHub takes, and the settings never show it`() {
        settings(alice).andExpect {
            status { isOk() }
            jsonPath("$.available") { value(true) }
            jsonPath("$.tracker") { value("github") }
            jsonPath("$.webUrl") { value(FakeGitHub.url) }
            jsonPath("$.connection") { value(nullValue()) }
        }

        connect(alice, "  $TOKEN  ").andExpect {
            status { isOk() }
            jsonPath("$.login") { value("alice-gh") }
            jsonPath("$.working") { value(true) }
        }
        settings(alice).andExpect {
            jsonPath("$.connection.login") { value("alice-gh") }
            content { string(not(containsString(TOKEN))) }
        }
        assertEquals(TOKEN, FakeGitHub.requests.single().token)
        assertEquals("/user", FakeGitHub.requests.single().path)
    }

    @Test
    fun `a token that GitHub refuses is not saved, and a guest connects nothing`() {
        connect(alice, "wrong-token").andExpect {
            status { isBadRequest() }
            jsonPath("$.reason") { value("invalid-token") }
        }
        connect(alice, "two words").andExpect { jsonPath("$.reason") { value("invalid-token") } }
        settings(alice).andExpect { jsonPath("$.connection") { value(nullValue()) } }

        val guest = users.createGuest()
        settings(guest).andExpect {
            status { isForbidden() }
            jsonPath("$.reason") { value("guest") }
        }
        connect(guest, TOKEN).andExpect { status { isForbidden() } }
    }

    @Test
    fun `a connected user finds their repositories and issues, a pull request is no issue`() {
        connect(alice, TOKEN)
        FakeGitHub.issue("acme/shop", 12, "Кэш для каталога")
        FakeGitHub.issue("acme/shop", 13, "Очередь заказов")
        FakeGitHub.issue("acme/shop", 14, "Обновить зависимости", pullRequest = true)
        FakeGitHub.issue("acme/secret", 1, "Ключи")

        get(alice, "/repositories").andExpect {
            status { isOk() }
            jsonPath("$[*].fullName") { value(contains("acme/secret", "acme/shop")) }
            jsonPath("$[0].private") { value(true) }
        }
        get(alice, "/issues?repository=acme/shop&number=12").andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Кэш для каталога") }
            jsonPath("$.state") { value("open") }
            jsonPath("$.url") { value("https://github.com/acme/shop/issues/12") }
            jsonPath("$.private") { value(false) }
        }
        get(alice, "/issues?repository=acme/secret&number=1").andExpect { jsonPath("$.private") { value(true) } }
        get(alice, "/issues?repository=acme/shop&number=14").andExpect {
            status { isBadRequest() }
            jsonPath("$.reason") { value("not-an-issue") }
        }
        get(alice, "/issues?repository=acme/shop&number=99").andExpect {
            status { isNotFound() }
            jsonPath("$.reason") { value("not-found") }
        }
        get(alice, "/issues?repository=other/repo&number=1").andExpect { jsonPath("$.reason") { value("not-found") } }
        get(alice, "/issues?repository=acme/shop&query=заказ").andExpect {
            status { isOk() }
            jsonPath("$[*].number") { value(contains(13)) }
            jsonPath("$[0].private") { value(nullValue()) }
        }
        // Words only: a qualifier of the text does not search another repository.
        get(alice, "/issues?repository=acme/shop&query=repo:acme/secret").andExpect { jsonPath("$") { isEmpty() } }
        assertTrue(FakeGitHub.requests.last().path.endsWith("q=repo%3Aacme%2Fshop+is%3Aissue+repo+acme%2Fsecret&per_page=10"))
        get(alice, "/issues?repository=not-a-repository&number=1").andExpect { status { isBadRequest() } }
        get(alice, "/issues?repository=acme/shop").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `without a connection or with a revoked token nothing is found, and the settings tell to connect again`() {
        get(alice, "/repositories").andExpect {
            status { isConflict() }
            jsonPath("$.reason") { value("not-connected") }
        }
        connect(alice, TOKEN)
        FakeGitHub.revoke(TOKEN)
        get(alice, "/repositories").andExpect {
            status { isConflict() }
            jsonPath("$.reason") { value("token-rejected") }
        }
        settings(alice).andExpect {
            jsonPath("$.connection.working") { value(false) }
            jsonPath("$.connection.rejectedAt") { exists() }
        }
        val calls = FakeGitHub.requests.size
        // A refused token is not sent again.
        get(alice, "/repositories").andExpect { jsonPath("$.reason") { value("token-rejected") } }
        assertEquals(calls, FakeGitHub.requests.size)

        FakeGitHub.account("new-token", "alice-gh", "acme/shop")
        connect(alice, "new-token").andExpect { jsonPath("$.working") { value(true) } }
        get(alice, "/repositories").andExpect { status { isOk() } }
    }

    @Test
    fun `GitHub that does not answer is told apart, and disconnecting forgets the token`() {
        connect(alice, TOKEN)
        FakeGitHub.failing = 503
        get(alice, "/repositories").andExpect {
            status { isBadGateway() }
            jsonPath("$.reason") { value("tracker-unavailable") }
        }
        FakeGitHub.failing = null

        mockMvc.delete("$PATH/connection") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        settings(alice).andExpect { jsonPath("$.connection") { value(nullValue()) } }
        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM issue_tracker_connections").query(Int::class.java).single())
    }

    private fun settings(user: User): ResultActionsDsl = get(user, "")

    private fun get(user: User, path: String): ResultActionsDsl = mockMvc.get("$PATH$path") { with(user.session()) }

    private fun connect(user: User, token: String): ResultActionsDsl = mockMvc.put("$PATH/connection") {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"token": "$token"}"""
    }

    private companion object {
        const val PATH = "/api/issue-tracker"
        const val TOKEN = "github_pat_alice"
    }
}
