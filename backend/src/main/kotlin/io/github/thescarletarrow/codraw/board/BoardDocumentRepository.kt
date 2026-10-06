package io.github.thescarletarrow.codraw.board

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/**
 * Yjs document states of boards. Opaque to the backend: they are stored and returned as is. Next to the state are the
 * users whose changes it has since the latest version of the board, whom the next version takes as its authors.
 *
 * Plain JDBC rather than Spring Data: the users go to PostgreSQL as one `uuid[]`, like the ids in [BoardVersions].
 */
@Repository
class BoardDocumentRepository(private val jdbc: JdbcClient) {

    /** The stored state of the document of the board [boardId], or `null` when it has none yet. */
    fun findState(boardId: UUID): ByteArray? = jdbc.sql("SELECT state FROM board_documents WHERE board_id = :boardId")
        .param("boardId", boardId)
        .query(ByteArray::class.java)
        .optional()
        .orElse(null)

    /**
     * When the document of the board [boardId] was stored last and who changed it since the latest version of the board;
     * `null` before its first store.
     */
    fun stamp(boardId: UUID): DocumentStamp? = jdbc.sql(
        "SELECT updated_at, editors FROM board_documents WHERE board_id = :boardId",
    )
        .param("boardId", boardId)
        .query { rs, _ ->
            DocumentStamp(
                updatedAt = rs.getObject("updated_at", OffsetDateTime::class.java).toInstant(),
                editorIds = (rs.getArray("editors").array as Array<*>).map { it as UUID },
            )
        }
        .optional()
        .orElse(null)

    /**
     * Stores the [state] of the document of the board [boardId], which the users [editors] changed: those of them who
     * did not change the stored document yet join its editors at the end, up to [maxEditors] together.
     */
    fun upsert(boardId: UUID, state: ByteArray, editors: List<UUID>, maxEditors: Int, updatedAt: Instant) {
        jdbc.sql(
            """
            INSERT INTO board_documents (board_id, state, editors, updated_at)
            VALUES (:boardId, :state, :editors::uuid[], :updatedAt)
            ON CONFLICT (board_id) DO UPDATE SET
                state = EXCLUDED.state,
                updated_at = EXCLUDED.updated_at,
                -- Each user once, at the place of their first change.
                editors = ARRAY(
                    SELECT editor
                    FROM unnest(board_documents.editors || EXCLUDED.editors) WITH ORDINALITY AS merged (editor, n)
                    GROUP BY editor
                    ORDER BY min(n)
                    LIMIT :maxEditors
                )
            """,
        )
            .param("boardId", boardId)
            .param("state", state)
            .param("editors", editors.distinct().take(maxEditors).toTypedArray())
            .param("maxEditors", maxEditors)
            .param("updatedAt", updatedAt.atOffset(ZoneOffset.UTC))
            .update()
    }
}
