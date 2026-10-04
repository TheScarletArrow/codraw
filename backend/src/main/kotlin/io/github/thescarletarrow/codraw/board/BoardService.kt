package io.github.thescarletarrow.codraw.board

import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class BoardService(
    private val boards: BoardRepository,
    private val visits: BoardVisits,
    private val clock: Clock,
) {

    /** Creates a board owned by the user [ownerId]. */
    fun create(title: String, ownerId: UUID): Board {
        val now = now()
        return boards.save(Board(title = title, ownerId = ownerId, createdAt = now, updatedAt = now))
    }

    /** Boards of the user [ownerId], most recently changed first. */
    fun list(ownerId: UUID): List<Board> = boards.findAllByOwnerIdOrderByUpdatedAtDesc(ownerId)

    /** Returns the board of any user; [roleOf] tells whether a user may open it. */
    fun find(id: UUID): Board? = boards.findByIdOrNull(id)

    /** Records that the user [userId] opened the [board] of another user through its link. */
    fun recordVisit(board: Board, userId: UUID) {
        if (board.ownerId != userId) visits.record(userId, checkNotNull(board.id), now())
    }

    /** Boards of other users that the user [userId] opened through their links and may open now, most recently opened first. */
    fun visitedBy(userId: UUID): List<VisitedBoard> = visits.visitedBy(userId, VISITED_LIMIT)

    /** Gives the [board] a new [title] and a new [linkAccess], each when given; only renaming is a change of the board. */
    fun update(board: Board, title: String?, linkAccess: LinkAccess?): Board = boards.save(
        board.copy(
            title = title ?: board.title,
            linkAccess = linkAccess ?: board.linkAccess,
            updatedAt = if (title != null) now() else board.updatedAt,
        ),
    )

    /** Deletes the [board] for good, with its document and the visits of other users. */
    fun delete(board: Board) {
        boards.deleteById(checkNotNull(board.id))
    }

    /** Passes all boards of the user [fromUserId], and the boards they opened through links, to the user [toUserId]. */
    @Transactional
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        boards.changeOwner(fromUserId, toUserId)
        visits.transfer(fromUserId, toUserId)
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    companion object {
        /** The most boards the list of boards opened through links holds. */
        const val VISITED_LIMIT = 50
    }
}
