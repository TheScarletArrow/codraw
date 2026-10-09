package io.github.thescarletarrow.codraw.comment

import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.participated
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.net.URI
import java.util.UUID

/**
 * Threads of comments on a board. Everybody whose role lets them open the board reads and writes them, reacts to them
 * and assigns them, viewers too; when the owner closes the link, everybody but the members gets 403 like for the board
 * itself.
 */
@RestController
@RequestMapping("/api/boards/{id}")
class CommentController(private val boards: BoardService, private val comments: CommentService) {

    /** All threads of the board, oldest first. */
    @GetMapping("/threads")
    fun threads(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<CommentThread> =
        comments.threads(participatedBoard(id, principal))

    @GetMapping("/threads/{threadId}")
    fun thread(
        @PathVariable id: String,
        @PathVariable threadId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): CommentThread = comments.thread(participatedBoard(id, principal), parse(threadId))

    @PostMapping("/threads")
    fun start(
        @PathVariable id: String,
        @RequestBody request: StartThreadRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<CommentThread> {
        val board = participatedBoard(id, principal)
        checkCellId("pageId", request.pageId)
        request.cellId?.let { checkCellId("cellId", it) }
        request.point?.let(::checkPoint)
        if (request.cellId != null && request.point != null) badRequest("A thread is about an element or at a point, not both")
        if (request.decisionId != null && (request.cellId != null || request.point != null)) {
            badRequest("A thread about a decision is about no element and stands at no point")
        }
        val thread = comments.start(
            board,
            principal.userId,
            request.pageId,
            request.cellId,
            request.point,
            text(request.body),
            mentions(request.mentions),
            request.decisionId,
        )
        return ResponseEntity.created(URI.create("/api/boards/${board.id}/threads/${thread.id}")).body(thread)
    }

    /** Answers in the thread; returns the whole thread. */
    @PostMapping("/threads/{threadId}/comments")
    fun reply(
        @PathVariable id: String,
        @PathVariable threadId: String,
        @RequestBody request: CommentRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<CommentThread> {
        val board = participatedBoard(id, principal)
        val thread = comments.reply(board, parse(threadId), principal.userId, text(request.body), mentions(request.mentions))
        return ResponseEntity.status(HttpStatus.CREATED).body(thread)
    }

    /** Marks the thread resolved or open again, or moves a thread that stands at a point; returns the whole thread. */
    @PatchMapping("/threads/{threadId}")
    fun change(
        @PathVariable id: String,
        @PathVariable threadId: String,
        @RequestBody request: ChangeThreadRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): CommentThread {
        val board = participatedBoard(id, principal)
        if (request.resolved == null && request.point == null) badRequest("Nothing to change: no resolved and no point")
        request.point?.let(::checkPoint)
        return comments.change(board, parse(threadId), principal.userId, request.resolved, request.point)
    }

    @PatchMapping("/threads/{threadId}/comments/{commentId}")
    fun edit(
        @PathVariable id: String,
        @PathVariable threadId: String,
        @PathVariable commentId: String,
        @RequestBody request: CommentRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): CommentThread {
        val board = participatedBoard(id, principal)
        return comments.edit(board, parse(threadId), parse(commentId), principal.userId, text(request.body), mentions(request.mentions))
    }

    /** Deletes the comment; the first comment of a thread takes the whole thread with it. */
    @DeleteMapping("/threads/{threadId}/comments/{commentId}")
    fun delete(
        @PathVariable id: String,
        @PathVariable threadId: String,
        @PathVariable commentId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Void> {
        comments.delete(participatedBoard(id, principal), parse(threadId), parse(commentId), principal.userId)
        return ResponseEntity.noContent().build()
    }

    /** Puts the reaction of the user on the comment; putting it again changes nothing. Returns the whole thread. */
    @PutMapping("/threads/{threadId}/comments/{commentId}/reactions/{reaction}")
    fun addReaction(
        @PathVariable id: String,
        @PathVariable threadId: String,
        @PathVariable commentId: String,
        @PathVariable reaction: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): CommentThread {
        val board = participatedBoard(id, principal)
        return comments.addReaction(board, parse(threadId), parse(commentId), principal.userId, reaction(reaction))
    }

    /** Takes the reaction of the user away from the comment, if it is there. Returns the whole thread. */
    @DeleteMapping("/threads/{threadId}/comments/{commentId}/reactions/{reaction}")
    fun removeReaction(
        @PathVariable id: String,
        @PathVariable threadId: String,
        @PathVariable commentId: String,
        @PathVariable reaction: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): CommentThread {
        val board = participatedBoard(id, principal)
        return comments.removeReaction(board, parse(threadId), parse(commentId), principal.userId, reaction(reaction))
    }

    /** Makes a participant whom comments may mention the assignee of the thread; returns the whole thread. */
    @PutMapping("/threads/{threadId}/assignee")
    fun assign(
        @PathVariable id: String,
        @PathVariable threadId: String,
        @RequestBody request: AssigneeRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): CommentThread = comments.assign(participatedBoard(id, principal), parse(threadId), principal.userId, request.userId)

    /** Leaves the thread without an assignee; returns the whole thread. */
    @DeleteMapping("/threads/{threadId}/assignee")
    fun unassign(
        @PathVariable id: String,
        @PathVariable threadId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): CommentThread = comments.assign(participatedBoard(id, principal), parse(threadId), principal.userId, null)

    /** Who may be mentioned in comments: the owner first, then the members and those who opened the board. */
    @GetMapping("/people")
    fun people(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<Person> =
        comments.people(participatedBoard(id, principal))

    @ExceptionHandler
    fun notFound(exception: CommentNotFoundException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.message)

    @ExceptionHandler
    fun assigneeNotFound(exception: AssigneeNotParticipantException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.message)

    @ExceptionHandler
    fun forbidden(exception: CommentForbiddenException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, exception.message)

    @ExceptionHandler
    fun notAtPoint(exception: ThreadNotAtPointException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message)

    @ExceptionHandler
    fun limitReached(exception: CommentLimitReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Comment limit reached"
            setProperty("limit", exception.limit)
        }

    /** The board, when the user has a role on it. */
    private fun participatedBoard(id: String, principal: OAuth2User): Board = boards.participated(id, principal.userId).board

    private fun parse(id: String): UUID = BoardIds.parse(id) ?: throw CommentNotFoundException()

    private fun checkCellId(name: String, value: String) {
        if (value.length !in 1..ID_MAX_LENGTH) badRequest("$name must have 1 to $ID_MAX_LENGTH characters")
    }

    /** A point on the page, as far as the schema keeps it; NaN and the infinities are out of range too. */
    private fun checkPoint(point: ThreadPoint) {
        if (point.x !in -POINT_MAX..POINT_MAX || point.y !in -POINT_MAX..POINT_MAX) {
            badRequest("A point has coordinates from ${-POINT_MAX} to $POINT_MAX")
        }
    }

    /** The text without the blanks around it. */
    private fun text(body: String): String {
        val text = body.trim()
        if (text.length !in 1..BODY_MAX_LENGTH) badRequest("The comment must have 1 to $BODY_MAX_LENGTH characters")
        return text
    }

    private fun mentions(mentions: List<UUID>): List<UUID> {
        if (mentions.size > MENTIONS_MAX) badRequest("A comment mentions at most $MENTIONS_MAX people")
        return mentions
    }

    private fun reaction(value: String): Reaction = Reaction.of(value)
        ?: badRequest("Unknown reaction; one of ${Reaction.entries.joinToString { it.value }}")

    private fun badRequest(reason: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, reason)

    private companion object {
        const val ID_MAX_LENGTH = 100
        const val BODY_MAX_LENGTH = 4000
        const val MENTIONS_MAX = 50
        const val POINT_MAX = 1_000_000.0
    }
}

data class StartThreadRequest(
    val pageId: String,
    /** The element the thread is about; none for a thread at a point or about the page. */
    val cellId: String? = null,
    /** The point of the page the thread stands at; none for a thread about an element or about the page. */
    val point: ThreadPoint? = null,
    /** The decision of the board the thread discusses; none for a thread about the diagram. */
    val decisionId: UUID? = null,
    val body: String,
    /** Users the comment mentions; those who cannot open the board are dropped. */
    val mentions: List<UUID> = emptyList(),
)

data class CommentRequest(
    val body: String,
    val mentions: List<UUID> = emptyList(),
)

/** The participant to assign a thread to. */
data class AssigneeRequest(val userId: UUID)

/** What changes in a thread: whether it is resolved, where it stands; what is not set stays. */
data class ChangeThreadRequest(
    val resolved: Boolean? = null,
    val point: ThreadPoint? = null,
)
