package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardMembers
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.proposal.DraftStore
import io.github.thescarletarrow.codraw.proposal.ProposalService
import io.github.thescarletarrow.codraw.readAtMost
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.io.InputStream
import java.util.UUID

/**
 * Internal API for collab: loads and stores the draft of a proposal of changes, a Yjs document like that of a board, and
 * tells who may edit or view it now.
 */
@RestController
@RequestMapping("/internal/proposals/{id}")
class ProposalDraftController(
    private val proposals: ProposalService,
    private val boards: BoardService,
    private val members: BoardMembers,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
) {

    /** The stored draft; 204 while it is empty. */
    @GetMapping("/document")
    fun load(@PathVariable id: String): ResponseEntity<ByteArray> {
        val draft = BoardIds.parse(id)?.let(proposals::draft) ?: return ResponseEntity.notFound().build()
        return draft.state?.let { ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).body(it) }
            ?: ResponseEntity.noContent().build()
    }

    /**
     * Stores the draft; a state larger than the limit of a board document is refused with 413, and the draft of a closed
     * proposal, which no longer changes, with 409.
     */
    @PutMapping("/document", consumes = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
    fun store(@PathVariable id: String, body: InputStream): ResponseEntity<Void> {
        val proposalId = BoardIds.parse(id) ?: return ResponseEntity.notFound().build()
        val state = body.readAtMost(limits.documentSize)
        if (state == null) {
            metrics.limitReached(Limit.DOCUMENT)
            return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE).build()
        }
        return when (proposals.storeDraft(proposalId, state)) {
            DraftStore.STORED -> ResponseEntity.noContent().build()
            DraftStore.NOT_FOUND -> ResponseEntity.notFound().build()
            DraftStore.CLOSED -> ResponseEntity.status(HttpStatus.CONFLICT).build()
        }
    }

    /**
     * Everything that the access of any user to the draft depends on: its author, whether it is open, and the access to
     * its board, so that collab checks all connections of the draft with one request.
     */
    @GetMapping("/access")
    fun access(@PathVariable id: String): ResponseEntity<DraftAccessResponse> {
        val draft = BoardIds.parse(id)?.let(proposals::draftAccess) ?: return ResponseEntity.notFound().build()
        val board = boards.find(draft.boardId) ?: return ResponseEntity.notFound().build()
        val boardAccess = BoardAccess(board.ownerId, board.linkAccess, members.roles(draft.boardId))
        return ResponseEntity.ok(DraftAccessResponse(draft.authorId, draft.open, boardAccess))
    }
}

/**
 * The author edits the draft of an open proposal while the board gives them a role; whoever edits the board views it;
 * the draft of a closed proposal is for viewing only.
 */
data class DraftAccessResponse(
    val authorId: UUID,
    val open: Boolean,
    val board: BoardAccess,
)
