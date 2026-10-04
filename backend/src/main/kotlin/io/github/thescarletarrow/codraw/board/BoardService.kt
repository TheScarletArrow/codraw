package io.github.thescarletarrow.codraw.board

import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class BoardService(
    private val boards: BoardRepository,
    private val clock: Clock,
) {

    /** Creates a board owned by the user [ownerId]. */
    fun create(title: String, ownerId: UUID): Board {
        val now = now()
        return boards.save(Board(title = title, ownerId = ownerId, createdAt = now, updatedAt = now))
    }

    /** Boards of the user [ownerId], most recently changed first. */
    fun list(ownerId: UUID): List<Board> = boards.findAllByOwnerIdOrderByUpdatedAtDesc(ownerId)

    /** Returns the board, or `null` when it does not exist or belongs to another user. */
    fun find(id: UUID, ownerId: UUID): Board? = boards.findByIdAndOwnerId(id, ownerId)

    /** Passes all boards of the user [ownerId] to the user [newOwnerId]. */
    fun changeOwner(ownerId: UUID, newOwnerId: UUID) {
        boards.changeOwner(ownerId, newOwnerId)
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)
}
