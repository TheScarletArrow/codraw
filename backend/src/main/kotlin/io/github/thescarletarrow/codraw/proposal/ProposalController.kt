package io.github.thescarletarrow.codraw.proposal

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.Participation
import io.github.thescarletarrow.codraw.board.participated
import io.github.thescarletarrow.codraw.collab.CollabToken
import io.github.thescarletarrow.codraw.collab.CollabTokenService
import io.github.thescarletarrow.codraw.readAtMost
import io.github.thescarletarrow.codraw.user.UserService
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.io.InputStream
import java.net.URI
import java.util.UUID

/**
 * Proposals of changes of a board. Everybody whose role lets them open the board proposes changes, viewers too; the owner
 * and the editors see, accept and decline all proposals of the board, anybody else sees and withdraws their own. Without
 * a role on the board everybody gets 403 like for the board itself; a proposal the user may not see is not found.
 */
@RestController
@RequestMapping("/api/boards/{id}/proposals")
class ProposalController(
    private val boards: BoardService,
    private val proposals: ProposalService,
    private val users: UserService,
    private val tokens: CollabTokenService,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
) {

    /** The proposals of the board that the user sees, newest first. */
    @GetMapping
    fun list(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<Proposal> =
        proposals.list(participation(id, principal), principal.userId)

    @PostMapping
    fun create(
        @PathVariable id: String,
        @RequestBody request: CreateProposalRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Proposal> {
        val board = participation(id, principal).board
        val title = request.title.trim()
        if (title.length !in 1..ProposalService.TITLE_MAX_LENGTH) {
            badRequest("The title must have 1 to ${ProposalService.TITLE_MAX_LENGTH} characters")
        }
        val proposal = proposals.create(board, principal.userId, title, text(request.description, "description"))
        return ResponseEntity.created(URI.create("/api/boards/${board.id}/proposals/${proposal.id}")).body(proposal)
    }

    @GetMapping("/{proposalId}")
    fun get(
        @PathVariable id: String,
        @PathVariable proposalId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): Proposal = proposals.get(participation(id, principal), principal.userId, parse(proposalId))

    /** The board when the proposal was made, as collab stores documents; 204 when it was empty. */
    @GetMapping("/{proposalId}/base", produces = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
    fun base(
        @PathVariable id: String,
        @PathVariable proposalId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<ByteArray> {
        val base = proposals.base(participation(id, principal), principal.userId, parse(proposalId))
        return base.state?.let { ResponseEntity.ok(it) } ?: ResponseEntity.noContent().build()
    }

    /** Token to connect to the draft of the proposal in collab; collab decides whether the user edits it or views it. */
    @PostMapping("/{proposalId}/collab-token")
    fun collabToken(
        @PathVariable id: String,
        @PathVariable proposalId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): CollabToken {
        val proposal = proposals.get(participation(id, principal), principal.userId, parse(proposalId))
        val user = checkNotNull(users.find(principal.userId)) { "Signed-in user ${principal.userId} does not exist" }
        return tokens.issueForProposal(user, proposal.id)
    }

    /**
     * Accepts the proposal: the body is the state of the board that the page of the user merges the proposal into right
     * after the answer, which becomes the version from before the proposal was accepted.
     */
    @PostMapping("/{proposalId}/accept", consumes = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
    fun accept(
        @PathVariable id: String,
        @PathVariable proposalId: String,
        body: InputStream,
        @AuthenticationPrincipal principal: OAuth2User,
    ): Proposal {
        val participation = participation(id, principal)
        val state = body.readAtMost(limits.documentSize)
        if (state == null) metrics.limitReached(Limit.VERSION)
        if (state == null || state.isEmpty()) badRequest("The state must have 1 byte to ${limits.documentSize}")
        return proposals.accept(participation, principal.userId, parse(proposalId), state)
    }

    @PostMapping("/{proposalId}/decline")
    fun decline(
        @PathVariable id: String,
        @PathVariable proposalId: String,
        @RequestBody request: DeclineProposalRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): Proposal {
        val participation = participation(id, principal)
        return proposals.decline(participation, principal.userId, parse(proposalId), text(request.comment, "comment"))
    }

    @PostMapping("/{proposalId}/withdraw")
    fun withdraw(
        @PathVariable id: String,
        @PathVariable proposalId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): Proposal = proposals.withdraw(participation(id, principal), principal.userId, parse(proposalId))

    @ExceptionHandler
    fun notFound(exception: ProposalNotFoundException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.message)

    @ExceptionHandler
    fun forbidden(exception: ProposalForbiddenException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, exception.message)

    @ExceptionHandler
    fun closed(exception: ProposalClosedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply { title = "Proposal closed" }

    @ExceptionHandler
    fun limitReached(exception: ProposalLimitReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Proposal limit reached"
            setProperty("limit", exception.limit)
            setProperty("scope", exception.scope.value)
        }

    private fun participation(id: String, principal: OAuth2User): Participation = boards.participated(id, principal.userId)

    private fun parse(id: String): UUID = BoardIds.parse(id) ?: throw ProposalNotFoundException()

    /** The trimmed text, `null` for none; 400 when it is too long. */
    private fun text(value: String?, name: String): String? {
        val trimmed = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        if (trimmed.length > ProposalService.TEXT_MAX_LENGTH) {
            badRequest("The $name must have at most ${ProposalService.TEXT_MAX_LENGTH} characters")
        }
        return trimmed
    }

    private fun badRequest(reason: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, reason)
}

data class CreateProposalRequest(
    /** Checked for length after trimming. */
    val title: String,
    /** An empty one or `null` is none. */
    val description: String? = null,
)

data class DeclineProposalRequest(
    /** What the author reads about why; an empty one or `null` is none. */
    val comment: String? = null,
)
