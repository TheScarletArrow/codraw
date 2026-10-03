package io.github.thescarletarrow.codraw.board

import org.springframework.data.annotation.Id
import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.relational.core.mapping.Table
import org.springframework.data.repository.Repository
import java.time.Instant
import java.util.UUID

/** Yjs document state of a board. Opaque to the backend: it is stored and returned as is. */
@Table("board_documents")
class BoardDocument(
    @Id val boardId: UUID,
    val state: ByteArray,
    val updatedAt: Instant,
)

interface BoardDocumentRepository : Repository<BoardDocument, UUID> {

    fun findByBoardId(boardId: UUID): BoardDocument?

    @Modifying
    @Query(
        """
        INSERT INTO board_documents (board_id, state, updated_at) VALUES (:boardId, :state, :updatedAt)
        ON CONFLICT (board_id) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at
        """,
    )
    fun upsert(boardId: UUID, state: ByteArray, updatedAt: Instant)
}
