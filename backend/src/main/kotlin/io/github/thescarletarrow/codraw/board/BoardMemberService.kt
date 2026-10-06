package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.Tokens
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Members of boards and the invitation links that make users members. The caller checks that the user may do this:
 * everybody with a role sees the participants, only the owner changes them and manages invitations.
 */
@Service
class BoardMemberService(
    private val members: BoardMembers,
    private val invites: BoardInvites,
    private val boards: BoardService,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    /** The owner of the [board] first, then its members in the order they joined. */
    fun participants(board: Board): List<Participant> = members.participants(board.boardId, board.ownerId)

    /** Users who opened the [board] through its link and are not its members, most recently first. */
    fun visitors(board: Board): List<Visitor> = members.visitors(board.boardId, board.ownerId, VISITORS_LIMIT)

    /**
     * Gives the user [userId] the [role] on the [board]: a member gets it, and a user who opened the board through its
     * link becomes a member with it. Throws [MemberNotFoundException] for anybody else, the owner included: the owner
     * cannot put an arbitrary user among the boards shared with them.
     */
    @Transactional
    fun putMember(board: Board, userId: UUID, role: MemberRole): Participant {
        val boardId = board.boardId
        if (userId == board.ownerId) throw MemberNotFoundException()
        members.lockBoard(boardId)
        if (members.roleOf(boardId, userId) == null && !members.visited(boardId, userId)) {
            throw MemberNotFoundException()
        }
        return give(board, userId, role)
    }

    /**
     * Makes the user [userId] a member of the [board] with the [role], or gives a member that role, e.g. as the owner
     * answers their request for access; the caller checks that the owner may put this user among the members. Throws
     * [MemberNotFoundException] for the owner and [MemberLimitReachedException] for a new member beyond the limit.
     * Requests for access that the role satisfies are dropped.
     */
    @Transactional
    fun give(board: Board, userId: UUID, role: MemberRole): Participant {
        val boardId = board.boardId
        if (userId == board.ownerId) throw MemberNotFoundException()
        members.lockBoard(boardId)
        if (members.roleOf(boardId, userId) == null) checkMemberLimit(boardId)
        members.put(boardId, userId, role, now())
        boards.dropSatisfiedRequests(board)
        return participants(board).first { it.id == userId }
    }

    /** Takes the role of a member from the user [userId]; what the link of the [board] gives stays theirs. */
    fun removeMember(board: Board, userId: UUID) {
        if (!members.remove(board.boardId, userId)) throw MemberNotFoundException()
    }

    /** The invitations of the [board], oldest first. */
    fun invites(board: Board): List<Invite> = invites.list(board.boardId)

    /** Creates an invitation link that makes whoever opens it a member of the [board] with the [role]. */
    @Transactional
    fun invite(board: Board, role: MemberRole): Invite {
        members.lockBoard(board.boardId)
        if (invites.count(board.boardId) >= limits.invitesPerBoard) {
            metrics.limitReached(Limit.INVITES)
            throw InviteLimitReachedException(limits.invitesPerBoard)
        }
        return invites.add(board.boardId, Tokens.next(), role, now())
    }

    /** Revokes the invitation; the members who joined through it stay. */
    fun revoke(board: Board, inviteId: UUID) {
        if (!invites.delete(board.boardId, inviteId)) throw InviteNotFoundException()
    }

    /**
     * The user [userId] accepts the invitation [token]: they become a member with its role, a member with a lower role
     * gets it, and a member with a higher role or the owner keeps theirs. Returns the board. Throws
     * [InviteNotFoundException] when there is no such invitation, e.g. it was revoked.
     */
    @Transactional
    fun accept(token: String, userId: UUID): Board {
        val invite = invites.find(token) ?: throw InviteNotFoundException()
        members.lockBoard(invite.boardId)
        // Read under the lock: the owner may have just given the board away.
        val board = boards.find(invite.boardId) ?: throw InviteNotFoundException()
        if (board.ownerId == userId) return board
        val current = members.roleOf(invite.boardId, userId)
        if (current == null) checkMemberLimit(invite.boardId)
        if (current == null || current < invite.role) members.put(invite.boardId, userId, invite.role, now())
        boards.dropSatisfiedRequests(board)
        return board
    }

    /** Members who join a board at the same time count each other: the caller holds the lock of the board. */
    private fun checkMemberLimit(boardId: UUID) {
        if (members.count(boardId) >= limits.membersPerBoard) {
            metrics.limitReached(Limit.MEMBERS)
            throw MemberLimitReachedException(limits.membersPerBoard)
        }
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private val Board.boardId: UUID
        get() = checkNotNull(id) { "Persisted board must have an id" }

    companion object {
        /** The most users who opened a board through its link that the owner is offered to add. */
        const val VISITORS_LIMIT = 50
    }
}

/** The user is not a member of the board, nor may become one this way. */
class MemberNotFoundException : RuntimeException("The user is not a member of the board")

/** No invitation has this token: it was revoked, or it never was. */
class InviteNotFoundException : RuntimeException("The invitation is not valid")

/** The board has as many members as the [limit] allows. */
class MemberLimitReachedException(val limit: Int) : RuntimeException("The board has $limit members, the most allowed")

/** The board has as many invitations as the [limit] allows. */
class InviteLimitReachedException(val limit: Int) : RuntimeException("The board has $limit invitations, the most allowed")
