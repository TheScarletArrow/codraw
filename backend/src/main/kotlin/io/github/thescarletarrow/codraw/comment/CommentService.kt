package io.github.thescarletarrow.codraw.comment

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.LinkAccess
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Comments of the participants of a board. Whoever may open the board reads and writes them, viewers too: comments do
 * not change the diagram. The caller checks that the user has a role on the board.
 */
@Service
class CommentService(
    private val comments: Comments,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    fun threads(board: Board): List<CommentThread> = comments.threads(board.boardId)

    fun thread(board: Board, threadId: UUID): CommentThread = comments.thread(board.boardId, threadId) ?: throw CommentNotFoundException()

    /** Who may be mentioned on the [board]: its owner first, then its members and those who opened it by its link. */
    fun people(board: Board): List<Person> =
        comments.people(board.boardId, board.ownerId, board.linkOpen, PEOPLE_LIMIT)

    /** Starts a thread about the cell [cellId] of the page [pageId], or about the page, with the first comment. */
    @Transactional
    fun start(board: Board, authorId: UUID, pageId: String, cellId: String?, body: String, mentions: Collection<UUID>): CommentThread {
        checkLimit(board)
        val threadId = comments.addThread(board.boardId, pageId, cellId, now())
        add(board, threadId, authorId, body, mentions)
        return thread(board, threadId)
    }

    @Transactional
    fun reply(board: Board, threadId: UUID, authorId: UUID, body: String, mentions: Collection<UUID>): CommentThread {
        checkLimit(board)
        if (!comments.threadExists(board.boardId, threadId)) throw CommentNotFoundException()
        add(board, threadId, authorId, body, mentions)
        return thread(board, threadId)
    }

    /** Changes the text of a comment; only its author may. */
    @Transactional
    fun edit(board: Board, threadId: UUID, commentId: UUID, userId: UUID, body: String, mentions: Collection<UUID>): CommentThread {
        val comment = comments.comment(board.boardId, threadId, commentId) ?: throw CommentNotFoundException()
        if (comment.authorId != userId) throw CommentForbiddenException("Only the author can change the comment")
        comments.edit(commentId, body, now())
        comments.replaceMentions(commentId, mentioned(board, mentions))
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

    /** Marks the thread resolved by the user [userId], or open again; any participant may. */
    @Transactional
    fun resolve(board: Board, threadId: UUID, userId: UUID, resolved: Boolean): CommentThread {
        if (!comments.threadExists(board.boardId, threadId)) throw CommentNotFoundException()
        if (resolved) comments.resolve(threadId, userId, now()) else comments.resolve(threadId, null, null)
        return thread(board, threadId)
    }

    /** Passes the comments of the guest [fromUserId] to the user [toUserId] who signs in, like their boards. */
    fun transfer(fromUserId: UUID, toUserId: UUID) = comments.transfer(fromUserId, toUserId)

    private fun add(board: Board, threadId: UUID, authorId: UUID, body: String, mentions: Collection<UUID>) {
        val commentId = comments.addComment(threadId, authorId, body, now())
        comments.replaceMentions(commentId, mentioned(board, mentions))
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

/** The user may not do this with the comment. */
class CommentForbiddenException(message: String) : RuntimeException(message)

/** The board has as many comments as the [limit] allows. */
class CommentLimitReachedException(val limit: Int) : RuntimeException("The board has $limit comments, the most allowed")
