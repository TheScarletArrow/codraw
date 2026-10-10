package io.github.thescarletarrow.codraw.account

import com.fasterxml.jackson.annotation.JsonValue
import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardLimitReachedException
import io.github.thescarletarrow.codraw.board.BoardOwnerChangedException
import io.github.thescarletarrow.codraw.user.userId
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import java.time.Duration
import java.util.UUID

/**
 * The account of the signed-in user, guests too: what deleting it would do, deleting it, and the export of their data
 * for «Скачать мои данные».
 */
@RestController
class AccountController(
    private val deletion: AccountDeletionService,
    private val export: AccountExportService,
    private val metrics: CodrawMetrics,
) {

    @GetMapping("/api/me/deletion")
    fun preview(@AuthenticationPrincipal principal: OAuth2User): DeletionPreview = deletion.preview(principal.userId)

    /**
     * Deletes the account of the user with the decisions about their boards with others, ends their sessions, this one
     * too, and clears its cookie.
     */
    @DeleteMapping("/api/me")
    fun delete(
        @RequestBody(required = false) body: DeleteAccountRequest?,
        @AuthenticationPrincipal principal: OAuth2User,
        request: HttpServletRequest,
    ): ResponseEntity<Void> {
        val decisions = body?.boards.orEmpty().associate { decision ->
            decision.boardId to when (decision.action) {
                DecisionAction.TRANSFER -> BoardDecision.Transfer(
                    decision.newOwnerId ?: throw InvalidDecisionException("A transfer of board ${decision.boardId} names no new owner"),
                )
                DecisionAction.DELETE -> BoardDecision.Delete
            }
        }
        deletion.delete(principal.userId, decisions)
        // The session is gone from the store already; this clears the security context and the cookie of the request.
        request.logout()
        return ResponseEntity.noContent().build()
    }

    /** Everything the tables keep of the user, as many times a day as the limit allows. */
    @PostMapping("/api/me/export", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun export(@AuthenticationPrincipal principal: OAuth2User): ResponseEntity<*> {
        export.acquire(principal.userId)?.let { wait -> return tooManyExports(wait) }
        val data = export.export(principal.userId) ?: return ResponseEntity.notFound().build<Void>()
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(data)
    }

    /** The document of a board of the user for the export; 204 while it has none, 404 for a board of somebody else. */
    @GetMapping("/api/me/export/boards/{id}", produces = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
    fun document(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<ByteArray> {
        val boardId = BoardIds.parse(id) ?: return ResponseEntity.notFound().build()
        val state = export.document(principal.userId, boardId) ?: return ResponseEntity.notFound().build()
        return if (state.isEmpty()) ResponseEntity.noContent().build() else ResponseEntity.ok(state)
    }

    private fun tooManyExports(wait: Duration): ResponseEntity<ProblemDetail> {
        metrics.limitReached(Limit.ACCOUNT_EXPORTS)
        val problem = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, "Too many exports of data by this user")
        // Whole seconds, rounded up: the client must not come back before the window ends.
        val seconds = (wait.toMillis() + 999) / 1000
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, seconds.toString()).body(problem)
    }

    @ExceptionHandler
    fun decisionsRequired(exception: DecisionsRequiredException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Decisions required"
            setProperty("reason", "decisions-required")
            setProperty("boards", exception.boards)
        }

    @ExceptionHandler
    fun soleWorkspaceOwner(exception: SoleWorkspaceOwnerException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Only owner of workspaces"
            setProperty("reason", "sole-workspace-owner")
            setProperty("workspaces", exception.workspaces)
        }

    @ExceptionHandler
    fun invalidDecision(exception: InvalidDecisionException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.message)

    /** The member who would become the owner of a board owns as many boards as the limit allows. */
    @ExceptionHandler
    fun boardLimitReached(exception: BoardLimitReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "The new owner owns ${exception.limit} boards, the most allowed").apply {
            title = "Board limit reached"
            setProperty("limit", exception.limit)
        }

    @ExceptionHandler
    fun ownerChanged(exception: BoardOwnerChangedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message)
}

data class DeleteAccountRequest(val boards: List<BoardDecisionRequest> = emptyList())

/** A decision about a board with others: [DecisionAction.TRANSFER] names the member who gets it. */
data class BoardDecisionRequest(val boardId: UUID, val action: DecisionAction, val newOwnerId: UUID? = null)

enum class DecisionAction(@get:JsonValue val value: String) {
    TRANSFER("transfer"),
    DELETE("delete"),
}
