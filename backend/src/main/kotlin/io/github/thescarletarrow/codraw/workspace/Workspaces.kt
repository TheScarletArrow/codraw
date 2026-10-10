package io.github.thescarletarrow.codraw.workspace

import com.fasterxml.jackson.annotation.JsonValue
import io.github.thescarletarrow.codraw.board.BoardRole
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** A team workspace: a shared place of work whose members get roles on its boards by their role in it. */
data class Workspace(
    val id: UUID,
    val name: String,
    val createdAt: Instant,
)

/** What a member may do in a workspace. Stored by its name; declared from the least to the most allowed. */
enum class WorkspaceRole(@get:JsonValue val value: String, val boardRole: BoardRole) {
    /** Views the boards that the workspace gives its members, and comments on them. */
    VIEWER("viewer", BoardRole.VIEWER),

    /** Edits the boards of the workspace, creates boards in it and brings their own boards into it. */
    EDITOR("editor", BoardRole.EDITOR),

    /** Manages the projects, the editors and the viewers, and all boards of the workspace. */
    ADMIN("admin", BoardRole.OWNER),

    /** Manages everything, the other owners too, and deletes the workspace. */
    OWNER("owner", BoardRole.OWNER),
    ;

    /** Whether the role manages the workspace: its name, projects and boards, and members within [mayGive]. */
    val manages: Boolean
        get() = this >= ADMIN

    /** Whether the role creates boards in the workspace and brings boards into it. */
    val createsBoards: Boolean
        get() = this >= EDITOR

    /**
     * Whether a member with this role may give the [role] to another member, or take it from them: an owner gives and
     * takes any role, an administrator only those of editors and viewers, so that administrators cannot oust each other.
     */
    fun mayGive(role: WorkspaceRole): Boolean = this == OWNER || (this == ADMIN && role <= EDITOR)
}

/** A workspace as one of its members sees it in their list. */
data class WorkspaceSummary(
    val workspace: Workspace,
    /** The role of the member who asks. */
    val role: WorkspaceRole,
    val members: Int,
    /** The boards of the workspace, without those in the trash. */
    val boards: Int,
)

/** A member of a workspace. */
data class WorkspaceMember(
    val id: UUID,
    val name: String,
    val avatarUrl: String?,
    val role: WorkspaceRole,
    val joinedAt: Instant,
)

/** Workspaces and their members. The caller checks that the user may see or change them. */
@Repository
class Workspaces(private val jdbc: JdbcClient) {

    fun create(name: String, at: Instant): Workspace = jdbc.sql(
        "INSERT INTO workspaces (name, created_at) VALUES (:name, :at) RETURNING *",
    )
        .param("name", name)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> rs.toWorkspace() }
        .single()

    fun find(id: UUID): Workspace? = jdbc.sql("SELECT * FROM workspaces WHERE id = :id")
        .param("id", id)
        .query { rs, _ -> rs.toWorkspace() }
        .optional()
        .orElse(null)

    /**
     * Locks the workspace till the end of the transaction and returns it, `null` when there is none: its members, the
     * last owner, its invitations, projects and boards counted against limits do not race.
     */
    fun lock(id: UUID): Workspace? = jdbc.sql("SELECT * FROM workspaces WHERE id = :id FOR NO KEY UPDATE")
        .param("id", id)
        .query { rs, _ -> rs.toWorkspace() }
        .optional()
        .orElse(null)

    fun rename(id: UUID, name: String): Boolean = jdbc.sql("UPDATE workspaces SET name = :name WHERE id = :id")
        .param("id", id)
        .param("name", name)
        .update() > 0

    /** Deletes the workspace with its members, invitations and projects; the caller has taken its boards out of it. */
    fun delete(id: UUID): Boolean = jdbc.sql("DELETE FROM workspaces WHERE id = :id").param("id", id).update() > 0

    /** The workspaces of the user [userId] by name, with their role and how many members and boards each has. */
    fun summaries(userId: UUID): List<WorkspaceSummary> = jdbc.sql(
        """
        $SELECT_SUMMARY
        WHERE m.user_id = :userId
        ORDER BY lower(w.name), w.id
        """,
    )
        .param("userId", userId)
        .query { rs, _ -> rs.toSummary() }
        .list()

    /** The workspace [id] as its member [userId] sees it; `null` when they are not its member or there is none. */
    fun summary(id: UUID, userId: UUID): WorkspaceSummary? = jdbc.sql("$SELECT_SUMMARY WHERE m.user_id = :userId AND w.id = :id")
        .param("userId", userId)
        .param("id", id)
        .query { rs, _ -> rs.toSummary() }
        .optional()
        .orElse(null)

    /** How many workspaces the user [userId] is a member of. */
    fun countOf(userId: UUID): Int = jdbc.sql("SELECT count(*) FROM workspace_members WHERE user_id = :userId")
        .param("userId", userId)
        .query(Int::class.java)
        .single()

    /** The role of the user [userId] in the workspace [workspaceId], `null` when they are not its member. */
    fun roleOf(workspaceId: UUID, userId: UUID): WorkspaceRole? = jdbc.sql(
        "SELECT role FROM workspace_members WHERE workspace_id = :workspaceId AND user_id = :userId",
    )
        .param("workspaceId", workspaceId)
        .param("userId", userId)
        .query { rs, _ -> WorkspaceRole.valueOf(rs.getString("role")) }
        .optional()
        .orElse(null)

    /** The roles of all members of the workspace by their ids. */
    fun roles(workspaceId: UUID): Map<UUID, WorkspaceRole> = jdbc.sql(
        "SELECT user_id, role FROM workspace_members WHERE workspace_id = :workspaceId",
    )
        .param("workspaceId", workspaceId)
        .query { rs, _ -> rs.getObject("user_id", UUID::class.java) to WorkspaceRole.valueOf(rs.getString("role")) }
        .list()
        .toMap()

    /** The members of the workspace: owners first, then administrators, editors and viewers, each in the order they joined. */
    fun members(workspaceId: UUID): List<WorkspaceMember> = jdbc.sql(
        """
        SELECT u.id, u.name, u.avatar_url, m.role, m.created_at
        FROM workspace_members m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = :workspaceId
        ORDER BY array_position(ARRAY['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'], m.role), m.created_at, u.id
        """,
    )
        .param("workspaceId", workspaceId)
        .query { rs, _ ->
            WorkspaceMember(
                id = rs.getObject("id", UUID::class.java),
                name = rs.getString("name"),
                avatarUrl = rs.getString("avatar_url"),
                role = WorkspaceRole.valueOf(rs.getString("role")),
                joinedAt = rs.instant("created_at"),
            )
        }
        .list()

    fun memberCount(workspaceId: UUID): Int = jdbc.sql("SELECT count(*) FROM workspace_members WHERE workspace_id = :workspaceId")
        .param("workspaceId", workspaceId)
        .query(Int::class.java)
        .single()

    /** The owners of the workspace, those who joined first first. */
    fun owners(workspaceId: UUID): List<UUID> = jdbc.sql(
        "SELECT user_id FROM workspace_members WHERE workspace_id = :workspaceId AND role = 'OWNER' ORDER BY created_at, user_id",
    )
        .param("workspaceId", workspaceId)
        .query(UUID::class.java)
        .list()
        .filterNotNull()

    /** Makes the user [userId] a member of the workspace with the [role], or gives a member that role. */
    fun put(workspaceId: UUID, userId: UUID, role: WorkspaceRole, at: Instant) {
        jdbc.sql(
            """
            INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (:workspaceId, :userId, :role, :at)
            ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
            """,
        )
            .param("workspaceId", workspaceId)
            .param("userId", userId)
            .param("role", role.name)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** The user [userId] stops being a member of the workspace; `false` when they were not one. */
    fun remove(workspaceId: UUID, userId: UUID): Boolean =
        jdbc.sql("DELETE FROM workspace_members WHERE workspace_id = :workspaceId AND user_id = :userId")
            .param("workspaceId", workspaceId)
            .param("userId", userId)
            .update() > 0

    private fun ResultSet.toWorkspace() = Workspace(
        id = getObject("id", UUID::class.java),
        name = getString("name"),
        createdAt = instant("created_at"),
    )

    private fun ResultSet.toSummary() = WorkspaceSummary(
        workspace = toWorkspace(),
        role = WorkspaceRole.valueOf(getString("role")),
        members = getInt("members"),
        boards = getInt("boards"),
    )

    private fun ResultSet.instant(column: String): Instant = getObject(column, OffsetDateTime::class.java).toInstant()

    private companion object {
        /** A workspace with the role of the member `m` and the numbers of its members and boards. */
        const val SELECT_SUMMARY = """
            SELECT w.id, w.name, w.created_at, m.role,
                   (SELECT count(*) FROM workspace_members o WHERE o.workspace_id = w.id) AS members,
                   (SELECT count(*) FROM boards b WHERE b.workspace_id = w.id AND b.deleted_at IS NULL) AS boards
            FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
        """
    }
}
