package io.github.thescarletarrow.codraw.issue

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController

/**
 * The webhook of issues of GitHub: GitHub posts events here without a session and signs them with the secret of the
 * webhook. 404 when the installation takes no events, 401 for a request without the right signature, 204 otherwise,
 * also for events that change nothing, so that GitHub does not repeat them.
 */
@RestController
class GitHubWebhookController(private val webhook: GitHubWebhookService) {

    @PostMapping(PATH)
    fun event(
        @RequestHeader("X-GitHub-Event", required = false) event: String?,
        @RequestHeader("X-Hub-Signature-256", required = false) signature: String?,
        @RequestBody(required = false) body: ByteArray?,
    ): ResponseEntity<Void> {
        if (!webhook.enabled) return ResponseEntity.notFound().build()
        val payload = body ?: ByteArray(0)
        if (!webhook.verify(payload, signature)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()
        webhook.handle(event, payload)
        return ResponseEntity.noContent().build()
    }

    @ExceptionHandler
    fun invalid(exception: InvalidEventException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.message)

    companion object {
        const val PATH = "/api/integrations/github/webhook"
    }
}
