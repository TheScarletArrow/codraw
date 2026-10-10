package io.github.thescarletarrow.codraw.workspace

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.IntegrationTest.Companion.INTERNAL_TOKEN
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.internal.InternalTokenInterceptor
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.empty
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@IntegrationTest
class WorkspaceBoardApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val boards: BoardService,
    @Autowired private val limits: LimitProperties,
) {

    private val api = WorkspaceApi(mockMvc)
    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var carol: User
    private lateinit var dave: User
    private lateinit var workspace: String

    /** Alice owns the workspace, Bob administers it, Carol edits and Dave views. */
    @BeforeEach
    fun createWorkspace() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM workspaces").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
        dave = users.gitHubUser("Dave")
        workspace = api.workspace(alice)
        api.join(alice, workspace, bob, "admin")
        api.join(alice, workspace, carol, "editor")
        api.join(alice, workspace, dave, "viewer")
    }

    @Test
    fun `editors create boards of the workspace, closed by link, that its members see by their roles`() {
        val board = api.createBoard(carol, workspace, "Схема").andExpect {
            status { isCreated() }
            jsonPath("$.role") { value("owner") }
            jsonPath("$.linkAccess") { value("none") }
            jsonPath("$.workspaceAccess") { value("edit") }
            jsonPath("$.workspace.id") { value(workspace) }
            jsonPath("$.workspace.name") { value("Платформа") }
        }.let(WorkspaceApi::idOf)
        api.createBoard(dave, workspace).andExpect { status { isForbidden() } }
        api.createBoard(users.gitHubUser("Erin"), workspace).andExpect { status { isNotFound() } }

        api.boards(dave, workspace).andExpect {
            jsonPath("$[*].id") { value(contains(board)) }
            jsonPath("$[0].role") { value("viewer") }
            jsonPath("$[0].owner.name") { value("Carol") }
            jsonPath("$[0].openedAt") { value(null as Any?) }
        }
        api.board(dave, board).andExpect { jsonPath("$.role") { value("viewer") } }
        api.board(bob, board).andExpect { jsonPath("$.role") { value("owner") } }
        api.board(users.gitHubUser("Erin"), board).andExpect { status { isForbidden() } }
        api.get(alice, workspace).andExpect { jsonPath("$.boards") { value(1) } }
        mockMvc.get("/api/boards") { with(carol.session()) }.andExpect { jsonPath("$") { value(empty<Any>()) } }
        mockMvc.get("/api/boards/shared") { with(dave.session()) }.andExpect { jsonPath("$") { value(empty<Any>()) } }
    }

    @Test
    fun `what the workspace gives its editors and viewers follows the access of the board`() {
        val board = api.newBoard(carol, workspace)
        api.board(carol, board).andExpect { jsonPath("$.role") { value("owner") } }

        api.patchBoard(dave, board, """{"workspaceAccess": "view"}""").andExpect { status { isForbidden() } }
        api.patchBoard(bob, board, """{"workspaceAccess": "view"}""").andExpect {
            status { isOk() }
            jsonPath("$.workspaceAccess") { value("view") }
        }
        val erin = users.gitHubUser("Erin")
        api.join(alice, workspace, erin, "editor")
        api.board(erin, board).andExpect { jsonPath("$.role") { value("viewer") } }
        api.board(dave, board).andExpect { jsonPath("$.role") { value("viewer") } }

        api.patchBoard(carol, board, """{"workspaceAccess": "none"}""").andExpect { status { isOk() } }
        api.board(erin, board).andExpect { status { isForbidden() } }
        api.board(dave, board).andExpect { status { isForbidden() } }
        api.board(bob, board).andExpect { jsonPath("$.role") { value("owner") } }
        api.boards(dave, workspace).andExpect { jsonPath("$") { value(empty<Any>()) } }

        api.patchBoard(alice, api.personalBoard(alice), """{"workspaceAccess": "view"}""").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `those who manage the workspace manage its boards, and a role of their own only adds to the inherited one`() {
        val board = api.newBoard(carol, workspace)
        api.patchBoard(dave, board, """{"title": "Чужое"}""").andExpect { status { isForbidden() } }
        api.patchBoard(bob, board, """{"title": "Схема команды"}""").andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Схема команды") }
        }
        api.patchBoard(carol, board, """{"workspaceAccess": "view"}""").andExpect { status { isOk() } }

        // An exception for one member of the workspace.
        val erin = users.gitHubUser("Erin")
        api.join(alice, workspace, erin, "editor")
        api.put(carol, "/api/boards/$board/members/${erin.id}", """{"role": "editor"}""").andExpect { status { isOk() } }
        api.put(carol, "/api/boards/$board/members/${bob.id}", """{"role": "viewer"}""").andExpect { status { isOk() } }
        api.put(carol, "/api/boards/$board/members/${users.gitHubUser("Frank").id}", """{"role": "viewer"}""")
            .andExpect { status { isNotFound() } }

        api.board(erin, board).andExpect { jsonPath("$.role") { value("editor") } }
        api.board(bob, board).andExpect { jsonPath("$.role") { value("owner") } }
        mockMvc.get("/api/boards/$board/visitors") { with(carol.session()) }.andExpect { jsonPath("$") { value(empty<Any>()) } }
    }

    @Test
    fun `the owner of a personal board brings it into the workspace, which then gives its members their roles`() {
        val board = api.personalBoard(carol, "Моя схема")
        api.board(dave, board).andExpect { jsonPath("$.role") { value("editor") } }
        api.patchBoard(carol, board, """{"linkAccess": "none"}""").andExpect { status { isOk() } }

        api.move(dave, board, workspace).andExpect { status { isForbidden() } }
        api.move(carol, board, workspace).andExpect {
            status { isOk() }
            jsonPath("$.workspace.name") { value("Платформа") }
            jsonPath("$.role") { value("owner") }
        }

        mockMvc.get("/api/boards") { with(carol.session()) }.andExpect { jsonPath("$") { value(empty<Any>()) } }
        api.boards(dave, workspace).andExpect { jsonPath("$[*].title") { value(contains("Моя схема")) } }
        api.board(dave, board).andExpect { jsonPath("$.role") { value("viewer") } }
        mockMvc.get("/api/boards/shared") { with(dave.session()) }.andExpect { jsonPath("$") { value(empty<Any>()) } }

        val viewersBoard = api.personalBoard(dave)
        api.move(dave, viewersBoard, workspace).andExpect { status { isForbidden() } }
        api.move(carol, api.personalBoard(carol), null).andExpect { status { isBadRequest() } }
    }

    @Test
    fun `only who manages the workspace takes a board out of it, and the member responsible stays an editor`() {
        val board = api.newBoard(carol, workspace)

        api.move(carol, board, null).andExpect { status { isForbidden() } }
        api.move(bob, board, null).andExpect {
            status { isOk() }
            jsonPath("$.workspace") { value(null as Any?) }
            jsonPath("$.owner.name") { value("Bob") }
        }

        api.board(carol, board).andExpect { jsonPath("$.role") { value("editor") } }
        api.board(dave, board).andExpect { status { isForbidden() } }
        mockMvc.get("/api/boards") { with(bob.session()) }.andExpect { jsonPath("$[*].id") { value(contains(board)) } }
    }

    @Test
    fun `boards move between projects of their workspace, never straight into another workspace`() {
        val project = WorkspaceApi.idOf(api.createProject(alice, workspace, "Платежи"))
        val board = api.newBoard(carol, workspace)
        val other = api.workspace(carol, "Другое")
        val foreign = WorkspaceApi.idOf(api.createProject(carol, other, "Чужой"))

        api.move(carol, board, workspace, project).andExpect { jsonPath("$.projectId") { value(project) } }
        api.move(dave, board, workspace, null).andExpect { status { isForbidden() } }
        api.move(carol, board, workspace, foreign).andExpect { status { isNotFound() } }
        api.move(carol, board, other).andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Board in another workspace") }
        }
        api.boards(dave, workspace).andExpect { jsonPath("$[0].projectId") { value(project) } }
    }

    @Test
    fun `boards of the workspace count against its own limit, not the personal one`() {
        repeat(limits.boardsPerUser) { boards.create("Личная $it", carol.id) }
        api.createBoard(carol, workspace).andExpect { status { isCreated() } }

        jdbcClient.sql(
            """
            INSERT INTO boards (title, owner_id, created_at, updated_at, workspace_id)
            SELECT 'Доска ' || n, :owner, now(), now(), :workspace::uuid FROM generate_series(2, :count) n
            """,
        )
            .param("owner", alice.id)
            .param("workspace", workspace)
            .param("count", limits.boardsPerWorkspace)
            .update()
        api.createBoard(carol, workspace).andExpect {
            status { isConflict() }
            jsonPath("$.limit") { value(limits.boardsPerWorkspace) }
        }
        api.move(carol, boards.list(carol.id).first().id.toString(), workspace).andExpect {
            status { isConflict() }
            jsonPath("$.limit") { value(limits.boardsPerWorkspace) }
        }
    }

    @Test
    fun `a deleted board of the workspace waits in the trash of those who manage it`() {
        val board = api.newBoard(carol, workspace, "Удалённая")
        mockMvc.delete("/api/boards/$board") {
            with(carol.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        for (user in listOf(alice, bob, carol)) {
            mockMvc.get("/api/boards/trash") { with(user.session()) }.andExpect {
                jsonPath("$[*].id") { value(contains(board)) }
                jsonPath("$[0].workspace.name") { value("Платформа") }
            }
        }
        mockMvc.get("/api/boards/trash") { with(dave.session()) }.andExpect { jsonPath("$") { value(empty<Any>()) } }
        mockMvc.post("/api/boards/trash/$board/restore") {
            with(dave.session())
            with(csrf())
        }.andExpect { status { isForbidden() } }

        mockMvc.post("/api/boards/trash/$board/restore") {
            with(bob.session())
            with(csrf())
        }.andExpect {
            status { isOk() }
            jsonPath("$.role") { value("owner") }
            jsonPath("$.workspace.id") { value(workspace) }
        }
        api.boards(dave, workspace).andExpect { jsonPath("$[*].id") { value(contains(board)) } }
    }

    @Test
    fun `the owner of a board of the workspace hands it to another member of the workspace`() {
        val board = api.newBoard(carol, workspace)
        api.patchBoard(carol, board, """{"workspaceAccess": "none"}""").andExpect { status { isOk() } }

        api.put(carol, "/api/boards/$board/owner", """{"userId": "${users.gitHubUser("Erin").id}"}""")
            .andExpect { status { isNotFound() } }
        api.put(bob, "/api/boards/$board/owner", """{"userId": "${dave.id}"}""").andExpect {
            status { isOk() }
            jsonPath("$.owner.name") { value("Dave") }
            jsonPath("$.role") { value("owner") }
        }

        api.board(dave, board).andExpect { jsonPath("$.role") { value("owner") } }
        // Nothing of the workspace would let Carol in: she stays an editor of the board.
        api.board(carol, board).andExpect { jsonPath("$.role") { value("editor") } }
    }

    @Test
    fun `collab learns what the workspace gives its members on a board`() {
        val board = api.newBoard(carol, workspace)
        api.patchBoard(carol, board, """{"workspaceAccess": "view"}""").andExpect { status { isOk() } }

        mockMvc.get("/internal/boards/$board/access") { header(InternalTokenInterceptor.HEADER, INTERNAL_TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.ownerId") { value(carol.id.toString()) }
            jsonPath("$.linkAccess") { value("none") }
            jsonPath("$.workspace.access") { value("view") }
            jsonPath("$.workspace.roles.${alice.id}") { value("owner") }
            jsonPath("$.workspace.roles.${bob.id}") { value("admin") }
            jsonPath("$.workspace.roles.${carol.id}") { value("editor") }
            jsonPath("$.workspace.roles.${dave.id}") { value("viewer") }
        }
        mockMvc.get("/internal/boards/${api.personalBoard(alice)}/access") {
            header(InternalTokenInterceptor.HEADER, INTERNAL_TOKEN)
        }.andExpect { jsonPath("$.workspace") { value(null as Any?) } }
    }

    @Test
    fun `members of the workspace may be mentioned on its boards`() {
        val board = api.newBoard(carol, workspace)
        mockMvc.get("/api/boards/$board/people") { with(carol.session()) }.andExpect {
            status { isOk() }
            jsonPath("$[*].name") { value(org.hamcrest.Matchers.containsInAnyOrder("Carol", "Alice", "Bob", "Dave")) }
        }
    }
}
