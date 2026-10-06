package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.user.userId
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
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

/**
 * Requests for access to a board. Anybody signed in, a guest too, asks for a role on a board they know the link to and
 * sees or cancels their own request; only the owner sees the requests of the board and answers them.
 */
@RestController
@RequestMapping("/api/boards/{id}")
class AccessRequestController(private val boards: BoardService, private val requests: AccessRequestService) {

    /** The request of the user for access to the board; 204 when they have none waiting for an answer. */
    @GetMapping("/access-request")
    fun own(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<AccessRequest> {
        val request = requests.own(boards.existing(id), principal.userId) ?: return ResponseEntity.noContent().build()
        return ResponseEntity.ok(request)
    }

    /** Asks the owner for a role on the board, in place of an earlier request of the user. */
    @PutMapping("/access-request")
    fun request(
        @PathVariable id: String,
        @RequestBody body: AccessRequestBody,
        @AuthenticationPrincipal principal: OAuth2User,
    ): AccessRequest {
        val board = boards.existing(id)
        return requests.request(checkNotNull(board.id), principal.userId, body.role, message(body.message))
    }

    /** The user no longer asks for access; repeating it, e.g. after the owner answered, changes nothing. */
    @DeleteMapping("/access-request")
    fun cancel(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        requests.cancel(boards.existing(id), principal.userId)
        return ResponseEntity.noContent().build()
    }

    /** The requests for access to the board that wait for an answer, oldest first. */
    @GetMapping("/access-requests")
    fun pending(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<AccessRequest> =
        requests.pending(boards.ownedBy(id, principal.userId))

    /** Gives the user of the request a role, which makes them a member of the board; the request is answered. */
    @PostMapping("/access-requests/{requestId}/grant")
    fun grant(
        @PathVariable id: String,
        @PathVariable requestId: String,
        @RequestBody body: MemberRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): Participant = requests.grant(boards.ownedBy(id, principal.userId), parse(requestId), body.role)

    /** Declines the request; its user may ask again. */
    @DeleteMapping("/access-requests/{requestId}")
    fun decline(
        @PathVariable id: String,
        @PathVariable requestId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Void> {
        requests.decline(boards.ownedBy(id, principal.userId), parse(requestId))
        return ResponseEntity.noContent().build()
    }

    @ExceptionHandler
    fun notFound(exception: AccessRequestNotFoundException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.message)

    /** The role of the user on the board tells the page that it may just open the board. */
    @ExceptionHandler
    fun alreadyGiven(exception: AccessAlreadyGivenException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Access already given"
            setProperty("role", exception.role)
        }

    @ExceptionHandler
    fun limitReached(exception: AccessRequestLimitReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Access request limit reached"
            setProperty("limit", exception.limit)
        }

    @ExceptionHandler
    fun memberLimitReached(exception: MemberLimitReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Member limit reached"
            setProperty("limit", exception.limit)
        }

    private fun parse(id: String): UUID = BoardIds.parse(id) ?: throw AccessRequestNotFoundException()

    /** The message without the blanks around it; `null` when nothing is left. */
    private fun message(message: String?): String? {
        val text = message?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        if (text.length > MESSAGE_MAX_LENGTH) {
            throw ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "The message must have at most $MESSAGE_MAX_LENGTH characters",
            )
        }
        return text
    }

    private companion object {
        const val MESSAGE_MAX_LENGTH = 500
    }
}

data class AccessRequestBody(
    /** The role the user asks for. */
    val role: MemberRole,
    /** What the user tells the owner; checked for length after trimming. */
    val message: String? = null,
)
