package io.github.thescarletarrow.codraw.decision

import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.participated
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
import java.net.URI
import java.time.LocalDate
import java.util.UUID

/**
 * Architecture decisions of a board. Everybody whose role lets them open the board reads them; the owner and the editors
 * write them down, change them, link them to elements and delete them, viewers get 403. When the owner closes the link,
 * everybody but the members gets 403 like for the board itself.
 */
@RestController
@RequestMapping("/api/boards/{id}/decisions")
class DecisionController(private val boards: BoardService, private val decisions: DecisionService) {

    /** All decisions of the board, by their numbers. */
    @GetMapping
    fun decisions(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<Decision> =
        decisions.decisions(participatedBoard(id, principal))

    @GetMapping("/{decisionId}")
    fun decision(
        @PathVariable id: String,
        @PathVariable decisionId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): Decision = decisions.decision(participatedBoard(id, principal), parse(decisionId))

    /** Writes down a decision with the next number of the board, or the number of the request, e.g. of a file of MADR. */
    @PostMapping
    fun add(
        @PathVariable id: String,
        @RequestBody request: AddDecisionRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Decision> {
        val board = editedBoard(id, principal)
        request.number?.let { if (it !in 1..NUMBER_MAX) badRequest("A number is from 1 to $NUMBER_MAX") }
        val decision = decisions.add(
            board,
            principal.userId,
            request.number,
            content(request.title, request.status, request.supersededBy, request.decidedOn, request.context, request.options, request.outcome, request.consequences),
            elements(request.elements),
        )
        return ResponseEntity.created(URI.create("/api/boards/${board.id}/decisions/${decision.id}")).body(decision)
    }

    /** Changes what the decision says; its number, author and elements stay. */
    @PutMapping("/{decisionId}")
    fun update(
        @PathVariable id: String,
        @PathVariable decisionId: String,
        @RequestBody request: DecisionRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): Decision = decisions.update(
        editedBoard(id, principal),
        parse(decisionId),
        content(request.title, request.status, request.supersededBy, request.decidedOn, request.context, request.options, request.outcome, request.consequences),
    )

    /** Makes the decision be about exactly the elements of the request. */
    @PutMapping("/{decisionId}/elements")
    fun link(
        @PathVariable id: String,
        @PathVariable decisionId: String,
        @RequestBody request: DecisionElementsRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): Decision = decisions.link(editedBoard(id, principal), parse(decisionId), elements(request.elements))

    /** Deletes the decision with its discussion; decisions it superseded no longer name it. */
    @DeleteMapping("/{decisionId}")
    fun delete(
        @PathVariable id: String,
        @PathVariable decisionId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Void> {
        decisions.delete(editedBoard(id, principal), parse(decisionId))
        return ResponseEntity.noContent().build()
    }

    @ExceptionHandler
    fun notFound(exception: DecisionNotFoundException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.message)

    @ExceptionHandler
    fun numberTaken(exception: DecisionNumberTakenException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Decision number taken"
            setProperty("number", exception.number)
        }

    @ExceptionHandler
    fun invalid(exception: InvalidDecisionException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.message)

    @ExceptionHandler
    fun limitReached(exception: DecisionLimitReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Decision limit reached"
            setProperty("limit", exception.limit)
        }

    /** The board, when the user has a role on it. */
    private fun participatedBoard(id: String, principal: OAuth2User): Board = boards.participated(id, principal.userId).board

    /** The board, when the user edits it; 403 for a viewer. */
    private fun editedBoard(id: String, principal: OAuth2User): Board {
        val (board, role) = boards.participated(id, principal.userId)
        if (!role.edits) throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner and editors write decisions down")
        return board
    }

    private fun parse(id: String): UUID = BoardIds.parse(id) ?: throw DecisionNotFoundException()

    private fun content(
        title: String,
        status: String,
        supersededBy: UUID?,
        decidedOn: LocalDate?,
        context: String,
        options: String,
        outcome: String,
        consequences: String,
    ): DecisionContent {
        val name = title.trim()
        if (name.length !in 1..TITLE_MAX_LENGTH) badRequest("The title must have 1 to $TITLE_MAX_LENGTH characters")
        val known = DecisionStatus.of(status) ?: badRequest("Unknown status; one of ${DecisionStatus.entries.joinToString { it.value }}")
        return DecisionContent(
            title = name,
            status = known,
            supersededBy = supersededBy,
            decidedOn = decidedOn ?: decisions.today(),
            context = section("context", context),
            options = section("options", options),
            outcome = section("outcome", outcome),
            consequences = section("consequences", consequences),
        )
    }

    /** A section of Markdown without the blanks around it. */
    private fun section(name: String, text: String): String {
        val trimmed = text.trim()
        if (trimmed.length > SECTION_MAX_LENGTH) badRequest("The $name must have at most $SECTION_MAX_LENGTH characters")
        return trimmed
    }

    private fun elements(elements: List<DecisionElement>): List<DecisionElement> {
        if (elements.size > ELEMENTS_MAX) badRequest("A decision is about at most $ELEMENTS_MAX elements")
        for (element in elements) {
            if (element.pageId.length !in 1..ID_MAX_LENGTH || element.cellId.length !in 1..ID_MAX_LENGTH) {
                badRequest("pageId and cellId must have 1 to $ID_MAX_LENGTH characters")
            }
        }
        return elements.distinct()
    }

    private fun badRequest(reason: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, reason)

    private companion object {
        const val NUMBER_MAX = 99999
        const val TITLE_MAX_LENGTH = 200
        const val SECTION_MAX_LENGTH = 20000
        const val ELEMENTS_MAX = 100
        const val ID_MAX_LENGTH = 100
    }
}

/** A new decision: what it says, its number when it has one, e.g. from a file of MADR, and the elements it is about. */
data class AddDecisionRequest(
    val number: Int? = null,
    val title: String,
    /** `proposed`, `accepted`, `rejected` or `superseded`. */
    val status: String = DecisionStatus.PROPOSED.value,
    /** The decision of the board that superseded it, for a superseded decision. */
    val supersededBy: UUID? = null,
    /** The day it was decided on; today without one. */
    val decidedOn: LocalDate? = null,
    val context: String = "",
    val options: String = "",
    val outcome: String = "",
    val consequences: String = "",
    val elements: List<DecisionElement> = emptyList(),
)

/** What a decision says, all of it: what the request lacks becomes empty. */
data class DecisionRequest(
    val title: String,
    val status: String,
    val supersededBy: UUID? = null,
    val decidedOn: LocalDate? = null,
    val context: String = "",
    val options: String = "",
    val outcome: String = "",
    val consequences: String = "",
)

data class DecisionElementsRequest(val elements: List<DecisionElement>)
