package io.github.thescarletarrow.codraw.issue

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

/**
 * The answers of [IssueTrackerController] and [IssueLinkController] to what went wrong, each with the `reason` that the
 * client tells the user by: the tracker answers both of them alike.
 */
@RestControllerAdvice(assignableTypes = [IssueTrackerController::class, IssueLinkController::class])
class IssueProblems {

    @ExceptionHandler
    fun guest(exception: GuestNotAllowedException) = problem(HttpStatus.FORBIDDEN, exception, "guest")

    @ExceptionHandler
    fun off(exception: TrackerOffException) = problem(HttpStatus.NOT_FOUND, exception, "tracker-off")

    @ExceptionHandler
    fun notConnected(exception: NotConnectedException) = problem(HttpStatus.CONFLICT, exception, "not-connected")

    /** The token that the user connected with no longer works: they have to enter another one. */
    @ExceptionHandler
    fun tokenRejected(exception: TokenRejectedException) = problem(HttpStatus.CONFLICT, exception, "token-rejected")

    /** The token that the user enters does not work. */
    @ExceptionHandler
    fun invalidToken(exception: InvalidTokenException) = problem(HttpStatus.BAD_REQUEST, exception, "invalid-token")

    @ExceptionHandler
    fun notFound(exception: TrackerNotFoundException) = problem(HttpStatus.NOT_FOUND, exception, "not-found")

    @ExceptionHandler
    fun gone(exception: IssueGoneException) = problem(HttpStatus.GONE, exception, "issue-deleted")

    @ExceptionHandler
    fun notAnIssue(exception: NotAnIssueException) = problem(HttpStatus.BAD_REQUEST, exception, "not-an-issue")

    @ExceptionHandler
    fun trackerForbidden(exception: TrackerForbiddenException) = problem(HttpStatus.CONFLICT, exception, "tracker-forbidden")

    @ExceptionHandler
    fun trackerRejected(exception: TrackerRejectedException) = problem(HttpStatus.BAD_REQUEST, exception, "tracker-rejected")

    @ExceptionHandler
    fun unavailable(exception: TrackerUnavailableException) =
        problem(HttpStatus.BAD_GATEWAY, "The tracker did not answer", "tracker-unavailable")

    @ExceptionHandler
    fun noLink(exception: IssueLinkNotFoundException) = problem(HttpStatus.NOT_FOUND, exception, "no-link")

    @ExceptionHandler
    fun noThread(exception: ThreadNotFoundException) = problem(HttpStatus.NOT_FOUND, exception, "no-thread")

    @ExceptionHandler
    fun forbidden(exception: IssueLinkForbiddenException) = problem(HttpStatus.FORBIDDEN, exception, "forbidden")

    @ExceptionHandler
    fun inProgress(exception: CreationInProgressException) = problem(HttpStatus.CONFLICT, exception, "creation-in-progress")

    @ExceptionHandler
    fun limitReached(exception: IssueLinkLimitReachedException): ProblemDetail =
        problem(HttpStatus.CONFLICT, exception, "limit").apply {
            title = "Issue link limit reached"
            setProperty("limit", exception.limit)
        }

    private fun problem(status: HttpStatus, exception: RuntimeException, reason: String): ProblemDetail =
        problem(status, exception.message, reason)

    private fun problem(status: HttpStatus, detail: String?, reason: String): ProblemDetail =
        ProblemDetail.forStatusAndDetail(status, detail).apply { setProperty("reason", reason) }
}
