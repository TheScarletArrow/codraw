package io.github.thescarletarrow.codraw.clienterror

import com.fasterxml.jackson.annotation.JsonValue
import io.github.thescarletarrow.codraw.AddressRateLimiter
import io.github.thescarletarrow.codraw.ClientErrorKind
import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.user.userId
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size
import org.slf4j.LoggerFactory
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.stereotype.Component
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import java.time.Clock
import java.time.Duration

/** The kind of a report as the frontend writes it; an unknown kind makes the report unreadable, which is 400. */
enum class ReportedKind(@get:JsonValue val value: String, val kind: ClientErrorKind) {
    ERROR("error", ClientErrorKind.ERROR),
    UNHANDLED_REJECTION("unhandledrejection", ClientErrorKind.UNHANDLED_REJECTION),
    RENDER("render", ClientErrorKind.RENDER),
}

/** A report of an error in a browser: what happened, where in the code, and on which page, without its address query. */
data class ClientErrorReport(
    @field:NotNull
    val kind: ReportedKind?,
    @field:NotBlank
    @field:Size(max = 1000)
    val message: String?,
    @field:Size(max = 8000)
    val stack: String? = null,
    @field:Size(max = 500)
    val path: String? = null,
)

/** The reports a network address may send, in windows of a minute. */
@Component
class ClientErrorLimiter(limits: LimitProperties, clock: Clock) {
    private val limiter = AddressRateLimiter(Duration.ofMinutes(1), { limits.clientErrorsPerAddressPerMinute }, clock)

    fun acquire(address: String): Duration? = limiter.acquire(address)
}

/**
 * Takes reports of errors in browsers, also without a sign-in, since the login page breaks too. A report goes to the
 * log as a warning with its fields as key-value pairs, which the structured log of Spring Boot writes as fields of
 * its line, and is counted by kind.
 */
@RestController
class ClientErrorController(private val limiter: ClientErrorLimiter, private val metrics: CodrawMetrics) {

    private val log = LoggerFactory.getLogger(javaClass)

    @PostMapping(PATH)
    fun report(
        @Valid @RequestBody report: ClientErrorReport,
        authentication: Authentication?,
        request: HttpServletRequest,
    ): ResponseEntity<*> {
        limiter.acquire(request.remoteAddr)?.let { wait -> return tooManyReports(wait) }
        val kind = report.kind!!.kind
        metrics.clientError(kind)
        val fields = mapOf(
            "client.error.kind" to kind.tag,
            "error.message" to report.message,
            "error.stack_trace" to report.stack,
            "url.path" to report.path,
            "user_agent.original" to request.getHeader(HttpHeaders.USER_AGENT),
            "user.id" to (authentication?.principal as? OAuth2User)?.userId?.toString(),
        )
        // Fields without a value stay out of the line of the log.
        fields.entries
            .filter { it.value != null }
            .fold(log.atWarn()) { event, (key, value) -> event.addKeyValue(key, value) }
            .log("Error in a browser on {}: {}", report.path ?: "an unknown page", report.message)
        return ResponseEntity.noContent().build<Void>()
    }

    private fun tooManyReports(wait: Duration): ResponseEntity<ProblemDetail> {
        metrics.limitReached(Limit.CLIENT_ERRORS)
        val problem = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, "Too many error reports from this address")
        // Whole seconds, rounded up: the client must not come back before the window ends.
        val seconds = (wait.toMillis() + 999) / 1000
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .header(HttpHeaders.RETRY_AFTER, seconds.toString())
            .body(problem)
    }

    companion object {
        const val PATH = "/api/client-errors"
    }
}
