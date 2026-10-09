package io.github.thescarletarrow.codraw.workspace

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

/** A project: a shared folder of the boards of a workspace. */
data class WorkspaceProject(
    val id: UUID,
    val name: String,
)

/** Projects of workspaces. The caller checks that the user may see or change them and that names are normalized. */
@Repository
class WorkspaceProjects(private val jdbc: JdbcClient) {

    /** The projects of the workspace, by name. */
    fun list(workspaceId: UUID): List<WorkspaceProject> = jdbc.sql(
        "SELECT id, name FROM workspace_projects WHERE workspace_id = :workspaceId ORDER BY lower(name), id",
    )
        .param("workspaceId", workspaceId)
        .query { rs, _ -> WorkspaceProject(rs.getObject("id", UUID::class.java), rs.getString("name")) }
        .list()

    fun add(workspaceId: UUID, name: String, at: Instant): WorkspaceProject = jdbc.sql(
        "INSERT INTO workspace_projects (workspace_id, name, created_at) VALUES (:workspaceId, :name, :at) RETURNING id, name",
    )
        .param("workspaceId", workspaceId)
        .param("name", name)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> WorkspaceProject(rs.getObject("id", UUID::class.java), rs.getString("name")) }
        .single()

    fun rename(workspaceId: UUID, projectId: UUID, name: String): Boolean =
        jdbc.sql("UPDATE workspace_projects SET name = :name WHERE id = :projectId AND workspace_id = :workspaceId")
            .param("workspaceId", workspaceId)
            .param("projectId", projectId)
            .param("name", name)
            .update() > 0

    /** Deletes the project; its boards stay in the workspace, in no project. */
    fun delete(workspaceId: UUID, projectId: UUID): Boolean =
        jdbc.sql("DELETE FROM workspace_projects WHERE id = :projectId AND workspace_id = :workspaceId")
            .param("workspaceId", workspaceId)
            .param("projectId", projectId)
            .update() > 0
}
