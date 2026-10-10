package io.github.thescarletarrow.codraw.workspace

import com.jayway.jsonpath.JsonPath
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

/** Requests of the API of workspaces and boards as the tests make them, each as a given user. */
class WorkspaceApi(private val mockMvc: MockMvc) {

    fun create(user: User, name: String = "Платформа"): ResultActionsDsl = post(user, "/api/workspaces", """{"name": "$name"}""")

    /** Creates the workspace [name] owned by the [user] and returns its id. */
    fun workspace(user: User, name: String = "Платформа"): String =
        idOf(create(user, name).andExpect { status { isCreated() } })

    fun get(user: User, workspace: String): ResultActionsDsl = mockMvc.get("/api/workspaces/$workspace") { with(user.session()) }

    fun list(user: User): ResultActionsDsl = mockMvc.get("/api/workspaces") { with(user.session()) }

    fun members(user: User, workspace: String): ResultActionsDsl =
        mockMvc.get("/api/workspaces/$workspace/members") { with(user.session()) }

    fun changeRole(user: User, workspace: String, member: User, role: String): ResultActionsDsl =
        put(user, "/api/workspaces/$workspace/members/${member.id}", """{"role": "$role"}""")

    fun remove(user: User, workspace: String, member: User): ResultActionsDsl =
        mockMvc.delete("/api/workspaces/$workspace/members/${member.id}") {
            with(user.session())
            with(csrf())
        }

    fun invite(user: User, workspace: String, role: String): ResultActionsDsl =
        post(user, "/api/workspaces/$workspace/invites", """{"role": "$role"}""")

    fun invites(user: User, workspace: String): ResultActionsDsl =
        mockMvc.get("/api/workspaces/$workspace/invites") { with(user.session()) }

    fun accept(user: User, token: String): ResultActionsDsl = post(user, "/api/workspace-invites/$token/accept", null)

    /** Makes the [member] a member of the [workspace] with the [role] through an invitation of its owner [owner]. */
    fun join(owner: User, workspace: String, member: User, role: String) {
        val path = JsonPath.read<String>(
            invite(owner, workspace, role).andExpect { status { isCreated() } }.andReturn().response.contentAsString,
            "$.path",
        )
        accept(member, path.substringAfterLast('/')).andExpect { status { isOk() } }
    }

    fun projects(user: User, workspace: String): ResultActionsDsl =
        mockMvc.get("/api/workspaces/$workspace/projects") { with(user.session()) }

    fun createProject(user: User, workspace: String, name: String): ResultActionsDsl =
        post(user, "/api/workspaces/$workspace/projects", """{"name": "$name"}""")

    fun boards(user: User, workspace: String): ResultActionsDsl =
        mockMvc.get("/api/workspaces/$workspace/boards") { with(user.session()) }

    fun createBoard(user: User, workspace: String, title: String = "Доска", project: String? = null): ResultActionsDsl =
        post(
            user,
            "/api/workspaces/$workspace/boards",
            """{"title": "$title", "projectId": ${project?.let { "\"$it\"" } ?: "null"}}""",
        )

    /** Creates the board [title] in the [workspace] as the [user] and returns its id. */
    fun newBoard(user: User, workspace: String, title: String = "Доска", project: String? = null): String =
        idOf(createBoard(user, workspace, title, project).andExpect { status { isCreated() } })

    fun move(user: User, board: String, workspace: String?, project: String? = null): ResultActionsDsl = put(
        user,
        "/api/boards/$board/workspace",
        """{"workspaceId": ${workspace?.let { "\"$it\"" } ?: "null"}, "projectId": ${project?.let { "\"$it\"" } ?: "null"}}""",
    )

    fun patchBoard(user: User, board: String, body: String): ResultActionsDsl =
        mockMvc.patch("/api/boards/$board") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    fun board(user: User, board: String): ResultActionsDsl = mockMvc.get("/api/boards/$board") { with(user.session()) }

    /** Creates a personal board of the [user] and returns its id. */
    fun personalBoard(user: User, title: String = "Своя"): String =
        idOf(post(user, "/api/boards", """{"title": "$title"}""").andExpect { status { isCreated() } })

    fun delete(user: User, workspace: String): ResultActionsDsl = mockMvc.delete("/api/workspaces/$workspace") {
        with(user.session())
        with(csrf())
    }

    fun post(user: User, path: String, body: String?): ResultActionsDsl = mockMvc.post(path) {
        with(user.session())
        with(csrf())
        if (body != null) {
            contentType = MediaType.APPLICATION_JSON
            content = body
        }
    }

    fun put(user: User, path: String, body: String): ResultActionsDsl = mockMvc.put(path) {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    companion object {
        fun idOf(result: ResultActionsDsl): String = JsonPath.read(result.andReturn().response.contentAsString, "$.id")
    }
}
