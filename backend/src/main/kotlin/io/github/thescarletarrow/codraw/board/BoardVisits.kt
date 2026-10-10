package io.github.thescarletarrow.codraw.board

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** A board of another user that the user opened through its link or is a member of, with its owner. */
data class SharedBoard(
    val board: Board,
    val ownerName: String,
    val ownerAvatarUrl: String?,
    /** The role that the owner gave the user, `null` when they are not a member. */
    val memberRole: MemberRole?,
    /** When the user last opened the board, `null` while they never did. */
    val visitedAt: Instant?,
)

/** Boards of other users that users opened through their links, and with memberships the boards shared with them. */
@Repository
class BoardVisits(private val jdbc: JdbcClient) {

    /** Records that the user [userId] opened the board [boardId] at [at]; a later visit replaces the earlier one. */
    fun record(userId: UUID, boardId: UUID, at: Instant) {
        jdbc.sql(
            """
            INSERT INTO board_visits (user_id, board_id, visited_at) VALUES (:userId, :boardId, :at)
            ON CONFLICT (user_id, board_id) DO UPDATE SET visited_at = EXCLUDED.visited_at
            """,
        )
            .param("userId", userId)
            .param("boardId", boardId)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /**
     * Boards of other users that the user [userId] opened or is a member of, the most recently opened or joined first.
     * A board whose owner closed its link stays for a member only; for anybody else it comes back once the owner opens
     * it again. Boards of workspaces that the user is a member of are left out.
     */
    fun sharedWith(userId: UUID, limit: Int): List<SharedBoard> = jdbc.sql(
        """
        WITH shared AS (
            SELECT board_id FROM board_visits WHERE user_id = :userId
            UNION
            SELECT board_id FROM board_members WHERE user_id = :userId
        )
        SELECT b.id, b.title, b.owner_id, b.created_at, b.updated_at, b.link_access,
               b.workspace_id, b.project_id, b.workspace_access,
               u.name AS owner_name, u.avatar_url AS owner_avatar_url, v.visited_at, m.role AS member_role
        FROM shared s
        JOIN boards b ON b.id = s.board_id
        JOIN users u ON u.id = b.owner_id
        LEFT JOIN board_visits v ON v.board_id = b.id AND v.user_id = :userId
        LEFT JOIN board_members m ON m.board_id = b.id AND m.user_id = :userId
        WHERE b.deleted_at IS NULL AND b.owner_id <> :userId AND (m.user_id IS NOT NULL OR b.link_access <> 'NONE')
          -- The boards of the workspaces of the user are on the pages of their workspaces.
          AND NOT EXISTS (SELECT 1 FROM workspace_members w WHERE w.workspace_id = b.workspace_id AND w.user_id = :userId)
        ORDER BY GREATEST(v.visited_at, m.created_at) DESC, b.id
        LIMIT :limit
        """,
    )
        .param("userId", userId)
        .param("limit", limit)
        .query { rs, _ -> rs.toSharedBoard() }
        .list()

    /** Passes the visits of the user [fromUserId] to the user [toUserId], keeping the later time of a board both opened. */
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        jdbc.sql(
            """
            INSERT INTO board_visits (user_id, board_id, visited_at)
            SELECT :toUserId, board_id, visited_at FROM board_visits WHERE user_id = :fromUserId
            ON CONFLICT (user_id, board_id) DO UPDATE SET visited_at = GREATEST(board_visits.visited_at, EXCLUDED.visited_at)
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql("DELETE FROM board_visits WHERE user_id = :fromUserId").param("fromUserId", fromUserId).update()
    }

    private fun ResultSet.toSharedBoard() = SharedBoard(
        board = Board(
            id = getObject("id", UUID::class.java),
            title = getString("title"),
            ownerId = getObject("owner_id", UUID::class.java),
            createdAt = instant("created_at")!!,
            updatedAt = instant("updated_at")!!,
            linkAccess = LinkAccess.valueOf(getString("link_access")),
            workspaceId = getObject("workspace_id", UUID::class.java),
            projectId = getObject("project_id", UUID::class.java),
            workspaceAccess = WorkspaceAccess.valueOf(getString("workspace_access")),
        ),
        ownerName = getString("owner_name"),
        ownerAvatarUrl = getString("owner_avatar_url"),
        memberRole = getString("member_role")?.let(MemberRole::valueOf),
        visitedAt = instant("visited_at"),
    )

    private fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()
}
