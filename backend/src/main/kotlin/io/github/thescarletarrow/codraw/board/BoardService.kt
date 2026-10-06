package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.user.UserRepository
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
    private val members: BoardMembers,
    private val users: UserRepository,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    /**
     * Creates a board owned by the user [ownerId]; throws [BoardLimitReachedException] when they own as many boards as
     * the limit allows.
     */
    @Transactional
    fun create(title: String, ownerId: UUID): Board {
        // Boards created at the same time by one owner count each other.
        checkNotNull(users.lock(ownerId)) { "Owner $ownerId does not exist" }
        if (boards.countByOwnerId(ownerId) >= limits.boardsPerUser) {
            metrics.limitReached(Limit.BOARDS)
            throw BoardLimitReachedException(limits.boardsPerUser)
        }
        val now = now()
        return boards.save(Board(title = title, ownerId = ownerId, createdAt = now, updatedAt = now))
            .also { metrics.boardCreated() }
    }

    /** Boards of the user [ownerId], most recently changed first. */
    fun list(ownerId: UUID): List<Board> = boards.findAllByOwnerIdOrderByUpdatedAtDesc(ownerId)

    /** Returns the board of any user; what the caller may do with it depends on [roleOf]. */
    fun find(id: UUID): Board? = boards.findByIdOrNull(id)

    /** The role of the user [userId] on the [board], with their role as a member; `null` when it gives them none. */
    fun roleOf(board: Board, userId: UUID): BoardRole? =
        board.roleOf(userId, if (board.ownerId == userId) null else members.roleOf(checkNotNull(board.id), userId))

    /** Records that the user [userId] opened the [board] of another user, through its link or as a member. */
    fun recordVisit(board: Board, userId: UUID) {
        if (board.ownerId != userId) visits.record(userId, checkNotNull(board.id), now())
    }

    /** Boards of other users that the user [userId] opened or is a member of, the latest opened or joined first. */
    fun sharedWith(userId: UUID): List<SharedBoard> = visits.sharedWith(userId, SHARED_LIMIT)

    /** Gives the [board] a new [title]; renaming is a change of the board. */
    fun rename(board: Board, title: String): Board {
        val now = now()
        boards.rename(checkNotNull(board.id), title, now)
        return board.copy(title = title, updatedAt = now)
    }

    /** Sets what the link to the [board] gives to others; this is not a change of the board itself. */
    fun changeLinkAccess(board: Board, linkAccess: LinkAccess): Board {
        boards.updateLinkAccess(checkNotNull(board.id), linkAccess.name)
        return board.copy(linkAccess = linkAccess)
    }

    /** Deletes the [board] for good, with its document, its members and the visits of other users. */
    fun delete(board: Board) {
        boards.deleteById(checkNotNull(board.id))
    }

    /**
     * Makes the member [newOwnerId] the owner of the [board]; its previous owner stays on it as an editor. Throws
     * [MemberNotFoundException] when [newOwnerId] is no member, [BoardLimitReachedException] when they own as many
     * boards as the limit allows, and [BoardOwnerChangedException] when the board got another owner since it was read.
     */
    @Transactional
    fun transferOwnership(board: Board, newOwnerId: UUID): Board {
        val boardId = checkNotNull(board.id)
        // Like creating a board: the boards of the new owner do not change while they are counted.
        users.lock(newOwnerId) ?: throw MemberNotFoundException()
        if (members.roleOf(boardId, newOwnerId) == null) throw MemberNotFoundException()
        if (boards.countByOwnerId(newOwnerId) >= limits.boardsPerUser) {
            metrics.limitReached(Limit.BOARDS)
            throw BoardLimitReachedException(limits.boardsPerUser)
        }
        // A second transfer of the same board waits for the first one here, then finds another owner.
        if (!boards.changeOwnerOf(boardId, board.ownerId, newOwnerId)) throw BoardOwnerChangedException()
        members.remove(boardId, newOwnerId)
        members.put(boardId, board.ownerId, MemberRole.EDITOR, now())
        return board.copy(ownerId = newOwnerId)
    }

    /**
     * Passes all boards of the user [fromUserId], the boards they opened through links and their memberships to the
     * user [toUserId].
     */
    @Transactional
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        boards.changeOwner(fromUserId, toUserId)
        visits.transfer(fromUserId, toUserId)
        members.transfer(fromUserId, toUserId)
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    companion object {
        /** The most boards the list of boards shared with a user holds. */
        const val SHARED_LIMIT = 50
    }
}

/** The user owns as many boards as the [limit] allows. */
class BoardLimitReachedException(val limit: Int) : RuntimeException("The user owns $limit boards, the most allowed")

/** The board got another owner while its owner was changing it. */
class BoardOwnerChangedException : RuntimeException("The owner of the board changed meanwhile")
