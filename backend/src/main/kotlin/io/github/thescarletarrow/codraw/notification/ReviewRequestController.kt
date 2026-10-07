package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.participated
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

/**
 * Requests of participants to the owner of a board to review an element they marked «Нужно ревью». The status itself is in
 * the board document, which the page of the participant changes through collab; this only notifies the owner. Whoever
 * edits the board asks; a viewer gets 403, and without a role on the board everybody gets 403 like for the board itself.
 */
@RestController
class ReviewRequestController(
    private val boards: BoardService,
    private val notifications: NotificationService,
    private val metrics: CodrawMetrics,
) {

    /**
     * Asks the owner to review the element: 204 whether the owner gets a notification or, e.g. having got one about the
     * element a short while ago, not; 429 when the user asked too often in the last hour.
     */
    @PostMapping("/api/boards/{id}/review-requests")
    fun request(
        @PathVariable id: String,
        @RequestBody request: ReviewRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Void> {
        val (board, role) = boards.participated(id, principal.userId)
        if (!role.edits) throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only those who edit the board ask for reviews")
        checkId("pageId", request.pageId)
        checkId("cellId", request.cellId)
        notifications.reviewRequested(board, principal.userId, request.pageId, request.cellId)
        return ResponseEntity.noContent().build()
    }

    @ExceptionHandler
    fun limitReached(exception: ReviewRequestLimitException): ProblemDetail {
        metrics.limitReached(Limit.REVIEW_REQUESTS)
        return ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, exception.message).apply {
            title = "Review request limit reached"
            setProperty("limit", exception.limit)
        }
    }

    private fun checkId(name: String, value: String) {
        if (value.length !in 1..ID_MAX_LENGTH) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "$name must have 1 to $ID_MAX_LENGTH characters")
        }
    }

    private companion object {
        /** The longest id of a page or an element that the database keeps, as for threads of comments. */
        const val ID_MAX_LENGTH = 100
    }
}

/** The element of a page of the board document to review. */
data class ReviewRequest(val pageId: String, val cellId: String)
