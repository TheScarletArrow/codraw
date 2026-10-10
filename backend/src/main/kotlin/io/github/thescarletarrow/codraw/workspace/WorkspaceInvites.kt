package io.github.thescarletarrow.codraw.workspace

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** An invitation link of a workspace: whoever accepts it becomes a member with its [role]. */
data class WorkspaceInvite(
    val id: UUID,
    val workspaceId: UUID,
    /** The secret part of the address of the invitation. */
    val token: String,
    val role: WorkspaceRole,
    val createdAt: Instant,
)

/** Invitation links of workspaces; a revoked one is deleted. */
@Repository
class WorkspaceInvites(private val jdbc: JdbcClient) {

    /** The invitations of the workspace, oldest first. */
    fun list(workspaceId: UUID): List<WorkspaceInvite> = jdbc.sql(
        "SELECT * FROM workspace_invites WHERE workspace_id = :workspaceId ORDER BY created_at, id",
    )
        .param("workspaceId", workspaceId)
        .query { rs, _ -> rs.toInvite() }
        .list()

    fun find(token: String): WorkspaceInvite? = jdbc.sql("SELECT * FROM workspace_invites WHERE token = :token")
        .param("token", token)
        .query { rs, _ -> rs.toInvite() }
        .optional()
        .orElse(null)

    fun find(workspaceId: UUID, inviteId: UUID): WorkspaceInvite? = jdbc.sql(
        "SELECT * FROM workspace_invites WHERE id = :inviteId AND workspace_id = :workspaceId",
    )
        .param("workspaceId", workspaceId)
        .param("inviteId", inviteId)
        .query { rs, _ -> rs.toInvite() }
        .optional()
        .orElse(null)

    fun count(workspaceId: UUID): Int = jdbc.sql("SELECT count(*) FROM workspace_invites WHERE workspace_id = :workspaceId")
        .param("workspaceId", workspaceId)
        .query(Int::class.java)
        .single()

    fun add(workspaceId: UUID, token: String, role: WorkspaceRole, at: Instant): WorkspaceInvite = jdbc.sql(
        """
        INSERT INTO workspace_invites (workspace_id, token, role, created_at) VALUES (:workspaceId, :token, :role, :at)
        RETURNING *
        """,
    )
        .param("workspaceId", workspaceId)
        .param("token", token)
        .param("role", role.name)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> rs.toInvite() }
        .single()

    fun delete(workspaceId: UUID, inviteId: UUID): Boolean =
        jdbc.sql("DELETE FROM workspace_invites WHERE id = :inviteId AND workspace_id = :workspaceId")
            .param("inviteId", inviteId)
            .param("workspaceId", workspaceId)
            .update() > 0

    private fun ResultSet.toInvite() = WorkspaceInvite(
        id = getObject("id", UUID::class.java),
        workspaceId = getObject("workspace_id", UUID::class.java),
        token = getString("token"),
        role = WorkspaceRole.valueOf(getString("role")),
        createdAt = getObject("created_at", OffsetDateTime::class.java).toInstant(),
    )
}
