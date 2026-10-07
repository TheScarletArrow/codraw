package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.board.BoardDocumentRepository
import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.readAtMost
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.util.unit.DataSize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.io.InputStream
import java.util.UUID

/**
 * Internal API for collab: the text of the document of a board that search finds the board by, which collab extracts
 * from the document, as the backend cannot read it.
 */
@RestController
class BoardSearchTextController(private val documents: BoardDocumentRepository) {

    /**
     * Stores the text of the stored document of the board, UTF-8 in the body. With `If-None-Match: *` it stores the text
     * only while the document has none and answers 412 otherwise, so that a text computed from an older state does not
     * replace a newer one. 404 when the board has no stored document; 413 for a text longer than [MAX_LENGTH], which is
     * not read to its end.
     */
    @PutMapping("/internal/boards/{id}/search-text", consumes = [MediaType.TEXT_PLAIN_VALUE])
    fun store(
        @PathVariable id: String,
        @RequestHeader(HttpHeaders.IF_NONE_MATCH, required = false) ifNoneMatch: String?,
        body: InputStream,
    ): ResponseEntity<Void> {
        val boardId = BoardIds.parse(id) ?: return ResponseEntity.notFound().build()
        val text = body.readAtMost(MAX_BYTES)?.toString(Charsets.UTF_8)?.takeIf { it.length <= MAX_LENGTH }
            ?: return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE).build()
        val onlyIfMissing = ifNoneMatch?.trim() == "*"
        if (documents.storeSearchText(boardId, text, onlyIfMissing)) return ResponseEntity.noContent().build()
        return if (onlyIfMissing && documents.exists(boardId)) {
            ResponseEntity.status(HttpStatus.PRECONDITION_FAILED).build()
        } else {
            ResponseEntity.notFound().build()
        }
    }

    /** Boards with a stored document without a text, by id after [after]: collab sends their texts. */
    @GetMapping("/internal/boards/without-search-text")
    fun withoutSearchText(
        @RequestParam(required = false) after: String?,
        @RequestParam(defaultValue = "$DEFAULT_PAGE") limit: Int,
    ): List<UUID> = documents.withoutSearchText(after?.let(BoardIds::parse), limit.coerceIn(1, MAX_PAGE))

    companion object {
        /** The longest text of a board, in characters (UTF-16 units, as collab counts them). */
        const val MAX_LENGTH = 100_000

        /** A character of the text takes at most 3 bytes of UTF-8, a pair of surrogates 4. */
        val MAX_BYTES: DataSize = DataSize.ofBytes(3L * MAX_LENGTH)

        private const val DEFAULT_PAGE = 100
        private const val MAX_PAGE = 500
    }
}
