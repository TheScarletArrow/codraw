package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.board.BoardDocumentService
import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.StoredDocument
import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
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

/** Internal API for collab: loads and stores the Yjs document of a board. */
@RestController
@RequestMapping("/internal/boards/{id}/document")
class BoardDocumentController(
    private val documents: BoardDocumentService,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
) {

    @GetMapping
    fun load(@PathVariable id: String): ResponseEntity<ByteArray> {
        val boardId = BoardIds.parse(id) ?: return ResponseEntity.notFound().build()
        return when (val document = documents.load(boardId)) {
            StoredDocument.BoardNotFound -> ResponseEntity.notFound().build()
            StoredDocument.Empty -> ResponseEntity.noContent().build()
            is StoredDocument.State -> ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).body(document.bytes)
        }
    }

    /** Stores the state of the document; a state larger than the limit is refused with 413 and is not read to its end. */
    @PutMapping(consumes = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
    fun store(@PathVariable id: String, body: InputStream): ResponseEntity<Void> {
        val boardId = BoardIds.parse(id) ?: return ResponseEntity.notFound().build()
        val state = body.readAtMost(limits.documentSize)
        if (state == null) {
            metrics.limitReached(Limit.DOCUMENT)
            return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE).build()
        }
        if (!documents.save(boardId, state)) return ResponseEntity.notFound().build()
        metrics.documentStored(state.size)
        return ResponseEntity.noContent().build()
    }
}
