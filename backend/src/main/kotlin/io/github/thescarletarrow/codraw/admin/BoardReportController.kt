package io.github.thescarletarrow.codraw.admin

import io.github.thescarletarrow.codraw.AddressRateLimiter
import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.PublicBoardController
import io.github.thescarletarrow.codraw.board.shownWithoutSignIn
import io.github.thescarletarrow.codraw.user.userId
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.Size
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.Clock
import java.time.Duration
import java.time.temporal.ChronoUnit

data class BoardReportRequest(
    val reason: ReportReason,
    @field:Size(max = MESSAGE_MAX_LENGTH)
    val message: String = "",
)

private const val MESSAGE_MAX_LENGTH = 1000

/**
 * Reports of readers of boards that their links show to anybody: the reports go to the queue of the administrators of
 * the installation. Open without a sign-in, like the board itself; the address of the sender is only counted, not kept.
 */
@RestController
class BoardReportController(
    private val boards: BoardService,
    private val reports: BoardReports,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    private val limiter = AddressRateLimiter(Duration.ofHours(1), { limits.reportsPerAddressPerHour }, clock)

    /**
     * 204 once the report is in the queue, and also when the board has as many open reports as the limit allows: it is
     * in the queue already. 404 for a board not shown without a sign-in, 429 for an address that sent too many.
     */
    @PostMapping(PATH)
    fun report(
        @PathVariable id: String,
        @Valid @RequestBody request: BoardReportRequest,
        @AuthenticationPrincipal principal: OAuth2User?,
        httpRequest: HttpServletRequest,
    ): ResponseEntity<*> {
        val board = boards.shownWithoutSignIn(id)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found, or not shown without a sign-in")
        limiter.acquire(httpRequest.remoteAddr)?.let { wait -> return tooManyReports(wait) }
        val boardId = checkNotNull(board.id)
        if (reports.countOpen(boardId) < limits.reportsPerBoard) {
            reports.create(boardId, request.reason, request.message.trim(), principal?.userId, clock.instant().truncatedTo(ChronoUnit.MICROS))
        } else {
            metrics.limitReached(Limit.BOARD_REPORTS)
        }
        return ResponseEntity.noContent().build<Void>()
    }

    private fun tooManyReports(wait: Duration): ResponseEntity<ProblemDetail> {
        metrics.limitReached(Limit.REPORTS)
        val problem = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, "Too many reports from this address")
        // Whole seconds, rounded up: the client must not come back before the window ends.
        val seconds = (wait.toMillis() + 999) / 1000
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, seconds.toString()).body(problem)
    }

    companion object {
        const val PATH = "${PublicBoardController.PATH}/{id}/reports"
    }
}
