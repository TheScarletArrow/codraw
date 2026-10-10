package io.github.thescarletarrow.codraw.admin

import com.fasterxml.jackson.annotation.JsonValue
import io.github.thescarletarrow.codraw.board.LinkAccess
import io.github.thescarletarrow.codraw.user.User
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** Why a reader reports a board. Stored by its name. */
enum class ReportReason(@get:JsonValue val value: String) {
    SPAM("spam"),
    ILLEGAL("illegal"),
    ABUSE("abuse"),
    OTHER("other"),
}

/** A report of a board with what the queue of administrators shows of the board. */
data class BoardReport(
    val id: UUID,
    val board: ReportedBoard,
    val reason: ReportReason,
    val message: String,
    /** The signed-in user who sent the report; `null` for a reader without a sign-in or a deleted user. */
    val reporter: UserRef?,
    val createdAt: Instant,
    val resolvedAt: Instant?,
    /** The name of the administrator who closed the report, as it was then. */
    val resolvedBy: String?,
)

data class ReportedBoard(
    val id: UUID,
    val title: String,
    val owner: UserRef,
    val linkAccess: LinkAccess,
    val sharingBlocked: Boolean,
    /** When the board went to the trash; `null` for a board in use. */
    val deletedAt: Instant?,
)

/** A user as the administration names them. */
data class UserRef(val id: UUID, val name: String)

/** Reports of readers of boards; the address of the sender is not kept. */
@Repository
class BoardReports(private val jdbc: JdbcClient) {

    fun create(boardId: UUID, reason: ReportReason, message: String, reporterId: UUID?, at: Instant) {
        jdbc.sql(
            """
            INSERT INTO board_reports (board_id, reason, message, reporter_id, created_at)
            VALUES (:boardId, :reason, :message, :reporterId, :at)
            """,
        )
            .param("boardId", boardId)
            .param("reason", reason.name)
            .param("message", message)
            .param("reporterId", reporterId)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    fun countOpen(boardId: UUID): Int = jdbc.sql("SELECT count(*) FROM board_reports WHERE board_id = :boardId AND resolved_at IS NULL")
        .param("boardId", boardId)
        .query(Int::class.java)
        .single()

    /** Open reports, the oldest first, or the latest closed ones, the latest closed first; at most [limit]. */
    fun list(resolved: Boolean, limit: Int): List<BoardReport> = jdbc.sql(
        """
        $SELECT
        WHERE (r.resolved_at IS NOT NULL) = :resolved
        ORDER BY CASE WHEN :resolved THEN r.resolved_at END DESC, r.created_at, r.id
        LIMIT :limit
        """,
    )
        .param("resolved", resolved)
        .param("limit", limit)
        .query { rs, _ -> rs.toReport() }
        .list()

    /** The open reports of the board [boardId], the oldest first. */
    fun openOf(boardId: UUID): List<BoardReport> = jdbc.sql("$SELECT WHERE r.board_id = :boardId AND r.resolved_at IS NULL ORDER BY r.created_at, r.id")
        .param("boardId", boardId)
        .query { rs, _ -> rs.toReport() }
        .list()

    fun find(id: UUID): BoardReport? = jdbc.sql("$SELECT WHERE r.id = :id")
        .param("id", id)
        .query { rs, _ -> rs.toReport() }
        .optional()
        .orElse(null)

    /** Closes the open reports [ids] of the board [boardId], or all of its open reports; returns how many. */
    fun resolve(boardId: UUID, ids: Collection<UUID>?, admin: User, at: Instant): Int = jdbc.sql(
        """
        UPDATE board_reports SET resolved_at = :at, resolved_by = :adminId, resolved_by_name = :adminName
        WHERE board_id = :boardId AND resolved_at IS NULL ${if (ids == null) "" else "AND id IN (:ids)"}
        """,
    )
        .param("boardId", boardId)
        .param("adminId", admin.id)
        .param("adminName", admin.name)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .apply { if (ids != null) param("ids", ids) }
        .update()

    /** Deletes up to [limit] reports closed before [before]; returns how many. */
    fun deleteResolvedBefore(before: Instant, limit: Int): Int = jdbc.sql(
        """
        DELETE FROM board_reports WHERE id IN (
            SELECT id FROM board_reports WHERE resolved_at < :before LIMIT :limit
        )
        """,
    )
        .param("before", before.atOffset(ZoneOffset.UTC))
        .param("limit", limit)
        .update()

    private fun ResultSet.toReport() = BoardReport(
        id = getObject("id", UUID::class.java),
        board = ReportedBoard(
            id = getObject("board_id", UUID::class.java),
            title = getString("title"),
            owner = UserRef(getObject("owner_id", UUID::class.java), getString("owner_name")),
            linkAccess = LinkAccess.valueOf(getString("link_access")),
            sharingBlocked = getObject("sharing_blocked_at") != null,
            deletedAt = instant("deleted_at"),
        ),
        reason = ReportReason.valueOf(getString("reason")),
        message = getString("message"),
        reporter = getObject("reporter_id", UUID::class.java)?.let { UserRef(it, getString("reporter_name")) },
        createdAt = checkNotNull(instant("created_at")),
        resolvedAt = instant("resolved_at"),
        resolvedBy = getString("resolved_by_name"),
    )

    private fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()

    private companion object {
        const val SELECT = """
            SELECT r.*, b.title, b.owner_id, o.name AS owner_name, b.link_access, b.sharing_blocked_at, b.deleted_at,
                   u.name AS reporter_name
            FROM board_reports r
            JOIN boards b ON b.id = r.board_id
            JOIN users o ON o.id = b.owner_id
            LEFT JOIN users u ON u.id = r.reporter_id
        """
    }
}
