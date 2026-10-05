package io.github.thescarletarrow.codraw.board

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class BoardDocumentService(
    private val boards: BoardRepository,
    private val documents: BoardDocumentRepository,
    private val versions: BoardVersionService,
    private val clock: Clock,
) {

    @Transactional(readOnly = true)
    fun load(boardId: UUID): StoredDocument {
        if (!boards.existsById(boardId)) {
            return StoredDocument.BoardNotFound
        }
        return documents.findByBoardId(boardId)?.let { StoredDocument.State(it.state) } ?: StoredDocument.Empty
    }

    /**
     * Saves the document state and marks the board as changed; the state it replaces may become a version of the board.
     * Returns `false` when the board does not exist.
     */
    @Transactional
    fun save(boardId: UUID, state: ByteArray): Boolean {
        val now = clock.instant().truncatedTo(ChronoUnit.MICROS)
        if (!boards.touch(boardId, now)) {
            return false
        }
        versions.beforeStore(boardId, now)
        documents.upsert(boardId, state, now)
        return true
    }
}

sealed interface StoredDocument {
    data object BoardNotFound : StoredDocument
    data object Empty : StoredDocument
    class State(val bytes: ByteArray) : StoredDocument
}
