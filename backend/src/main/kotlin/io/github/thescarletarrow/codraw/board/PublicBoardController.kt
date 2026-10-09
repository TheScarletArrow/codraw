package io.github.thescarletarrow.codraw.board

import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.context.request.WebRequest
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.util.UUID

/** A board that its link shows to anybody, as a reader without a sign-in sees it. */
data class PublicBoardResponse(val id: UUID, val title: String, val updatedAt: Instant)

/**
 * Boards whose owners show them through their links to anybody without a sign-in ([LinkAccess.PUBLIC]), for viewing
 * only: nothing here creates a guest, records a visit or changes the board. Any other board is not found, so that the
 * address tells nothing about boards closed to others.
 */
@RestController
@RequestMapping(PublicBoardController.PATH)
class PublicBoardController(private val boards: BoardService, private val documents: BoardDocumentService) {

    @GetMapping("/{id}")
    fun get(@PathVariable id: String): PublicBoardResponse {
        val board = publicBoard(id)
        return PublicBoardResponse(checkNotNull(board.id), board.title, board.updatedAt)
    }

    /**
     * The stored state of the document, 204 before the first store. The browser keeps it and asks again with the tag of
     * the store, which gets 304 while the board was not stored since.
     */
    @GetMapping("/{id}/document")
    fun document(@PathVariable id: String, request: WebRequest): ResponseEntity<ByteArray> {
        val boardId = checkNotNull(publicBoard(id).id)
        val storedAt = documents.storedAt(boardId) ?: return ResponseEntity.noContent().build()
        val tag = "\"${storedAt.epochSecond}.${storedAt.nano}\""
        val headers = ResponseEntity.ok().cacheControl(CacheControl.noCache()).eTag(tag)
        if (request.checkNotModified(tag)) return headers.build()
        return when (val document = documents.load(boardId)) {
            is StoredDocument.State -> headers.contentType(MediaType.APPLICATION_OCTET_STREAM).body(document.bytes)
            StoredDocument.Empty -> ResponseEntity.noContent().build()
            StoredDocument.BoardNotFound -> throw notShown()
        }
    }

    private fun publicBoard(id: String): Board = boards.shownWithoutSignIn(id) ?: throw notShown()

    private fun notShown() = ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found, or not shown without a sign-in")

    companion object {
        const val PATH = "/api/public/boards"
    }
}
