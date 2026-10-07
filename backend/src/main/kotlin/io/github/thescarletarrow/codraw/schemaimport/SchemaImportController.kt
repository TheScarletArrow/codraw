package io.github.thescarletarrow.codraw.schemaimport

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.SchemaImportResult
import io.github.thescarletarrow.codraw.user.UserService
import io.github.thescarletarrow.codraw.user.guest
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.Duration

/**
 * The schema of a live PostgreSQL database for «Импорт SQL», when the administrator allowed hosts of databases: 404
 * otherwise. Users who signed in through a provider only, not guests, and as many tries in an hour as the limit allows.
 */
@RestController
@RequestMapping(SchemaImportController.PATH)
class SchemaImportController(
    private val imports: SchemaImportService,
    private val users: UserService,
    private val limiter: SchemaImportLimiter,
    private val metrics: CodrawMetrics,
) {

    /** Whether the user may import, and how many tables of a schema an import reads. */
    @GetMapping
    fun info(@AuthenticationPrincipal principal: OAuth2User): SchemaImportInfo {
        checkAllowed(principal)
        return imports.info
    }

    @PostMapping
    fun import(@RequestBody request: SchemaImportRequest, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<*> {
        checkAllowed(principal)
        limiter.acquire(principal.userId)?.let { wait -> return tooManyImports(wait) }
        return ResponseEntity.ok(imports.import(request, principal.userId))
    }

    private fun checkAllowed(principal: OAuth2User) {
        if (!imports.enabled) throw ResponseStatusException(HttpStatus.NOT_FOUND)
        if (users.find(principal.userId)?.guest != false) throw SignInRequiredException()
    }

    private fun tooManyImports(wait: Duration): ResponseEntity<ProblemDetail> {
        metrics.limitReached(Limit.SCHEMA_IMPORTS)
        val problem = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, "Too many imports of schemas by this user")
        // Whole seconds, rounded up: the client must not come back before the window ends.
        val seconds = (wait.toMillis() + 999) / 1000
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, seconds.toString()).body(problem)
    }

    @ExceptionHandler
    fun signInRequired(exception: SignInRequiredException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, exception.message).apply {
            title = "Sign-in required"
            setProperty("reason", "sign-in-required")
        }

    /** A category without details: what went wrong in the network or the database stays in the database. */
    @ExceptionHandler
    fun failed(exception: SchemaImportException): ProblemDetail {
        val status = if (exception.result == SchemaImportResult.HOST_NOT_ALLOWED) HttpStatus.FORBIDDEN else HttpStatus.UNPROCESSABLE_CONTENT
        return ProblemDetail.forStatusAndDetail(status, DETAILS.getValue(exception.result)).apply {
            title = "Schema import failed"
            setProperty("reason", exception.result.tag)
            exception.limit?.let { setProperty("limit", it) }
        }
    }

    @ExceptionHandler
    fun invalid(exception: InvalidSchemaImportRequestException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.message)

    /**
     * A body that is not a request: answered here, so that the default handler does not log the message of the parser,
     * which may quote the body.
     */
    @ExceptionHandler
    fun unreadable(exception: HttpMessageNotReadableException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "The body is not a connection")

    companion object {
        const val PATH = "/api/schema-import"

        private val DETAILS = mapOf(
            SchemaImportResult.HOST_NOT_ALLOWED to "The administrator did not allow this host",
            SchemaImportResult.CONNECTION_FAILED to "Could not connect to a PostgreSQL server",
            SchemaImportResult.AUTHENTICATION_FAILED to "The server refused the database, the user or the password",
            SchemaImportResult.SCHEMA_NOT_FOUND to "The database has no such schema",
            SchemaImportResult.TIMEOUT to "The database did not answer in time",
            SchemaImportResult.TOO_LARGE to "The schema is larger than an import reads",
            SchemaImportResult.UNSUPPORTED_SERVER to "The server is older than PostgreSQL 12",
        )
    }
}

class SignInRequiredException : RuntimeException("Sign in through GitHub or Google to import schemas of databases")
