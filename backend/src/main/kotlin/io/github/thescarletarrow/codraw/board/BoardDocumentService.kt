package io.github.thescarletarrow.codraw.board

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
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
        if (!boards.existsActive(boardId)) {
            return StoredDocument.BoardNotFound
        }
        return documents.findState(boardId)?.let { StoredDocument.State(it) } ?: StoredDocument.Empty
    }

    /** When the document of the board [boardId] was stored last; `null` before its first store. */
    fun storedAt(boardId: UUID): Instant? = documents.stamp(boardId)?.updatedAt

    /**
     * Saves the document state, which the users [editors] changed since the previous save, and marks the board as
     * changed. The state it replaces may become a version of the board, which takes the users who changed it as its
     * authors; the [editors] are then the first who changed the board since that version. Returns `false` when the board
     * does not exist.
     */
    @Transactional
    fun save(boardId: UUID, state: ByteArray, editors: Collection<UUID> = emptyList()): Boolean {
        val now = clock.instant().truncatedTo(ChronoUnit.MICROS)
        if (!boards.touch(boardId, now)) {
            return false
        }
        versions.beforeStore(boardId, now)
        documents.upsert(boardId, state, editors.toList(), BoardVersionService.AUTHORS_LIMIT, now)
        return true
    }
}

sealed interface StoredDocument {
    data object BoardNotFound : StoredDocument
    data object Empty : StoredDocument
    class State(val bytes: ByteArray) : StoredDocument
}
