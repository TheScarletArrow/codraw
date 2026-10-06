package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

/** The notifications of the signed-in user, a guest too; nobody sees or reads the notifications of another. */
@RestController
@RequestMapping("/api/notifications")
class NotificationController(private val notifications: NotificationService) {

    /** A page of the notifications, newest first; `before` is the `next` of the previous page. */
    @GetMapping
    fun page(
        @RequestParam(required = false) before: String?,
        @AuthenticationPrincipal principal: OAuth2User,
    ): NotificationPage {
        val cursor = before?.let { BoardIds.parse(it) ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Bad cursor") }
        return notifications.page(principal.userId, cursor)
    }

    /** How many notifications the user has not read; the header of the app asks for it from time to time. */
    @GetMapping("/unread-count")
    fun unreadCount(@AuthenticationPrincipal principal: OAuth2User) = UnreadCount(notifications.unreadCount(principal.userId))

    /** Marks the notification read; repeating it changes nothing. */
    @PostMapping("/{id}/read")
    fun read(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        notifications.markRead(principal.userId, parse(id))
        return ResponseEntity.noContent().build()
    }

    /** Marks all notifications of the user read, those on pages not loaded too. */
    @PostMapping("/read-all")
    fun readAll(@AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        notifications.markAllRead(principal.userId)
        return ResponseEntity.noContent().build()
    }

    @ExceptionHandler
    fun notFound(exception: NotificationNotFoundException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.message)

    private fun parse(id: String): UUID = BoardIds.parse(id) ?: throw NotificationNotFoundException()
}

data class UnreadCount(val count: Int)
