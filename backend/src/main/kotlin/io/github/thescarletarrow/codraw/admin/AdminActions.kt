package io.github.thescarletarrow.codraw.admin

import com.fasterxml.jackson.annotation.JsonValue
import io.github.thescarletarrow.codraw.user.User
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** What an administrator did. Stored by its name. */
enum class AdminActionKind(@get:JsonValue val value: String) {
    BLOCK_USER("block-user"),
    UNBLOCK_USER("unblock-user"),
    BLOCK_SHARING("block-sharing"),
    UNBLOCK_SHARING("unblock-sharing"),
    TRASH_BOARD("trash-board"),
    RESOLVE_REPORTS("resolve-reports"),
}

/** What an action of an administrator was done to. Stored by its name. */
enum class AdminTargetKind(@get:JsonValue val value: String) {
    USER("user"),
    BOARD("board"),
}

/** An entry of the journal: who did what, when and to what, with the names as they were then. */
data class AdminAction(
    val id: UUID,
    val adminId: UUID,
    val adminName: String,
    val action: AdminActionKind,
    val targetKind: AdminTargetKind,
    val targetId: UUID,
    /** The title of the board or the name of the user. */
    val targetLabel: String,
    /** More about the action, e.g. how many reports it closed. */
    val details: String?,
    val createdAt: Instant,
)

/**
 * The journal of the actions of administrators. It has no foreign keys and keeps copies of names, so that it outlives
 * both the administrator and the target.
 */
@Repository
class AdminActions(private val jdbc: JdbcClient) {

    fun record(
        admin: User,
        action: AdminActionKind,
        targetKind: AdminTargetKind,
        targetId: UUID,
        targetLabel: String,
        at: Instant,
        details: String? = null,
    ) {
        jdbc.sql(
            """
            INSERT INTO admin_actions (admin_id, admin_name, action, target_kind, target_id, target_label, details, created_at)
            VALUES (:adminId, :adminName, :action, :targetKind, :targetId, :targetLabel, :details, :at)
            """,
        )
            .param("adminId", admin.id)
            .param("adminName", admin.name)
            .param("action", action.name)
            .param("targetKind", targetKind.name)
            .param("targetId", targetId)
            .param("targetLabel", targetLabel)
            .param("details", details)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** The latest [limit] entries created before [before], or the latest of all, newest first. */
    fun page(before: Instant?, limit: Int): List<AdminAction> = jdbc.sql(
        """
        SELECT * FROM admin_actions WHERE (CAST(:before AS timestamptz) IS NULL OR created_at < :before)
        ORDER BY created_at DESC, id DESC LIMIT :limit
        """,
    )
        .param("before", before?.atOffset(ZoneOffset.UTC))
        .param("limit", limit)
        .query { rs, _ -> rs.toAction() }
        .list()

    /** Deletes up to [limit] entries created before [before]; returns how many. */
    fun deleteCreatedBefore(before: Instant, limit: Int): Int = jdbc.sql(
        "DELETE FROM admin_actions WHERE id IN (SELECT id FROM admin_actions WHERE created_at < :before LIMIT :limit)",
    )
        .param("before", before.atOffset(ZoneOffset.UTC))
        .param("limit", limit)
        .update()

    private fun ResultSet.toAction() = AdminAction(
        id = getObject("id", UUID::class.java),
        adminId = getObject("admin_id", UUID::class.java),
        adminName = getString("admin_name"),
        action = AdminActionKind.valueOf(getString("action")),
        targetKind = AdminTargetKind.valueOf(getString("target_kind")),
        targetId = getObject("target_id", UUID::class.java),
        targetLabel = getString("target_label"),
        details = getString("details"),
        createdAt = getObject("created_at", OffsetDateTime::class.java).toInstant(),
    )
}
