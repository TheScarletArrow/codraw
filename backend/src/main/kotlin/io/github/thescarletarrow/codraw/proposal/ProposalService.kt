package io.github.thescarletarrow.codraw.proposal

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.BoardMembers
import io.github.thescarletarrow.codraw.board.BoardVersionService
import io.github.thescarletarrow.codraw.board.MemberRole
import io.github.thescarletarrow.codraw.board.Participation
import io.github.thescarletarrow.codraw.board.VersionReason
import io.github.thescarletarrow.codraw.notification.NotificationService
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Proposals of changes of boards. Whoever has a role on a board, a viewer too, proposes changes in a draft of it; the
 * owner and the editors of the board, who manage its versions ([io.github.thescarletarrow.codraw.board.BoardRole.managesVersions]),
 * see every proposal and accept or decline it, anybody else sees their own. The caller checks the role on the board.
 *
 * The backend does not merge a proposal into the board: it keeps the documents opaque, like those of boards, and the page
 * of whoever accepts merges the draft into the board after [accept] has kept the board as a version.
 */
@Service
class ProposalService(
    private val proposals: Proposals,
    private val members: BoardMembers,
    private val versions: BoardVersionService,
    private val notifications: NotificationService,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    /** The proposals of the board that the user [userId] sees, newest first. */
    fun list(participation: Participation, userId: UUID): List<Proposal> =
        proposals.list(participation.board.boardId, if (participation.role.managesVersions) null else userId)

    /**
     * Proposes changes of the board by the user [authorId], with a draft that starts as the stored document of the board,
     * and tells those who review proposals of the board. Throws [ProposalLimitReachedException] when the board or the
     * author has as many open proposals as the limits allow.
     */
    @Transactional
    fun create(board: Board, authorId: UUID, title: String, description: String?): Proposal {
        val boardId = board.boardId
        // Proposals made at the same time on one board count each other.
        proposals.lockBoard(boardId)
        if (proposals.countOpen(boardId) >= limits.proposalsPerBoard) {
            metrics.limitReached(Limit.PROPOSALS)
            throw ProposalLimitReachedException(limits.proposalsPerBoard, ProposalLimitReachedException.Scope.BOARD)
        }
        if (proposals.countOpen(boardId, authorId) >= limits.proposalsPerAuthor) {
            metrics.limitReached(Limit.AUTHOR_PROPOSALS)
            throw ProposalLimitReachedException(limits.proposalsPerAuthor, ProposalLimitReachedException.Scope.AUTHOR)
        }
        val id = proposals.add(boardId, authorId, title, description, now())
        notifications.proposalCreated(board, id, authorId, reviewers(board))
        return checkNotNull(proposals.find(boardId, id))
    }

    /** The proposal [id] of the board, when the user [userId] sees it; throws [ProposalNotFoundException] otherwise. */
    fun get(participation: Participation, userId: UUID, id: UUID): Proposal {
        val proposal = proposals.find(participation.board.boardId, id)
        if (proposal == null || !participation.sees(proposal, userId)) throw ProposalNotFoundException()
        return proposal
    }

    /** The base of the proposal [id], the board when it was proposed, as [get] lets the user [userId] see it. */
    fun base(participation: Participation, userId: UUID, id: UUID): ProposalDocument {
        get(participation, userId, id)
        return proposals.base(participation.board.boardId, id) ?: throw ProposalNotFoundException()
    }

    /**
     * Accepts the open proposal [id] by the user [userId], who manages the versions of the board: the [state] of the
     * board that their page is about to merge the proposal into becomes a version first, in the same transaction, and the
     * author hears of it. Throws [ProposalForbiddenException] for anybody else and [ProposalClosedException] once the
     * proposal is closed, e.g. by another reviewer at the same moment.
     */
    @Transactional
    fun accept(participation: Participation, userId: UUID, id: UUID, state: ByteArray): Proposal {
        checkReviewer(participation)
        val proposal = openForDecision(participation, userId, id)
        versions.save(participation.board.boardId, state, VersionReason.PROPOSAL)
        return close(participation.board, proposal, ProposalStatus.ACCEPTED, userId, null)
    }

    /** Declines the open proposal [id] by the user [userId] with the [comment] if any; like [accept] it is for reviewers. */
    @Transactional
    fun decline(participation: Participation, userId: UUID, id: UUID, comment: String?): Proposal {
        checkReviewer(participation)
        val proposal = openForDecision(participation, userId, id)
        return close(participation.board, proposal, ProposalStatus.DECLINED, userId, comment)
    }

    /** Withdraws the open proposal [id] of the user [userId]; nobody else may. */
    @Transactional
    fun withdraw(participation: Participation, userId: UUID, id: UUID): Proposal {
        val proposal = openForDecision(participation, userId, id)
        if (proposal.author.id != userId) throw ProposalForbiddenException("Only the author can withdraw the proposal")
        return close(participation.board, proposal, ProposalStatus.WITHDRAWN, userId, null)
    }

    /** The draft of the proposal [id] for collab, or `null` when there is no such proposal. */
    fun draft(id: UUID): ProposalDocument? = proposals.draft(id)

    /** Stores the draft of the proposal [id] that collab sends; a closed proposal keeps its draft as it is. */
    fun storeDraft(id: UUID, state: ByteArray): DraftStore = proposals.storeDraft(id, state)

    /** Whose the draft of the proposal [id] is and whether it is open, for collab; `null` when there is none. */
    fun draftAccess(id: UUID): DraftAccess? = proposals.access(id)

    /** Passes the proposals and the decisions of the guest [fromUserId] to the user [toUserId] who signs in. */
    fun transfer(fromUserId: UUID, toUserId: UUID) = proposals.transfer(fromUserId, toUserId)

    /** The proposal locked against other decisions while it is decided; it must be open and seen by the user. */
    private fun openForDecision(participation: Participation, userId: UUID, id: UUID): Proposal {
        val proposal = proposals.lock(participation.board.boardId, id)
        if (proposal == null || !participation.sees(proposal, userId)) throw ProposalNotFoundException()
        if (proposal.status != ProposalStatus.OPEN) throw ProposalClosedException()
        return proposal
    }

    private fun close(board: Board, proposal: Proposal, status: ProposalStatus, userId: UUID, comment: String?): Proposal {
        proposals.close(proposal.id, status, userId, comment, now())
        when (status) {
            ProposalStatus.WITHDRAWN -> notifications.proposalWithdrawn(proposal.id)
            else -> notifications.proposalDecided(board, proposal.id, proposal.author.id, userId, status == ProposalStatus.ACCEPTED)
        }
        // Closed ones are kept for a while, so that the author and the reviewers see what became of them.
        proposals.deleteClosedBeyond(board.boardId, limits.closedProposalsPerBoard)
        return proposals.find(board.boardId, proposal.id) ?: proposal
    }

    private fun checkReviewer(participation: Participation) {
        if (!participation.role.managesVersions) {
            throw ProposalForbiddenException("Only the owner and editors accept and decline proposals")
        }
    }

    /**
     * Who reviews the proposals of the [board]: its owner and its members who edit it. Those who edit it through its
     * link are not known by name.
     */
    private fun reviewers(board: Board): Set<UUID> =
        members.roles(board.boardId).filterValues { it == MemberRole.EDITOR }.keys + board.ownerId

    /** Reviewers see every proposal of the board, anybody else their own. */
    private fun Participation.sees(proposal: Proposal, userId: UUID) = role.managesVersions || proposal.author.id == userId

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private val Board.boardId: UUID
        get() = checkNotNull(id) { "Persisted board must have an id" }

    companion object {
        /** The longest title of a proposal. */
        const val TITLE_MAX_LENGTH = 120

        /** The longest description of a proposal and the longest comment of a declined one. */
        const val TEXT_MAX_LENGTH = 2000
    }
}

/** The board has no such proposal, or the user may not see it. */
class ProposalNotFoundException : RuntimeException("Proposal not found")

/** The user may not do this with the proposal. */
class ProposalForbiddenException(message: String) : RuntimeException(message)

/** The proposal is accepted, declined or withdrawn already. */
class ProposalClosedException : RuntimeException("The proposal is closed")

/** The board, or the author on the board, has as many open proposals as the [limit] allows. */
class ProposalLimitReachedException(val limit: Int, val scope: Scope) :
    RuntimeException("There are $limit open proposals ${scope.description}, the most allowed") {

    /** Whose open proposals reached the limit. */
    enum class Scope(val value: String, val description: String) {
        BOARD("board", "on the board"),
        AUTHOR("author", "of the author on the board"),
    }
}
