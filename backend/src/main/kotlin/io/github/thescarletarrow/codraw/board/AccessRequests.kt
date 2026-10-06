package io.github.thescarletarrow.codraw.board

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** A request of a user for a role on a board, which waits for the owner to answer it. */
data class AccessRequest(
    /** A new request of the same user gets a new id: the owner answers the request they saw. */
    val id: UUID,
    val userId: UUID,
    val name: String,
    val avatarUrl: String?,
    /** The role the user asks for. */
    val role: MemberRole,
    /** What the user tells the owner, `null` when they tell nothing. */
    val message: String?,
    val createdAt: Instant,
)

/** Requests of users for access to boards; an answered or cancelled request is deleted. */
@Repository
class AccessRequests(private val jdbc: JdbcClient) {

    /** The request of the user [userId] for access to the board [boardId], `null` when they have none. */
    fun find(boardId: UUID, userId: UUID): AccessRequest? = jdbc.sql(
        "$SELECT WHERE r.board_id = :boardId AND r.user_id = :userId",
    )
        .param("boardId", boardId)
        .param("userId", userId)
        .query { rs, _ -> rs.toAccessRequest() }
        .optional()
        .orElse(null)

    /** The request [requestId] for access to the board [boardId], `null` when the board has no such request. */
    fun findById(boardId: UUID, requestId: UUID): AccessRequest? = jdbc.sql(
        "$SELECT WHERE r.board_id = :boardId AND r.id = :requestId",
    )
        .param("boardId", boardId)
        .param("requestId", requestId)
        .query { rs, _ -> rs.toAccessRequest() }
        .optional()
        .orElse(null)

    /** The requests for access to the board, oldest first. */
    fun list(boardId: UUID): List<AccessRequest> = jdbc.sql(
        "$SELECT WHERE r.board_id = :boardId ORDER BY r.created_at, r.id",
    )
        .param("boardId", boardId)
        .query { rs, _ -> rs.toAccessRequest() }
        .list()

    /** The roles that users ask for on the board, by their ids. */
    fun wanted(boardId: UUID): Map<UUID, MemberRole> = jdbc.sql(
        "SELECT user_id, role FROM board_access_requests WHERE board_id = :boardId",
    )
        .param("boardId", boardId)
        .query { rs, _ -> rs.getObject("user_id", UUID::class.java) to MemberRole.valueOf(rs.getString("role")) }
        .list()
        .toMap()

    /** The boards that the user [userId] asks for access to. */
    fun boardsOf(userId: UUID): List<UUID> = jdbc.sql(
        "SELECT board_id FROM board_access_requests WHERE user_id = :userId",
    )
        .param("userId", userId)
        .query(UUID::class.java)
        .list()
        .filterNotNull()

    fun count(boardId: UUID): Int = jdbc.sql("SELECT count(*) FROM board_access_requests WHERE board_id = :boardId")
        .param("boardId", boardId)
        .query(Int::class.java)
        .single()

    /** Stores the request of the user [userId] for the [role] on the board [boardId], in place of their earlier one. */
    fun put(boardId: UUID, userId: UUID, role: MemberRole, message: String?, at: Instant): AccessRequest {
        jdbc.sql(
            """
            INSERT INTO board_access_requests (board_id, user_id, role, message, created_at)
            VALUES (:boardId, :userId, :role, :message, :at)
            ON CONFLICT (board_id, user_id) DO UPDATE SET
                id = EXCLUDED.id, role = EXCLUDED.role, message = EXCLUDED.message, created_at = EXCLUDED.created_at
            """,
        )
            .param("boardId", boardId)
            .param("userId", userId)
            .param("role", role.name)
            .param("message", message)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
        return checkNotNull(find(boardId, userId)) { "Request of $userId for access to board $boardId was just stored" }
    }

    /** Deletes the request of the user [userId] for access to the board [boardId]; `false` when they had none. */
    fun delete(boardId: UUID, userId: UUID): Boolean =
        jdbc.sql("DELETE FROM board_access_requests WHERE board_id = :boardId AND user_id = :userId")
            .param("boardId", boardId)
            .param("userId", userId)
            .update() > 0

    /** Deletes the request [requestId] for access to the board [boardId]; `false` when there is no such request. */
    fun deleteById(boardId: UUID, requestId: UUID): Boolean =
        jdbc.sql("DELETE FROM board_access_requests WHERE board_id = :boardId AND id = :requestId")
            .param("boardId", boardId)
            .param("requestId", requestId)
            .update() > 0

    /** Deletes the requests of the users [userIds] for access to the board [boardId]. */
    fun deleteAll(boardId: UUID, userIds: Collection<UUID>) {
        if (userIds.isEmpty()) return
        jdbc.sql("DELETE FROM board_access_requests WHERE board_id = :boardId AND user_id IN (:userIds)")
            .param("boardId", boardId)
            .param("userIds", userIds)
            .update()
    }

    /**
     * Passes the requests of the user [fromUserId] to the user [toUserId]. Of two requests for the same board the newer
     * one stays: it is what the person asks for now.
     */
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        jdbc.sql(
            """
            DELETE FROM board_access_requests existing USING board_access_requests incoming
            WHERE existing.user_id = :toUserId AND incoming.user_id = :fromUserId
              AND incoming.board_id = existing.board_id AND incoming.created_at > existing.created_at
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql(
            """
            DELETE FROM board_access_requests incoming USING board_access_requests existing
            WHERE incoming.user_id = :fromUserId AND existing.user_id = :toUserId
              AND existing.board_id = incoming.board_id
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql("UPDATE board_access_requests SET user_id = :toUserId WHERE user_id = :fromUserId")
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
    }

    private fun ResultSet.toAccessRequest() = AccessRequest(
        id = getObject("id", UUID::class.java),
        userId = getObject("user_id", UUID::class.java),
        name = getString("name"),
        avatarUrl = getString("avatar_url"),
        role = MemberRole.valueOf(getString("role")),
        message = getString("message"),
        createdAt = getObject("created_at", OffsetDateTime::class.java).toInstant(),
    )

    private companion object {
        const val SELECT = """
            SELECT r.id, r.user_id, u.name, u.avatar_url, r.role, r.message, r.created_at
            FROM board_access_requests r JOIN users u ON u.id = r.user_id
        """
    }
}
