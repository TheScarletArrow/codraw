package io.github.thescarletarrow.codraw.workspace

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.matchesPattern
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import kotlin.test.assertEquals

@IntegrationTest
class WorkspaceApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val registry: MeterRegistry,
) {

    private val api = WorkspaceApi(mockMvc)
    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var carol: User
    private lateinit var dave: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM workspaces").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
        dave = users.gitHubUser("Dave")
    }

    @Test
    fun `the user who creates a workspace owns it, and only its members find it`() {
        val workspace = api.create(alice, "  Платформа   данных ").andExpect {
            status { isCreated() }
            header { string("Location", matchesPattern("/api/workspaces/[0-9a-f-]{36}")) }
            jsonPath("$.name") { value("Платформа данных") }
            jsonPath("$.role") { value("owner") }
            jsonPath("$.members") { value(1) }
            jsonPath("$.boards") { value(0) }
        }.let(WorkspaceApi::idOf)
        api.workspace(alice, "Архив")

        api.list(alice).andExpect { jsonPath("$[*].name") { value(contains("Архив", "Платформа данных")) } }
        api.list(bob).andExpect { jsonPath("$") { value(empty<Any>()) } }
        api.get(bob, workspace).andExpect { status { isNotFound() } }
        api.get(alice, "not-a-uuid").andExpect { status { isNotFound() } }
        api.create(alice, "   ").andExpect { status { isBadRequest() } }
        api.create(alice, "x".repeat(81)).andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a guest neither creates a workspace nor joins one`() {
        val guest = users.createGuest()
        val workspace = api.workspace(alice)
        val token = tokenOf(api.invite(alice, workspace, "editor"))

        api.create(guest).andExpect {
            status { isForbidden() }
            jsonPath("$.title") { value("Account required") }
        }
        api.accept(guest, token).andExpect { status { isForbidden() } }
        api.members(alice, workspace).andExpect { jsonPath("$[*].name") { value(contains("Alice")) } }
    }

    @Test
    fun `members join through invitations, and a lower invitation takes no role away`() {
        val workspace = api.workspace(alice)
        val editors = tokenOf(api.invite(alice, workspace, "editor").andExpect {
            status { isCreated() }
            jsonPath("$.path") { value(matchesPattern("/workspace-invite/[A-Za-z0-9_-]{22}")) }
            jsonPath("$.role") { value("editor") }
        })
        val viewers = tokenOf(api.invite(alice, workspace, "viewer"))

        api.accept(bob, viewers).andExpect {
            status { isOk() }
            jsonPath("$.role") { value("viewer") }
        }
        api.accept(bob, editors).andExpect { jsonPath("$.role") { value("editor") } }
        api.accept(bob, viewers).andExpect { jsonPath("$.role") { value("editor") } }
        api.accept(alice, viewers).andExpect { jsonPath("$.role") { value("owner") } }

        api.members(bob, workspace).andExpect {
            status { isOk() }
            jsonPath("$[*].name") { value(contains("Alice", "Bob")) }
            jsonPath("$[*].role") { value(contains("owner", "editor")) }
        }
        api.get(alice, workspace).andExpect { jsonPath("$.members") { value(2) } }
    }

    @Test
    fun `a revoked invitation lets nobody in, and only who may give its role sees and revokes invitations`() {
        val workspace = api.workspace(alice)
        api.join(alice, workspace, bob, "admin")
        api.join(alice, workspace, carol, "editor")
        val invite = api.invite(alice, workspace, "admin").andExpect { status { isCreated() } }
        val id = WorkspaceApi.idOf(invite)
        val token = tokenOf(invite)

        api.invite(bob, workspace, "admin").andExpect { status { isForbidden() } }
        api.invite(bob, workspace, "editor").andExpect { status { isCreated() } }
        api.invite(alice, workspace, "owner").andExpect { status { isBadRequest() } }
        api.invites(carol, workspace).andExpect { status { isForbidden() } }
        // The invitations that Bob and Carol joined through, then the two new ones.
        api.invites(bob, workspace).andExpect { jsonPath("$[*].role") { value(contains("admin", "editor", "admin", "editor")) } }
        revoke(bob, workspace, id).andExpect { status { isForbidden() } }

        revoke(alice, workspace, id).andExpect { status { isNoContent() } }
        api.accept(dave, token).andExpect { status { isNotFound() } }
        api.list(dave).andExpect { jsonPath("$") { value(empty<Any>()) } }
    }

    @Test
    fun `an administrator manages editors and viewers only, an editor nobody`() {
        val workspace = api.workspace(alice)
        api.join(alice, workspace, bob, "admin")
        api.join(alice, workspace, carol, "viewer")
        api.join(alice, workspace, dave, "admin")

        api.changeRole(bob, workspace, carol, "editor").andExpect {
            status { isOk() }
            jsonPath("$.role") { value("editor") }
        }
        api.changeRole(bob, workspace, carol, "admin").andExpect { status { isForbidden() } }
        api.changeRole(bob, workspace, dave, "viewer").andExpect { status { isForbidden() } }
        api.remove(bob, workspace, dave).andExpect { status { isForbidden() } }
        api.changeRole(carol, workspace, alice, "viewer").andExpect { status { isForbidden() } }
        api.changeRole(bob, workspace, carol, "boss").andExpect { status { isBadRequest() } }
        api.changeRole(alice, workspace, dave, "viewer").andExpect { jsonPath("$.role") { value("viewer") } }
        api.changeRole(alice, workspace, users.gitHubUser("Erin"), "viewer").andExpect { status { isNotFound() } }

        api.remove(bob, workspace, carol).andExpect { status { isNoContent() } }
        api.get(carol, workspace).andExpect { status { isNotFound() } }
    }

    @Test
    fun `the last owner stays, and a second owner lets the first leave`() {
        val workspace = api.workspace(alice)
        api.join(alice, workspace, bob, "admin")

        api.changeRole(alice, workspace, alice, "admin").andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Last owner") }
        }
        api.remove(alice, workspace, alice).andExpect { status { isConflict() } }

        api.changeRole(alice, workspace, bob, "owner").andExpect { status { isOk() } }
        api.remove(alice, workspace, alice).andExpect { status { isNoContent() } }
        api.members(bob, workspace).andExpect {
            jsonPath("$[*].name") { value(contains("Bob")) }
            jsonPath("$[*].role") { value(contains("owner")) }
        }
    }

    @Test
    fun `projects are shared folders that those who manage the workspace keep`() {
        val workspace = api.workspace(alice)
        api.join(alice, workspace, bob, "editor")
        val project = WorkspaceApi.idOf(api.createProject(alice, workspace, "Платежи").andExpect { status { isCreated() } })
        api.createProject(alice, workspace, "Аналитика").andExpect { status { isCreated() } }

        api.createProject(alice, workspace, "платежи").andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Project name taken") }
        }
        api.createProject(bob, workspace, "Склад").andExpect { status { isForbidden() } }
        api.projects(bob, workspace).andExpect { jsonPath("$[*].name") { value(contains("Аналитика", "Платежи")) } }

        val board = api.newBoard(bob, workspace, project = project)
        mockMvc.delete("/api/workspaces/$workspace/projects/$project") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        api.projects(bob, workspace).andExpect { jsonPath("$[*].name") { value(contains("Аналитика")) } }
        api.board(bob, board).andExpect { jsonPath("$.projectId") { value(null as Any?) } }
        api.boards(bob, workspace).andExpect { jsonPath("$[*].id") { value(contains(board)) } }
    }

    @Test
    fun `a user is in at most 20 workspaces`() {
        repeat(20) { api.workspace(alice, "Пространство $it") }
        val other = api.workspace(bob)
        val reached = reached("workspaces")

        api.create(alice).andExpect {
            status { isConflict() }
            jsonPath("$.limit") { value(20) }
        }
        api.accept(alice, tokenOf(api.invite(bob, other, "viewer"))).andExpect { status { isConflict() } }

        assertEquals(reached + 2, reached("workspaces"))
    }

    @Test
    fun `removing a member takes their access to every board of the workspace and passes their boards on`() {
        val workspace = api.workspace(alice)
        api.join(alice, workspace, bob, "admin")
        api.join(alice, workspace, carol, "editor")
        val own = api.newBoard(carol, workspace, "Схема Кэрол")
        val other = api.newBoard(alice, workspace, "Схема Алисы")
        // A role of her own on a board of the team goes with her place in the team.
        api.put(alice, "/api/boards/$other/members/${carol.id}", """{"role": "editor"}""").andExpect { status { isOk() } }
        api.board(carol, other).andExpect { jsonPath("$.role") { value("editor") } }

        api.remove(bob, workspace, carol).andExpect { status { isNoContent() } }

        api.board(carol, own).andExpect { status { isForbidden() } }
        api.board(carol, other).andExpect { status { isForbidden() } }
        mockMvc.post("/api/boards/$other/collab-token") {
            with(carol.session())
            with(csrf())
        }.andExpect { status { isForbidden() } }
        api.board(bob, own).andExpect {
            status { isOk() }
            jsonPath("$.owner.name") { value("Bob") }
        }
        mockMvc.get("/api/boards/$other/members") { with(alice.session()) }
            .andExpect { jsonPath("$[*].name") { value(contains("Alice")) } }
        api.boards(alice, workspace).andExpect {
            jsonPath("$[*].title") { value(org.hamcrest.Matchers.containsInAnyOrder("Схема Алисы", "Схема Кэрол")) }
        }
    }

    @Test
    fun `a member who leaves passes their boards to the first owner`() {
        val workspace = api.workspace(alice)
        api.join(alice, workspace, bob, "admin")
        api.changeRole(alice, workspace, bob, "owner").andExpect { status { isOk() } }
        api.join(alice, workspace, carol, "editor")
        val board = api.newBoard(carol, workspace)

        api.remove(carol, workspace, carol).andExpect { status { isNoContent() } }

        api.board(alice, board).andExpect { jsonPath("$.owner.name") { value("Alice") } }
        api.list(carol).andExpect { jsonPath("$") { value(empty<Any>()) } }
    }

    @Test
    fun `deleting a workspace puts all its boards into the trash of its owner`() {
        val workspace = api.workspace(alice)
        api.join(alice, workspace, bob, "admin")
        api.join(alice, workspace, carol, "editor")
        val first = api.newBoard(carol, workspace, "Первая")
        val second = api.newBoard(bob, workspace, "Вторая")
        api.createProject(alice, workspace, "Платежи")

        api.delete(bob, workspace).andExpect { status { isForbidden() } }
        api.delete(alice, workspace).andExpect { status { isNoContent() } }

        api.list(carol).andExpect { jsonPath("$") { value(empty<Any>()) } }
        api.get(alice, workspace).andExpect { status { isNotFound() } }
        api.board(carol, first).andExpect { status { isNotFound() } }
        mockMvc.get("/api/boards/trash") { with(alice.session()) }.andExpect {
            jsonPath("$[*].id") { value(org.hamcrest.Matchers.containsInAnyOrder(first, second)) }
            jsonPath("$[0].workspace") { value(null as Any?) }
        }
        mockMvc.get("/api/boards/trash") { with(carol.session()) }.andExpect { jsonPath("$") { value(empty<Any>()) } }
        mockMvc.post("/api/boards/trash/$first/restore") {
            with(alice.session())
            with(csrf())
        }.andExpect {
            status { isOk() }
            jsonPath("$.role") { value("owner") }
            jsonPath("$.workspace") { value(null as Any?) }
        }
        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect { jsonPath("$[*].id") { value(contains(first)) } }
        api.board(carol, first).andExpect { status { isForbidden() } }
    }

    private fun revoke(user: User, workspace: String, invite: String) = mockMvc.delete("/api/workspaces/$workspace/invites/$invite") {
        with(user.session())
        with(csrf())
    }

    private fun tokenOf(result: org.springframework.test.web.servlet.ResultActionsDsl): String =
        com.jayway.jsonpath.JsonPath.read<String>(result.andReturn().response.contentAsString, "$.path").substringAfterLast('/')

    private fun reached(limit: String): Double =
        registry.find("codraw.limits.reached").tag("limit", limit).counter()?.count() ?: 0.0
}
