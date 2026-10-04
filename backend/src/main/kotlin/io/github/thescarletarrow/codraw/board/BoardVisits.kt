package io.github.thescarletarrow.codraw.board

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** A board of another user that the user opened through its link, with its owner. */
data class VisitedBoard(
    val board: Board,
    val ownerName: String,
    val ownerAvatarUrl: String?,
    val visitedAt: Instant,
)

/** Boards of other users that users opened through their links. */
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

    /** Boards of other users that the user [userId] opened, most recently opened first. */
    fun visitedBy(userId: UUID, limit: Int): List<VisitedBoard> = jdbc.sql(
        """
        SELECT b.id, b.title, b.owner_id, b.created_at, b.updated_at,
               u.name AS owner_name, u.avatar_url AS owner_avatar_url, v.visited_at
        FROM board_visits v
        JOIN boards b ON b.id = v.board_id
        JOIN users u ON u.id = b.owner_id
        WHERE v.user_id = :userId AND b.owner_id <> :userId
        ORDER BY v.visited_at DESC
        LIMIT :limit
        """,
    )
        .param("userId", userId)
        .param("limit", limit)
        .query { rs, _ -> rs.toVisitedBoard() }
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

    private fun ResultSet.toVisitedBoard() = VisitedBoard(
        board = Board(
            id = getObject("id", UUID::class.java),
            title = getString("title"),
            ownerId = getObject("owner_id", UUID::class.java),
            createdAt = instant("created_at"),
            updatedAt = instant("updated_at"),
        ),
        ownerName = getString("owner_name"),
        ownerAvatarUrl = getString("owner_avatar_url"),
        visitedAt = instant("visited_at"),
    )

    private fun ResultSet.instant(column: String): Instant = getObject(column, OffsetDateTime::class.java).toInstant()
}
