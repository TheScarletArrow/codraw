package io.github.thescarletarrow.codraw.board

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/**
 * When users were on boards, the owners on their own boards too, and when their previous visits ended. Unlike
 * [BoardVisits], these say nothing about which boards are shared with a user.
 */
@Repository
class BoardReads(private val jdbc: JdbcClient) {

    /**
     * Records that a page of the user [userId] opened the board [boardId] at [at] and returns when the previous visit of
     * the user ended, which the visit compares the board with; `null` during their first visit. A visit goes on while a
     * page of the user is on the board, i.e. it reported after [presentSince] and did not leave, e.g. in another tab:
     * then the previous visit stays what it was.
     */
    fun start(userId: UUID, boardId: UUID, at: Instant, presentSince: Instant): Instant? = jdbc.sql(
        """
        INSERT INTO board_reads (user_id, board_id, seen_at, present) VALUES (:userId, :boardId, :at, true)
        ON CONFLICT (user_id, board_id) DO UPDATE SET
            previous_seen_at = CASE
                WHEN board_reads.present AND board_reads.seen_at > :presentSince THEN board_reads.previous_seen_at
                ELSE board_reads.seen_at
            END,
            seen_at = GREATEST(board_reads.seen_at, EXCLUDED.seen_at),
            present = true
        RETURNING previous_seen_at
        """,
    )
        .param("userId", userId)
        .param("boardId", boardId)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .param("presentSince", presentSince.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> rs.instant("previous_seen_at") }
        // A single row whose value may be null, which single() of the query does not accept.
        .list()
        .single()

    /** Records that a page of the user [userId] is on the board [boardId] at [at], or that it left the board then. */
    fun see(userId: UUID, boardId: UUID, at: Instant, present: Boolean) {
        jdbc.sql(
            """
            INSERT INTO board_reads (user_id, board_id, seen_at, present) VALUES (:userId, :boardId, :at, :present)
            ON CONFLICT (user_id, board_id) DO UPDATE SET
                seen_at = GREATEST(board_reads.seen_at, EXCLUDED.seen_at),
                present = EXCLUDED.present
            """,
        )
            .param("userId", userId)
            .param("boardId", boardId)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .param("present", present)
            .update()
    }

    /** When the previous visit of the user [userId] to the board [boardId] ended; `null` during or before their first one. */
    fun previousSeenAt(userId: UUID, boardId: UUID): Instant? = jdbc.sql(
        "SELECT previous_seen_at FROM board_reads WHERE user_id = :userId AND board_id = :boardId",
    )
        .param("userId", userId)
        .param("boardId", boardId)
        .query { rs, _ -> rs.instant("previous_seen_at") }
        .list()
        .singleOrNull()

    /** When the user [userId] was last on each of the boards [boardIds] they were on. */
    fun seenAt(userId: UUID, boardIds: Collection<UUID>): Map<UUID, Instant> {
        if (boardIds.isEmpty()) return emptyMap()
        return jdbc.sql("SELECT board_id, seen_at FROM board_reads WHERE user_id = :userId AND board_id = ANY (:boardIds::uuid[])")
            .param("userId", userId)
            .param("boardIds", boardIds.toTypedArray())
            .query { rs, _ -> rs.getObject("board_id", UUID::class.java) to rs.instant("seen_at")!! }
            .list()
            .toMap()
    }

    /** The users who were on the board [boardId]. */
    fun readers(boardId: UUID): List<UUID> = jdbc.sql("SELECT user_id FROM board_reads WHERE board_id = :boardId")
        .param("boardId", boardId)
        .query(UUID::class.java)
        .list()
        .filterNotNull()

    /** Forgets when the users [userIds] were on the board [boardId]. */
    fun forget(boardId: UUID, userIds: Collection<UUID>) {
        if (userIds.isEmpty()) return
        jdbc.sql("DELETE FROM board_reads WHERE board_id = :boardId AND user_id = ANY (:userIds::uuid[])")
            .param("boardId", boardId)
            .param("userIds", userIds.toTypedArray())
            .update()
    }

    /**
     * Passes the visits of the user [fromUserId] to the user [toUserId]. Of two users who were on the same board, the
     * one who was there later stays, with when their previous visit ended.
     */
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        jdbc.sql(
            """
            INSERT INTO board_reads (user_id, board_id, seen_at, previous_seen_at, present)
            SELECT :toUserId, board_id, seen_at, previous_seen_at, present FROM board_reads WHERE user_id = :fromUserId
            ON CONFLICT (user_id, board_id) DO UPDATE SET
                seen_at = EXCLUDED.seen_at,
                previous_seen_at = EXCLUDED.previous_seen_at,
                present = EXCLUDED.present
            WHERE EXCLUDED.seen_at > board_reads.seen_at
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql("DELETE FROM board_reads WHERE user_id = :fromUserId").param("fromUserId", fromUserId).update()
    }

    private fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()
}
