package io.github.thescarletarrow.codraw.board

import com.fasterxml.jackson.annotation.JsonValue
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** Why a version of a board was saved. Stored by its name. */
enum class VersionReason(@get:JsonValue val value: String) {
    /** The backend kept the state from before a change. */
    AUTO("auto"),

    /** The owner saved the state. */
    MANUAL("manual"),

    /** The owner's page kept the state from before a restore. */
    RESTORE("restore"),
}

/** A saved earlier state of the document of a board. */
data class BoardVersion(
    val id: UUID,
    val createdAt: Instant,
    val reason: VersionReason,
)

/** Versions of board documents: their states are opaque to the backend, like the documents themselves. */
@Repository
class BoardVersions(private val jdbc: JdbcClient) {

    /** Versions of the board [boardId], most recent first. */
    fun list(boardId: UUID): List<BoardVersion> = jdbc.sql(
        "SELECT id, created_at, reason FROM board_versions WHERE board_id = :boardId ORDER BY created_at DESC, id DESC",
    )
        .param("boardId", boardId)
        .query { rs, _ -> rs.toVersion() }
        .list()

    /** The state of the version [versionId] of the board [boardId], or `null` when the board has no such version. */
    fun state(boardId: UUID, versionId: UUID): ByteArray? = jdbc.sql(
        "SELECT state FROM board_versions WHERE board_id = :boardId AND id = :versionId",
    )
        .param("boardId", boardId)
        .param("versionId", versionId)
        .query(ByteArray::class.java)
        .optional()
        .orElse(null)

    fun add(boardId: UUID, state: ByteArray, reason: VersionReason, at: Instant): BoardVersion = jdbc.sql(
        """
        INSERT INTO board_versions (board_id, state, reason, created_at) VALUES (:boardId, :state, :reason, :at)
        RETURNING id, created_at, reason
        """,
    )
        .param("boardId", boardId)
        .param("state", state)
        .param("reason", reason.name)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> rs.toVersion() }
        .single()

    /**
     * Keeps the stored document of the board [boardId] as an [VersionReason.AUTO] version at [at], unless the board has
     * a version made after [since] or no stored document. Returns whether it made a version. The document is copied in
     * the database, without passing through the backend.
     */
    fun keepStoredDocument(boardId: UUID, since: Instant, at: Instant): Boolean = jdbc.sql(
        """
        INSERT INTO board_versions (board_id, state, reason, created_at)
        SELECT board_id, state, 'AUTO', :at FROM board_documents
        WHERE board_id = :boardId
          AND NOT EXISTS (SELECT 1 FROM board_versions WHERE board_id = :boardId AND created_at > :since)
        """,
    )
        .param("boardId", boardId)
        .param("since", since.atOffset(ZoneOffset.UTC))
        .param("at", at.atOffset(ZoneOffset.UTC))
        .update() > 0

    /** Deletes the versions of the board [boardId] beyond the [keep] most recent ones. */
    fun prune(boardId: UUID, keep: Int) {
        jdbc.sql(
            """
            DELETE FROM board_versions WHERE id IN (
                SELECT id FROM board_versions WHERE board_id = :boardId ORDER BY created_at DESC, id DESC OFFSET :keep
            )
            """,
        )
            .param("boardId", boardId)
            .param("keep", keep)
            .update()
    }

    private fun ResultSet.toVersion() = BoardVersion(
        id = getObject("id", UUID::class.java),
        createdAt = getObject("created_at", OffsetDateTime::class.java).toInstant(),
        reason = VersionReason.valueOf(getString("reason")),
    )
}
