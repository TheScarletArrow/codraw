package io.github.thescarletarrow.codraw.board

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** The owner or a member of a board, with the role of their own: the list of participants shows them. */
data class Participant(
    val id: UUID,
    val name: String,
    val avatarUrl: String?,
    /** [BoardRole.OWNER] for the owner, the role that the owner gave to a member. */
    val role: BoardRole,
)

/** A user who opened a board through its link and is not its member. */
data class Visitor(
    val id: UUID,
    val name: String,
    val avatarUrl: String?,
    val visitedAt: Instant,
)

/** Members of boards: users whom the owner gave a role of their own. */
@Repository
class BoardMembers(private val jdbc: JdbcClient) {

    /** The role of the user [userId] as a member of the board [boardId], `null` when they are not one. */
    fun roleOf(boardId: UUID, userId: UUID): MemberRole? = jdbc.sql(
        "SELECT role FROM board_members WHERE board_id = :boardId AND user_id = :userId",
    )
        .param("boardId", boardId)
        .param("userId", userId)
        .query { rs, _ -> MemberRole.valueOf(rs.getString("role")) }
        .optional()
        .orElse(null)

    /** The roles of all members of the board by their ids. */
    fun roles(boardId: UUID): Map<UUID, MemberRole> = jdbc.sql(
        "SELECT user_id, role FROM board_members WHERE board_id = :boardId",
    )
        .param("boardId", boardId)
        .query { rs, _ -> rs.getObject("user_id", UUID::class.java) to MemberRole.valueOf(rs.getString("role")) }
        .list()
        .toMap()

    /** The owner [ownerId] of the board [boardId] first, then its members in the order they joined. */
    fun participants(boardId: UUID, ownerId: UUID): List<Participant> = jdbc.sql(
        """
        SELECT u.id, u.name, u.avatar_url, 'OWNER' AS role, NULL::timestamptz AS joined_at
        FROM users u WHERE u.id = :ownerId
        UNION ALL
        SELECT u.id, u.name, u.avatar_url, m.role, m.created_at
        FROM board_members m JOIN users u ON u.id = m.user_id
        WHERE m.board_id = :boardId
        ORDER BY joined_at NULLS FIRST, id
        """,
    )
        .param("boardId", boardId)
        .param("ownerId", ownerId)
        .query { rs, _ ->
            Participant(
                id = rs.getObject("id", UUID::class.java),
                name = rs.getString("name"),
                avatarUrl = rs.getString("avatar_url"),
                role = BoardRole.valueOf(rs.getString("role")),
            )
        }
        .list()

    /** Users other than the owner [ownerId] who opened the board through its link and are not members, recent first. */
    fun visitors(boardId: UUID, ownerId: UUID, limit: Int): List<Visitor> = jdbc.sql(
        """
        SELECT u.id, u.name, u.avatar_url, v.visited_at
        FROM board_visits v JOIN users u ON u.id = v.user_id
        WHERE v.board_id = :boardId AND v.user_id <> :ownerId
          AND NOT EXISTS (SELECT 1 FROM board_members m WHERE m.board_id = v.board_id AND m.user_id = v.user_id)
        ORDER BY v.visited_at DESC, u.id
        LIMIT :limit
        """,
    )
        .param("boardId", boardId)
        .param("ownerId", ownerId)
        .param("limit", limit)
        .query { rs, _ ->
            Visitor(
                id = rs.getObject("id", UUID::class.java),
                name = rs.getString("name"),
                avatarUrl = rs.getString("avatar_url"),
                visitedAt = rs.instant("visited_at"),
            )
        }
        .list()

    /** Whether the user [userId] opened the board [boardId] through its link. */
    fun visited(boardId: UUID, userId: UUID): Boolean = jdbc.sql(
        "SELECT EXISTS (SELECT 1 FROM board_visits WHERE board_id = :boardId AND user_id = :userId)",
    )
        .param("boardId", boardId)
        .param("userId", userId)
        .query(Boolean::class.java)
        .single()

    /**
     * Locks the board till the end of the transaction, so that members, invitations and requests for access counted per
     * board don't race.
     */
    fun lockBoard(boardId: UUID) {
        // Unlike FOR UPDATE, this lock lets the board be referenced meanwhile, e.g. by a new version.
        jdbc.sql("SELECT id FROM boards WHERE id = :boardId FOR NO KEY UPDATE").param("boardId", boardId).query().listOfRows()
    }

    fun count(boardId: UUID): Int = jdbc.sql("SELECT count(*) FROM board_members WHERE board_id = :boardId")
        .param("boardId", boardId)
        .query(Int::class.java)
        .single()

    /** Makes the user [userId] a member of the board [boardId] with the [role], or gives a member that role. */
    fun put(boardId: UUID, userId: UUID, role: MemberRole, at: Instant) {
        jdbc.sql(
            """
            INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (:boardId, :userId, :role, :at)
            ON CONFLICT (board_id, user_id) DO UPDATE SET role = EXCLUDED.role
            """,
        )
            .param("boardId", boardId)
            .param("userId", userId)
            .param("role", role.name)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** Takes the role of a member from the user [userId]; `false` when they were not a member. */
    fun remove(boardId: UUID, userId: UUID): Boolean =
        jdbc.sql("DELETE FROM board_members WHERE board_id = :boardId AND user_id = :userId")
            .param("boardId", boardId)
            .param("userId", userId)
            .update() > 0

    /**
     * Passes the memberships of the user [fromUserId] to the user [toUserId], keeping the higher role of a board both
     * are members of. The owner is no member, so memberships in boards that [toUserId] owns, e.g. the boards that just
     * passed to them from [fromUserId], are dropped.
     */
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        jdbc.sql(
            """
            INSERT INTO board_members (board_id, user_id, role, created_at)
            SELECT board_id, :toUserId, role, created_at FROM board_members WHERE user_id = :fromUserId
            ON CONFLICT (board_id, user_id) DO UPDATE SET
                role = CASE WHEN 'EDITOR' IN (board_members.role, EXCLUDED.role) THEN 'EDITOR' ELSE 'VIEWER' END,
                created_at = LEAST(board_members.created_at, EXCLUDED.created_at)
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql("DELETE FROM board_members WHERE user_id = :fromUserId").param("fromUserId", fromUserId).update()
        jdbc.sql(
            "DELETE FROM board_members m USING boards b WHERE m.user_id = :toUserId AND b.id = m.board_id AND b.owner_id = :toUserId",
        )
            .param("toUserId", toUserId)
            .update()
    }

    private fun ResultSet.instant(column: String): Instant = getObject(column, OffsetDateTime::class.java).toInstant()
}
