package io.github.thescarletarrow.codraw.feedback

import io.github.thescarletarrow.codraw.AddressRateLimiter
import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.user.userId
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import java.time.Clock
import java.time.Duration
import java.time.temporal.ChronoUnit

/** Feedback as the app sends it: the browser comes from the headers of the request, not from the app. */
data class FeedbackRequest(
    @field:NotNull
    val kind: FeedbackKind?,
    @field:NotBlank
    @field:Size(max = TEXT_MAX_LENGTH)
    val text: String?,
    /** The path of the page, without its query. */
    @field:Size(max = PAGE_MAX_LENGTH)
    val page: String? = null,
    @field:Size(max = APP_VERSION_MAX_LENGTH)
    val appVersion: String? = null,
)

private const val TEXT_MAX_LENGTH = 4000
private const val PAGE_MAX_LENGTH = 500
private const val APP_VERSION_MAX_LENGTH = 50
private const val USER_AGENT_MAX_LENGTH = 500

/**
 * «Обратная связь»: a user, a guest too, tells the administrators of the installation about a bug, an idea or anything
 * else. The address of the sender is only counted, not kept; the user is kept, so that administrators know whom it came
 * from and the user finds it in the export of their data.
 */
@RestController
class FeedbackController(
    private val feedback: FeedbackRepository,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    private val addresses = AddressRateLimiter(Duration.ofHours(1), { limits.feedbackPerAddressPerHour }, clock)
    private val users = AddressRateLimiter(Duration.ofDays(1), { limits.feedbackPerUserPerDay }, clock)

    /** 204 once the feedback is in the queue; 429 for an address or a user who sent too much of it. */
    @PostMapping(PATH)
    fun send(
        @Valid @RequestBody request: FeedbackRequest,
        @AuthenticationPrincipal principal: OAuth2User,
        httpRequest: HttpServletRequest,
    ): ResponseEntity<*> {
        addresses.acquire(AddressRateLimiter.networkOf(httpRequest.remoteAddr))?.let { wait ->
            return tooMuchFeedback(Limit.FEEDBACK, "Too much feedback from this address", wait)
        }
        users.acquire(principal.userId.toString())?.let { wait ->
            return tooMuchFeedback(Limit.USER_FEEDBACK, "Too much feedback from this user", wait)
        }
        val kind = request.kind!!
        feedback.create(
            userId = principal.userId,
            kind = kind,
            text = request.text!!.trim(),
            // The app sends the path alone; whatever else comes after it stays out, as in reports of errors.
            page = request.page?.substringBefore('?')?.substringBefore('#')?.takeIf { it.isNotBlank() },
            appVersion = request.appVersion?.trim()?.takeIf { it.isNotEmpty() },
            userAgent = httpRequest.getHeader(HttpHeaders.USER_AGENT)?.take(USER_AGENT_MAX_LENGTH)?.takeIf { it.isNotBlank() },
            at = clock.instant().truncatedTo(ChronoUnit.MICROS),
        )
        metrics.feedbackReceived(kind)
        return ResponseEntity.noContent().build<Void>()
    }

    private fun tooMuchFeedback(limit: Limit, detail: String, wait: Duration): ResponseEntity<ProblemDetail> {
        metrics.limitReached(limit)
        val problem = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, detail)
        // Whole seconds, rounded up: the client must not come back before the window ends.
        val seconds = (wait.toMillis() + 999) / 1000
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, seconds.toString()).body(problem)
    }

    companion object {
        const val PATH = "/api/feedback"
    }
}
