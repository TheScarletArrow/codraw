package io.github.thescarletarrow.codraw.comment

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.LinkAccess
import io.github.thescarletarrow.codraw.notification.NotificationService
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Comments of the participants of a board. Whoever may open the board reads and writes them, reacts to them and assigns
 * their threads, viewers too: comments do not change the diagram. The caller checks that the user has a role on the
 * board. A comment notifies those it mentions and those who wrote in its thread before, an assigned thread its
 * assignee; reactions notify nobody.
 */
@Service
class CommentService(
    private val comments: Comments,
    private val notifications: NotificationService,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    fun threads(board: Board): List<CommentThread> = comments.threads(board.boardId)

    fun thread(board: Board, threadId: UUID): CommentThread = comments.thread(board.boardId, threadId) ?: throw CommentNotFoundException()

    /** Who may be mentioned on the [board]: its owner first, then its members and those who opened it by its link. */
    fun people(board: Board): List<Person> =
        comments.people(board.boardId, board.ownerId, board.linkOpen, PEOPLE_LIMIT)

    /**
     * Starts a thread about the cell [cellId] of the page [pageId], at the [point] of it, or about the page, with the
     * first comment. The caller checks that the thread is not about a cell and a point at once.
     */
    @Transactional
    fun start(
        board: Board,
        authorId: UUID,
        pageId: String,
        cellId: String?,
        point: ThreadPoint?,
        body: String,
        mentions: Collection<UUID>,
    ): CommentThread {
        checkLimit(board)
        val threadId = comments.addThread(board.boardId, pageId, cellId, point, now())
        add(board, threadId, authorId, body, mentions, answered = emptySet())
        return thread(board, threadId)
    }

    @Transactional
    fun reply(board: Board, threadId: UUID, authorId: UUID, body: String, mentions: Collection<UUID>): CommentThread {
        checkLimit(board)
        if (!comments.threadExists(board.boardId, threadId)) throw CommentNotFoundException()
        // Who wrote in the thread and can still open the board hears of the answer.
        val answered = comments.participants(board.boardId, board.ownerId, board.linkOpen, comments.authors(threadId))
        add(board, threadId, authorId, body, mentions, answered)
        return thread(board, threadId)
    }

    /** Changes the text of a comment; only its author may. */
    @Transactional
    fun edit(board: Board, threadId: UUID, commentId: UUID, userId: UUID, body: String, mentions: Collection<UUID>): CommentThread {
        val comment = comments.comment(board.boardId, threadId, commentId) ?: throw CommentNotFoundException()
        if (comment.authorId != userId) throw CommentForbiddenException("Only the author can change the comment")
        val before = comments.mentionsOf(commentId)
        val mentioned = mentioned(board, mentions)
        comments.edit(commentId, body, now())
        comments.replaceMentions(commentId, mentioned)
        notifications.mentionsAdded(board.boardId, commentId, userId, mentioned - before)
        return thread(board, threadId)
    }

    /**
     * Deletes a comment; its author or the owner of the board may. The first comment takes the whole thread with it.
     * Returns the thread that is left, or `null` when the thread is gone.
     */
    @Transactional
    fun delete(board: Board, threadId: UUID, commentId: UUID, userId: UUID): CommentThread? {
        val comment = comments.comment(board.boardId, threadId, commentId) ?: throw CommentNotFoundException()
        if (comment.authorId != userId && board.ownerId != userId) {
            throw CommentForbiddenException("Only the author or the owner of the board can delete the comment")
        }
        if (comment.first) {
            comments.deleteThread(threadId)
            return null
        }
        comments.deleteComment(commentId)
        return thread(board, threadId)
    }

    /**
     * Marks the thread resolved by the user [userId], or open again, when [resolved] is set; any participant may. Moves
     * the thread to the [point] when it is set; only the author of the thread, who wrote its first comment, or the
     * owner of the board may, and only a thread that stands at a point.
     */
    @Transactional
    fun change(board: Board, threadId: UUID, userId: UUID, resolved: Boolean?, point: ThreadPoint?): CommentThread {
        val thread = comments.storedThread(board.boardId, threadId) ?: throw CommentNotFoundException()
        if (point != null) {
            if (!thread.atPoint) throw ThreadNotAtPointException()
            if (thread.authorId != userId && board.ownerId != userId) {
                throw CommentForbiddenException("Only the author of the thread or the owner of the board can move it")
            }
            comments.move(threadId, point)
        }
        when (resolved) {
            true -> comments.resolve(threadId, userId, now())
            false -> comments.resolve(threadId, null, null)
            null -> Unit
        }
        return thread(board, threadId)
    }

    /** Puts the [reaction] of the user [userId] on a comment; putting it again changes nothing. */
    @Transactional
    fun addReaction(board: Board, threadId: UUID, commentId: UUID, userId: UUID, reaction: Reaction): CommentThread {
        comments.comment(board.boardId, threadId, commentId) ?: throw CommentNotFoundException()
        comments.addReaction(commentId, userId, reaction, now())
        return thread(board, threadId)
    }

    /** Takes the [reaction] of the user [userId] away from a comment, if it is there. */
    @Transactional
    fun removeReaction(board: Board, threadId: UUID, commentId: UUID, userId: UUID, reaction: Reaction): CommentThread {
        comments.comment(board.boardId, threadId, commentId) ?: throw CommentNotFoundException()
        comments.removeReaction(commentId, userId, reaction)
        return thread(board, threadId)
    }

    /**
     * Makes [assigneeId] the assignee of the thread in place of anybody before, or leaves the thread without one when it
     * is `null`; any participant may, the user [userId] here. Only those who may be mentioned may be assigned. The new
     * assignee hears of it, unless they assigned the thread to themselves.
     */
    @Transactional
    fun assign(board: Board, threadId: UUID, userId: UUID, assigneeId: UUID?): CommentThread {
        // Those whom comments may mention may be assigned, nobody else.
        if (assigneeId != null && mentioned(board, setOf(assigneeId)).isEmpty()) throw AssigneeNotParticipantException()
        val reassignment = comments.assign(board.boardId, threadId, assigneeId) ?: throw CommentNotFoundException()
        notifications.threadAssigned(board.boardId, threadId, userId, reassignment.previousAssigneeId, assigneeId)
        return thread(board, threadId)
    }

    /** Passes the comments of the guest [fromUserId] to the user [toUserId] who signs in, like their boards. */
    fun transfer(fromUserId: UUID, toUserId: UUID) = comments.transfer(fromUserId, toUserId)

    /** Adds the comment, which mentions the participants among [mentions] and answers the users [answered]. */
    private fun add(board: Board, threadId: UUID, authorId: UUID, body: String, mentions: Collection<UUID>, answered: Set<UUID>) {
        val commentId = comments.addComment(threadId, authorId, body, now())
        val mentioned = mentioned(board, mentions)
        comments.replaceMentions(commentId, mentioned)
        notifications.commentAdded(board.boardId, commentId, authorId, mentioned, answered)
    }

    /** Mentions of users who take no part in the board are dropped. */
    private fun mentioned(board: Board, userIds: Collection<UUID>): Set<UUID> =
        comments.participants(board.boardId, board.ownerId, board.linkOpen, userIds.toSet())

    /** Comments added to a board at the same time count each other. */
    private fun checkLimit(board: Board) {
        comments.lockBoard(board.boardId)
        if (comments.countOnBoard(board.boardId) >= limits.commentsPerBoard) {
            metrics.limitReached(Limit.COMMENTS)
            throw CommentLimitReachedException(limits.commentsPerBoard)
        }
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private val Board.boardId: UUID
        get() = checkNotNull(id) { "Persisted board must have an id" }

    private val Board.linkOpen: Boolean
        get() = linkAccess != LinkAccess.NONE

    companion object {
        /** The most people offered for mentions besides the owner. */
        const val PEOPLE_LIMIT = 200
    }
}

/** The thread or the comment is not on the board. */
class CommentNotFoundException : RuntimeException("Comment not found")

/** The user to assign a thread to is not among those who may be mentioned on the board. */
class AssigneeNotParticipantException : RuntimeException("The user takes no part in the board")

/** The user may not do this with the comment. */
class CommentForbiddenException(message: String) : RuntimeException(message)

/** The thread is about an element or about a page, so it has no point to move. */
class ThreadNotAtPointException : RuntimeException("The thread does not stand at a point")

/** The board has as many comments as the [limit] allows. */
class CommentLimitReachedException(val limit: Int) : RuntimeException("The board has $limit comments, the most allowed")
