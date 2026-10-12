package io.github.thescarletarrow.codraw.feedback

import com.fasterxml.jackson.annotation.JsonValue
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** What a user tells the administrators about. Stored by its name. */
enum class FeedbackKind(@get:JsonValue val value: String) {
    BUG("bug"),
    IDEA("idea"),
    OTHER("other"),
}

/** Feedback of a user as the queue of administrators shows it. */
data class Feedback(
    val id: UUID,
    /** Who sent it; `null` once their account is deleted. */
    val author: FeedbackAuthor?,
    val kind: FeedbackKind,
    val text: String,
    /** The path of the page it was sent from, without its query. */
    val page: String?,
    val appVersion: String?,
    /** The `User-Agent` of the browser it was sent from. */
    val userAgent: String?,
    val createdAt: Instant,
    val resolvedAt: Instant?,
    /** The name of the administrator who closed it, as it was then. */
    val resolvedBy: String?,
)

/** The author of feedback as the administration names them. */
data class FeedbackAuthor(val id: UUID, val name: String, val guest: Boolean)

/** What a user sent through «Обратная связь»; the address of the sender is not kept. */
@Repository
class FeedbackRepository(private val jdbc: JdbcClient) {

    fun create(
        userId: UUID,
        kind: FeedbackKind,
        text: String,
        page: String?,
        appVersion: String?,
        userAgent: String?,
        at: Instant,
    ) {
        jdbc.sql(
            """
            INSERT INTO feedback (user_id, kind, text, page, app_version, user_agent, created_at)
            VALUES (:userId, :kind, :text, :page, :appVersion, :userAgent, :at)
            """,
        )
            .param("userId", userId)
            .param("kind", kind.name)
            .param("text", text)
            .param("page", page)
            .param("appVersion", appVersion)
            .param("userAgent", userAgent)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** Open feedback, the newest first, or the latest closed, the latest closed first; at most [limit]. */
    fun list(resolved: Boolean, limit: Int): List<Feedback> = jdbc.sql(
        """
        $SELECT
        WHERE (f.resolved_at IS NOT NULL) = :resolved
        ORDER BY CASE WHEN :resolved THEN f.resolved_at END DESC, f.created_at DESC, f.id DESC
        LIMIT :limit
        """,
    )
        .param("resolved", resolved)
        .param("limit", limit)
        .query { rs, _ -> rs.toFeedback() }
        .list()

    fun find(id: UUID): Feedback? = jdbc.sql("$SELECT WHERE f.id = :id")
        .param("id", id)
        .query { rs, _ -> rs.toFeedback() }
        .optional()
        .orElse(null)

    /** Closes the feedback [id] when it is open; `false` when it was closed already or does not exist. */
    fun resolve(id: UUID, admin: User, at: Instant): Boolean = jdbc.sql(
        """
        UPDATE feedback SET resolved_at = :at, resolved_by = :adminId, resolved_by_name = :adminName
        WHERE id = :id AND resolved_at IS NULL
        """,
    )
        .param("id", id)
        .param("adminId", admin.id)
        .param("adminName", admin.name)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .update() > 0

    /** Deletes up to [limit] feedback closed before [before]; returns how many. */
    fun deleteResolvedBefore(before: Instant, limit: Int): Int = jdbc.sql(
        """
        DELETE FROM feedback WHERE id IN (
            SELECT id FROM feedback WHERE resolved_at < :before LIMIT :limit
        )
        """,
    )
        .param("before", before.atOffset(ZoneOffset.UTC))
        .param("limit", limit)
        .update()

    /** The feedback of a guest passes to the user who signs in in their session. */
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        jdbc.sql("UPDATE feedback SET user_id = :toUserId WHERE user_id = :fromUserId")
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
    }

    private fun ResultSet.toFeedback() = Feedback(
        id = getObject("id", UUID::class.java),
        author = getObject("user_id", UUID::class.java)?.let {
            FeedbackAuthor(it, getString("author_name"), getString("author_provider") == ProviderProfile.GUEST)
        },
        kind = FeedbackKind.valueOf(getString("kind")),
        text = getString("text"),
        page = getString("page"),
        appVersion = getString("app_version"),
        userAgent = getString("user_agent"),
        createdAt = checkNotNull(instant("created_at")),
        resolvedAt = instant("resolved_at"),
        resolvedBy = getString("resolved_by_name"),
    )

    private fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()

    private companion object {
        const val SELECT = """
            SELECT f.*, u.name AS author_name, u.provider AS author_provider
            FROM feedback f
            LEFT JOIN users u ON u.id = f.user_id
        """
    }
}
