package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

/**
 * The settings of notifications outside of CoDraw of the signed-in user: their email address and chat, what goes to
 * them, and the boards they muted. A guest gets 403, a channel that the installation does not send through 404.
 */
@RestController
class NotificationSettingsController(
    private val settings: NotificationSettingsService,
    private val metrics: CodrawMetrics,
) {

    @GetMapping(PATH)
    fun settings(@AuthenticationPrincipal principal: OAuth2User): NotificationSettings = settings.settings(principal.userId)

    /** Sets the email address and what goes to it; a new address gets a letter that confirms it. */
    @PutMapping("$PATH/email")
    fun saveEmail(@RequestBody request: EmailChannelRequest, @AuthenticationPrincipal principal: OAuth2User): EmailChannelView =
        settings.saveEmail(principal.userId, request.address, request.enabled, request.events)

    /** Sends the letter that confirms the address again, with a new link. */
    @PostMapping("$PATH/email/resend")
    fun resend(@AuthenticationPrincipal principal: OAuth2User): EmailChannelView = settings.resendConfirmation(principal.userId)

    /** Confirms the address with the token of the link of the letter; 400 for a token that confirms nothing of the user. */
    @PostMapping("$PATH/email/confirm")
    fun confirm(@RequestBody request: ConfirmEmailRequest, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        settings.confirmEmail(principal.userId, request.token)
        return ResponseEntity.noContent().build()
    }

    /** Sets the webhook of a chat and what goes to it; without `url` the saved webhook stays. */
    @PutMapping("$PATH/webhook")
    fun saveWebhook(@RequestBody request: WebhookChannelRequest, @AuthenticationPrincipal principal: OAuth2User): WebhookChannelView =
        settings.saveWebhook(principal.userId, request.url, request.enabled, request.events)

    /** Posts a test message to the webhook: 204, or 502 with the `reason` why it did not go. */
    @PostMapping("$PATH/webhook/test")
    fun testWebhook(@AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        settings.testWebhook(principal.userId)
        return ResponseEntity.noContent().build()
    }

    @DeleteMapping("$PATH/{kind}")
    fun delete(@PathVariable kind: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        val channel = ChannelKind.entries.firstOrNull { it.value == kind } ?: throw ChannelNotFoundException()
        settings.delete(principal.userId, channel)
        return ResponseEntity.noContent().build()
    }

    /** Stops the notifications of the board from going to the channels of the user; needs a role on the board. */
    @PutMapping(MUTE_PATH)
    fun mute(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        settings.mute(principal.userId, id)
        return ResponseEntity.noContent().build()
    }

    /** Lets the notifications of the board go to the channels of the user again; repeating it changes nothing. */
    @DeleteMapping(MUTE_PATH)
    fun unmute(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        BoardIds.parse(id)?.let { settings.unmute(principal.userId, it) }
        return ResponseEntity.noContent().build()
    }

    @ExceptionHandler
    fun guest(exception: GuestNotAllowedException): ProblemDetail = problem(HttpStatus.FORBIDDEN, exception, "guest")

    @ExceptionHandler
    fun unavailable(exception: ChannelUnavailableException): ProblemDetail =
        problem(HttpStatus.NOT_FOUND, exception, "channel-unavailable")

    @ExceptionHandler
    fun notFound(exception: ChannelNotFoundException): ProblemDetail = problem(HttpStatus.NOT_FOUND, exception, "no-channel")

    @ExceptionHandler
    fun invalidEmail(exception: InvalidEmailException): ProblemDetail =
        problem(HttpStatus.BAD_REQUEST, exception, "invalid-address")

    @ExceptionHandler
    fun invalidToken(exception: InvalidTokenException): ProblemDetail = problem(HttpStatus.BAD_REQUEST, exception, "invalid-token")

    @ExceptionHandler
    fun invalidWebhook(exception: InvalidWebhookUrlException): ProblemDetail =
        problem(HttpStatus.BAD_REQUEST, exception, exception.problem.reason)

    /** The test message did not go: the webhook refused it or did not answer. */
    @ExceptionHandler
    fun notDelivered(exception: DeliveryException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, "The webhook did not take the message").apply {
            setProperty("reason", exception.error.value)
        }

    @ExceptionHandler
    fun limitReached(exception: ConfirmationLimitException): ResponseEntity<ProblemDetail> {
        metrics.limitReached(Limit.CONFIRMATION_EMAILS)
        // Whole seconds, rounded up: the client must not come back before the window ends.
        val seconds = (exception.wait.toMillis() + 999) / 1000
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .header(HttpHeaders.RETRY_AFTER, seconds.toString())
            .body(problem(HttpStatus.TOO_MANY_REQUESTS, exception, "confirmation-limit"))
    }

    private fun problem(status: HttpStatus, exception: RuntimeException, reason: String): ProblemDetail =
        ProblemDetail.forStatusAndDetail(status, exception.message).apply { setProperty("reason", reason) }

    companion object {
        const val PATH = "/api/notification-settings"
        const val MUTE_PATH = "/api/boards/{id}/notification-mute"
    }
}

data class EmailChannelRequest(
    val address: String,
    val enabled: Boolean = true,
    val events: Set<NotificationEvent> = NotificationEvent.entries.toSet(),
)

data class WebhookChannelRequest(
    /** A new address of the webhook; `null` keeps the saved one. */
    val url: String? = null,
    val enabled: Boolean = true,
    val events: Set<NotificationEvent> = NotificationEvent.entries.toSet(),
)

data class ConfirmEmailRequest(val token: String)
