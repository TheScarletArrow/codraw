package io.github.thescarletarrow.codraw.comment

import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.existing
import io.github.thescarletarrow.codraw.board.linkAccessClosed
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
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.net.URI
import java.util.UUID

/**
 * Threads of comments on a board. Everybody whose role lets them open the board reads and writes them, viewers too;
 * when the owner closes the link, the others get 403 like for the board itself.
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
        val thread = comments.start(board, principal.userId, request.pageId, request.cellId, text(request.body), mentions(request.mentions))
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

    /** Marks the thread resolved or open again. */
    @PatchMapping("/threads/{threadId}")
    fun resolve(
        @PathVariable id: String,
        @PathVariable threadId: String,
        @RequestBody request: ResolveThreadRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): CommentThread = comments.resolve(participatedBoard(id, principal), parse(threadId), principal.userId, request.resolved)

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

    /** Who may be mentioned in comments: the owner first, then those who opened the board through its link. */
    @GetMapping("/people")
    fun people(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<Person> =
        comments.people(participatedBoard(id, principal))

    @ExceptionHandler
    fun notFound(exception: CommentNotFoundException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.message)

    @ExceptionHandler
    fun forbidden(exception: CommentForbiddenException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, exception.message)

    @ExceptionHandler
    fun limitReached(exception: CommentLimitReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Comment limit reached"
            setProperty("limit", exception.limit)
        }

    /** The board, when the user has a role on it. */
    private fun participatedBoard(id: String, principal: OAuth2User): Board {
        val board = boards.existing(id)
        board.roleOf(principal.userId) ?: throw linkAccessClosed()
        return board
    }

    private fun parse(id: String): UUID = BoardIds.parse(id) ?: throw CommentNotFoundException()

    private fun checkCellId(name: String, value: String) {
        if (value.length !in 1..ID_MAX_LENGTH) badRequest("$name must have 1 to $ID_MAX_LENGTH characters")
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

    private fun badRequest(reason: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, reason)

    private companion object {
        const val ID_MAX_LENGTH = 100
        const val BODY_MAX_LENGTH = 4000
        const val MENTIONS_MAX = 50
    }
}

data class StartThreadRequest(
    val pageId: String,
    /** The element the thread is about; none for a thread about the page. */
    val cellId: String? = null,
    val body: String,
    /** Users the comment mentions; those who cannot open the board are dropped. */
    val mentions: List<UUID> = emptyList(),
)

data class CommentRequest(
    val body: String,
    val mentions: List<UUID> = emptyList(),
)

data class ResolveThreadRequest(val resolved: Boolean)
