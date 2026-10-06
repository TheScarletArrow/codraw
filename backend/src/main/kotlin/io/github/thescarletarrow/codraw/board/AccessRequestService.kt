package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Requests of users for access to boards and the answers of their owners. Anybody signed in asks for a role on a board
 * they know the link to; the owner gives a role, which makes the user a member, or declines. The caller checks that the
 * user who answers owns the board.
 */
@Service
class AccessRequestService(
    private val requests: AccessRequests,
    private val members: BoardMembers,
    private val memberService: BoardMemberService,
    private val boards: BoardService,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    /** The request of the user [userId] for access to the [board], `null` when they have none. */
    fun own(board: Board, userId: UUID): AccessRequest? = requests.find(board.boardId, userId)

    /**
     * The user [userId] asks for the [role] on the board [boardId], with a [message] to its owner; a request of theirs
     * waiting for an answer is replaced. Throws [AccessAlreadyGivenException] when the board gives them that role or a
     * higher one already, and [AccessRequestLimitReachedException] when the board has as many requests as the limit
     * allows.
     */
    @Transactional
    fun request(boardId: UUID, userId: UUID, role: MemberRole, message: String?): AccessRequest {
        members.lockBoard(boardId)
        // Read under the lock: a new link, member or owner of the board waits for the request, or the request for them.
        val board = boards.find(boardId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found")
        val current = boards.roleOf(board, userId)
        if (current != null && current >= role.role) throw AccessAlreadyGivenException(current)
        if (requests.find(boardId, userId) == null && requests.count(boardId) >= limits.accessRequestsPerBoard) {
            metrics.limitReached(Limit.ACCESS_REQUESTS)
            throw AccessRequestLimitReachedException(limits.accessRequestsPerBoard)
        }
        return requests.put(boardId, userId, role, message, now())
    }

    /** The user [userId] no longer asks for access to the [board]; nothing happens when they did not. */
    fun cancel(board: Board, userId: UUID) {
        requests.delete(board.boardId, userId)
    }

    /** The requests for access to the [board], oldest first. */
    fun pending(board: Board): List<AccessRequest> = requests.list(board.boardId)

    /**
     * The owner answers the request [requestId] with the [role], which need not be the one asked for: its user becomes
     * a member of the [board] with it, and the request is gone. Throws [AccessRequestNotFoundException] when the board
     * has no such request, e.g. it was cancelled or replaced, and [MemberLimitReachedException] for a new member beyond
     * the limit.
     */
    @Transactional
    fun grant(board: Board, requestId: UUID, role: MemberRole): Participant {
        members.lockBoard(board.boardId)
        val request = requests.findById(board.boardId, requestId) ?: throw AccessRequestNotFoundException()
        val participant = memberService.give(board, request.userId, role)
        // A role lower than the one asked for leaves the request: the answer removes it all the same.
        requests.delete(board.boardId, request.userId)
        return participant
    }

    /** The owner declines the request [requestId]; its user may ask again. */
    fun decline(board: Board, requestId: UUID) {
        if (!requests.deleteById(board.boardId, requestId)) throw AccessRequestNotFoundException()
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private val Board.boardId: UUID
        get() = checkNotNull(id) { "Persisted board must have an id" }
}

/** The board has no such request for access: it was answered, cancelled or replaced, or it never was. */
class AccessRequestNotFoundException : RuntimeException("The request for access is not there")

/** The board gives the user the [role] already, which is what they asked for or more. */
class AccessAlreadyGivenException(val role: BoardRole) :
    RuntimeException("The user has the role ${role.value} on the board already")

/** The board has as many requests for access as the [limit] allows. */
class AccessRequestLimitReachedException(val limit: Int) :
    RuntimeException("The board has $limit requests for access, the most allowed")
