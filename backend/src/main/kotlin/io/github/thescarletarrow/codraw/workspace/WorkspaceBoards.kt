package io.github.thescarletarrow.codraw.workspace

import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.LinkAccess
import io.github.thescarletarrow.codraw.board.MemberRole
import io.github.thescarletarrow.codraw.board.WorkspaceAccess
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** A board of a workspace in its list, with its responsible owner and the role of the user who asks as a member. */
data class ListedWorkspaceBoard(
    val board: Board,
    val ownerName: String,
    val ownerAvatarUrl: String?,
    /** The role of the user as a member of the board, `null` when they are not one. */
    val memberRole: MemberRole?,
)

/** The boards of workspaces, as workspaces change them: moving boards in and out and passing them between members. */
@Repository
class WorkspaceBoards(private val jdbc: JdbcClient) {

    /** The boards of the workspace that are not in the trash, the latest changed first, as the user [userId] sees them. */
    fun list(workspaceId: UUID, userId: UUID): List<ListedWorkspaceBoard> = jdbc.sql(
        """
        SELECT b.*, u.name AS owner_name, u.avatar_url AS owner_avatar_url, m.role AS member_role
        FROM boards b
        JOIN users u ON u.id = b.owner_id
        LEFT JOIN board_members m ON m.board_id = b.id AND m.user_id = :userId
        WHERE b.workspace_id = :workspaceId AND b.deleted_at IS NULL
        ORDER BY b.updated_at DESC, b.id
        """,
    )
        .param("workspaceId", workspaceId)
        .param("userId", userId)
        .query { rs, _ ->
            ListedWorkspaceBoard(
                board = rs.toBoard(),
                ownerName = rs.getString("owner_name"),
                ownerAvatarUrl = rs.getString("owner_avatar_url"),
                memberRole = rs.getString("member_role")?.let(MemberRole::valueOf),
            )
        }
        .list()

    /**
     * Brings the personal board [boardId] of the user [ownerId] into the workspace, into its project [projectId] or
     * none; `false` when it is no longer their personal board.
     */
    fun moveIn(boardId: UUID, ownerId: UUID, workspaceId: UUID, projectId: UUID?): Boolean = jdbc.sql(
        """
        UPDATE boards SET workspace_id = :workspaceId, project_id = :projectId
        WHERE id = :boardId AND owner_id = :ownerId AND workspace_id IS NULL AND deleted_at IS NULL
        """,
    )
        .param("boardId", boardId)
        .param("ownerId", ownerId)
        .param("workspaceId", workspaceId)
        .param("projectId", projectId)
        .update() > 0

    /**
     * Takes the board [boardId] out of the workspace and makes it a personal board of the user [ownerId]; `false` when it
     * is no longer a board of the workspace.
     */
    fun moveOut(boardId: UUID, workspaceId: UUID, ownerId: UUID): Boolean = jdbc.sql(
        """
        UPDATE boards SET workspace_id = NULL, project_id = NULL, owner_id = :ownerId
        WHERE id = :boardId AND workspace_id = :workspaceId AND deleted_at IS NULL
        """,
    )
        .param("boardId", boardId)
        .param("workspaceId", workspaceId)
        .param("ownerId", ownerId)
        .update() > 0

    /** Puts the board [boardId] of the workspace into its project [projectId], or with `null` into none. */
    fun place(boardId: UUID, workspaceId: UUID, projectId: UUID?): Boolean = jdbc.sql(
        "UPDATE boards SET project_id = :projectId WHERE id = :boardId AND workspace_id = :workspaceId AND deleted_at IS NULL",
    )
        .param("boardId", boardId)
        .param("workspaceId", workspaceId)
        .param("projectId", projectId)
        .update() > 0

    /**
     * Makes the user [toUserId] responsible for the boards of the workspace that the user [fromUserId] was responsible for,
     * those in the trash too, and returns their ids. The owner of a board is not its member, so the memberships of
     * [toUserId] in them are dropped.
     */
    fun pass(workspaceId: UUID, fromUserId: UUID, toUserId: UUID): List<UUID> {
        val ids = jdbc.sql(
            "UPDATE boards SET owner_id = :toUserId WHERE workspace_id = :workspaceId AND owner_id = :fromUserId RETURNING id",
        )
            .param("workspaceId", workspaceId)
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .query(UUID::class.java)
            .list()
            .filterNotNull()
        if (ids.isNotEmpty()) {
            jdbc.sql("DELETE FROM board_members WHERE user_id = :toUserId AND board_id = ANY (:ids::uuid[])")
                .param("toUserId", toUserId)
                .param("ids", ids.toTypedArray())
                .update()
        }
        return ids
    }

    /** Takes the roles of their own that the boards of the workspace gave the user [userId]. */
    fun removeMemberships(workspaceId: UUID, userId: UUID) {
        jdbc.sql(
            """
            DELETE FROM board_members m USING boards b
            WHERE m.board_id = b.id AND b.workspace_id = :workspaceId AND m.user_id = :userId
            """,
        )
            .param("workspaceId", workspaceId)
            .param("userId", userId)
            .update()
    }

    /**
     * The boards of the workspace that the user [userId] was on or organized with their tags or folders: those whose
     * access may need forgetting once their role in the workspace changes.
     */
    fun known(workspaceId: UUID, userId: UUID): List<Board> = jdbc.sql(
        """
        SELECT b.* FROM boards b
        WHERE b.workspace_id = :workspaceId AND (
            EXISTS (SELECT 1 FROM board_reads r WHERE r.board_id = b.id AND r.user_id = :userId)
            OR EXISTS (SELECT 1 FROM board_tags t WHERE t.board_id = b.id AND t.user_id = :userId)
            OR EXISTS (SELECT 1 FROM board_placements p WHERE p.board_id = b.id AND p.user_id = :userId)
        )
        """,
    )
        .param("workspaceId", workspaceId)
        .param("userId", userId)
        .query { rs, _ -> rs.toBoard() }
        .list()

    /**
     * Makes all boards of the workspace, those in the trash too, personal boards of the user [ownerId] in their trash
     * since [at], and returns them: the workspace is about to be deleted.
     */
    fun release(workspaceId: UUID, ownerId: UUID, at: Instant): List<Board> = jdbc.sql(
        """
        UPDATE boards SET workspace_id = NULL, project_id = NULL, owner_id = :ownerId, deleted_at = :at
        WHERE workspace_id = :workspaceId
        RETURNING *
        """,
    )
        .param("workspaceId", workspaceId)
        .param("ownerId", ownerId)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> rs.toBoard() }
        .list()

    private fun ResultSet.toBoard() = Board(
        id = getObject("id", UUID::class.java),
        title = getString("title"),
        ownerId = getObject("owner_id", UUID::class.java),
        createdAt = instant("created_at")!!,
        updatedAt = instant("updated_at")!!,
        linkAccess = LinkAccess.valueOf(getString("link_access")),
        deletedAt = instant("deleted_at"),
        workspaceId = getObject("workspace_id", UUID::class.java),
        projectId = getObject("project_id", UUID::class.java),
        workspaceAccess = WorkspaceAccess.valueOf(getString("workspace_access")),
    )

    private fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()
}
