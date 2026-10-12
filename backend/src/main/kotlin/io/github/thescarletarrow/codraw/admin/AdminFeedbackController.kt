package io.github.thescarletarrow.codraw.admin

import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.feedback.Feedback
import io.github.thescarletarrow.codraw.feedback.FeedbackRepository
import io.github.thescarletarrow.codraw.user.User
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/** What administrators do to the feedback of users: closing it is written to the journal in its own transaction. */
@Service
class AdminFeedbackService(
    private val feedback: FeedbackRepository,
    private val actions: AdminActions,
    private val clock: Clock,
) {

    /** Closes the open feedback [feedbackId]; closing it again changes nothing and writes nothing to the journal. */
    @Transactional
    fun resolve(admin: User, feedbackId: UUID): Feedback {
        val item = feedback.find(feedbackId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Feedback not found")
        val now = now()
        if (item.resolvedAt == null && feedback.resolve(feedbackId, admin, now)) {
            actions.record(admin, AdminActionKind.RESOLVE_FEEDBACK, AdminTargetKind.FEEDBACK, feedbackId, label(item.text), now)
        }
        return checkNotNull(feedback.find(feedbackId))
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private companion object {
        /** The most characters of the text of feedback that the journal names it by. */
        const val LABEL_LENGTH = 80

        /** The beginning of the text on one line: feedback has no title, and its author may be gone. */
        fun label(text: String): String {
            val line = text.replace(Regex("\\s+"), " ").trim()
            return if (line.length <= LABEL_LENGTH) line else line.take(LABEL_LENGTH - 1).trimEnd() + "…"
        }
    }
}

/**
 * The feedback of users in the administration of the installation. The security configuration lets only administrators
 * through to it, see [AdminAuthorizationManager]; every handler takes the administrator again, for the journal.
 */
@RestController
@RequestMapping("${AdminController.PATH}/feedback")
class AdminFeedbackController(
    private val access: AdminAccess,
    private val feedback: FeedbackRepository,
    private val service: AdminFeedbackService,
) {

    /** Open feedback, the newest first, or with `status=resolved` the latest closed. */
    @GetMapping
    fun list(
        @RequestParam(defaultValue = "open") status: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): List<Feedback> {
        access.require(principal)
        val resolved = when (status) {
            "open" -> false
            "resolved" -> true
            else -> throw ResponseStatusException(HttpStatus.BAD_REQUEST, "status is open or resolved")
        }
        return feedback.list(resolved, LIST_LIMIT)
    }

    @PostMapping("/{id}/resolve")
    fun resolve(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): Feedback =
        service.resolve(access.require(principal), uuid(id))

    private fun uuid(id: String): UUID = BoardIds.parse(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Not found")

    private companion object {
        const val LIST_LIMIT = 200
    }
}
