package io.github.thescarletarrow.codraw.decision

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.Board
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Architecture decisions of a board. Whoever may open the board reads them; whoever edits it writes them down, changes,
 * links to elements and deletes them. The caller checks the role of the user on the board. Their discussion is a thread
 * of comments about the decision (see `CommentService`).
 */
@Service
class DecisionService(
    private val decisions: Decisions,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    fun decisions(board: Board): List<Decision> = decisions.decisions(board.boardId)

    fun decision(board: Board, decisionId: UUID): Decision =
        decisions.decision(board.boardId, decisionId) ?: throw DecisionNotFoundException()

    /** Whether the decision [decisionId] is on the [board]. */
    fun exists(board: Board, decisionId: UUID): Boolean = decisions.exists(board.boardId, decisionId)

    /**
     * Writes down a decision of the [board] by the user [authorId], with the [number] it is given, e.g. by a file of
     * MADR, or the next one of the board; a number the board has already is refused.
     */
    @Transactional
    fun add(board: Board, authorId: UUID, number: Int?, content: DecisionContent, elements: List<DecisionElement>): Decision {
        decisions.lockBoard(board.boardId)
        if (decisions.countOnBoard(board.boardId) >= limits.decisionsPerBoard) {
            metrics.limitReached(Limit.DECISIONS)
            throw DecisionLimitReachedException(limits.decisionsPerBoard)
        }
        if (number != null && decisions.numberTaken(board.boardId, number)) throw DecisionNumberTakenException(number)
        checkSuperseding(board, decisionId = null, content)
        val at = now()
        val id = decisions.add(board.boardId, number ?: decisions.nextNumber(board.boardId), authorId, content, at)
        if (elements.isNotEmpty()) decisions.replaceElements(id, elements, at)
        return decision(board, id)
    }

    /** Changes what the decision says; its number and author stay. */
    @Transactional
    fun update(board: Board, decisionId: UUID, content: DecisionContent): Decision {
        if (!decisions.exists(board.boardId, decisionId)) throw DecisionNotFoundException()
        checkSuperseding(board, decisionId, content)
        decisions.update(decisionId, content, now())
        return decision(board, decisionId)
    }

    /** Makes the decision be about exactly the [elements]. */
    @Transactional
    fun link(board: Board, decisionId: UUID, elements: List<DecisionElement>): Decision {
        if (!decisions.exists(board.boardId, decisionId)) throw DecisionNotFoundException()
        decisions.replaceElements(decisionId, elements, now())
        return decision(board, decisionId)
    }

    @Transactional
    fun delete(board: Board, decisionId: UUID) {
        if (!decisions.exists(board.boardId, decisionId)) throw DecisionNotFoundException()
        decisions.delete(decisionId)
    }

    /** Passes the decisions of the guest [fromUserId] to the user [toUserId] who signs in, like their comments. */
    fun transfer(fromUserId: UUID, toUserId: UUID) = decisions.transfer(fromUserId, toUserId)

    /** The day of today, as a decision taken now is dated. */
    fun today(): LocalDate = LocalDate.now(clock)

    /** A superseded decision names another decision of the board that superseded it; other statuses name none. */
    private fun checkSuperseding(board: Board, decisionId: UUID?, content: DecisionContent) {
        val by = content.supersededBy
        if (by != null && content.status != DecisionStatus.SUPERSEDED) {
            throw InvalidDecisionException("Only a superseded decision names the decision that superseded it")
        }
        if (by != null && (by == decisionId || !decisions.exists(board.boardId, by))) {
            throw InvalidDecisionException("A decision is superseded by another decision of the board")
        }
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private val Board.boardId: UUID
        get() = checkNotNull(id) { "Persisted board must have an id" }
}

/** The decision is not on the board. */
class DecisionNotFoundException : RuntimeException("Decision not found")

/** The board has a decision of the number already. */
class DecisionNumberTakenException(val number: Int) : RuntimeException("The board has a decision number $number already")

/** What a decision says does not hold together, e.g. a superseded decision without the one that superseded it. */
class InvalidDecisionException(message: String) : RuntimeException(message)

/** The board has as many decisions as the [limit] allows. */
class DecisionLimitReachedException(val limit: Int) : RuntimeException("The board has $limit decisions, the most allowed")
