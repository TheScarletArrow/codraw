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

    /** Whether the board [boardId] has a stored document. */
    fun exists(boardId: UUID): Boolean = jdbc.sql("SELECT EXISTS (SELECT 1 FROM board_documents WHERE board_id = :boardId)")
        .param("boardId", boardId)
        .query(Boolean::class.java)
        .single()

    /**
     * Stores the [text] of the stored document of the board [boardId] that search finds it by; with [onlyIfMissing],
     * only while it has none. Returns whether it stored the text: `false` without a document, or with a text already.
     */
    fun storeSearchText(boardId: UUID, text: String, onlyIfMissing: Boolean): Boolean = jdbc.sql(
        """
        UPDATE board_documents SET search_text = :text
        WHERE board_id = :boardId AND (NOT :onlyIfMissing OR search_text IS NULL)
        """,
    )
        .param("boardId", boardId)
        .param("text", text)
        .param("onlyIfMissing", onlyIfMissing)
        .update() > 0

    /** Boards with a stored document without a text for search, the first [limit] of them by id after [after]. */
    fun withoutSearchText(after: UUID?, limit: Int): List<UUID> = jdbc.sql(
        "SELECT board_id FROM board_documents WHERE search_text IS NULL AND board_id > :after ORDER BY board_id LIMIT :limit",
    )
        // The nil UUID comes before any id of a board.
        .param("after", after ?: UUID(0, 0))
        .param("limit", limit)
        .query(UUID::class.java)
        .list()
        .filterNotNull()

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
