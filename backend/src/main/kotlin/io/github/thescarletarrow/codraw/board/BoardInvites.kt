package io.github.thescarletarrow.codraw.board

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** An invitation link of a board: whoever opens it becomes a member with its [role]. */
data class Invite(
    val id: UUID,
    val boardId: UUID,
    /** The secret part of the address of the invitation. */
    val token: String,
    val role: MemberRole,
    val createdAt: Instant,
)

/** Invitation links of boards; a revoked one is deleted. */
@Repository
class BoardInvites(private val jdbc: JdbcClient) {

    /** The invitations of the board, oldest first. */
    fun list(boardId: UUID): List<Invite> = jdbc.sql(
        "SELECT * FROM board_invites WHERE board_id = :boardId ORDER BY created_at, id",
    )
        .param("boardId", boardId)
        .query { rs, _ -> rs.toInvite() }
        .list()

    fun find(token: String): Invite? = jdbc.sql("SELECT * FROM board_invites WHERE token = :token")
        .param("token", token)
        .query { rs, _ -> rs.toInvite() }
        .optional()
        .orElse(null)

    fun count(boardId: UUID): Int = jdbc.sql("SELECT count(*) FROM board_invites WHERE board_id = :boardId")
        .param("boardId", boardId)
        .query(Int::class.java)
        .single()

    fun add(boardId: UUID, token: String, role: MemberRole, at: Instant): Invite = jdbc.sql(
        """
        INSERT INTO board_invites (board_id, token, role, created_at) VALUES (:boardId, :token, :role, :at)
        RETURNING *
        """,
    )
        .param("boardId", boardId)
        .param("token", token)
        .param("role", role.name)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> rs.toInvite() }
        .single()

    /** Revokes the invitation [inviteId] of the board [boardId]; `false` when the board has no such invitation. */
    fun delete(boardId: UUID, inviteId: UUID): Boolean =
        jdbc.sql("DELETE FROM board_invites WHERE id = :inviteId AND board_id = :boardId")
            .param("inviteId", inviteId)
            .param("boardId", boardId)
            .update() > 0

    private fun ResultSet.toInvite() = Invite(
        id = getObject("id", UUID::class.java),
        boardId = getObject("board_id", UUID::class.java),
        token = getString("token"),
        role = MemberRole.valueOf(getString("role")),
        createdAt = getObject("created_at", OffsetDateTime::class.java).toInstant(),
    )
}
