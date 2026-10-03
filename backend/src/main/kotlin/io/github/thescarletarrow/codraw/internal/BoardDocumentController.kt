package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.board.BoardDocumentService
import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.StoredDocument
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** Internal API for collab: loads and stores the Yjs document of a board. */
@RestController
@RequestMapping("/internal/boards/{id}/document")
class BoardDocumentController(private val documents: BoardDocumentService) {

    @GetMapping
    fun load(@PathVariable id: String): ResponseEntity<ByteArray> {
        val boardId = BoardIds.parse(id) ?: return ResponseEntity.notFound().build()
        return when (val document = documents.load(boardId)) {
            StoredDocument.BoardNotFound -> ResponseEntity.notFound().build()
            StoredDocument.Empty -> ResponseEntity.noContent().build()
            is StoredDocument.State -> ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).body(document.bytes)
        }
    }

    @PutMapping(consumes = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
    fun store(@PathVariable id: String, @RequestBody state: ByteArray): ResponseEntity<Void> {
        val boardId = BoardIds.parse(id) ?: return ResponseEntity.notFound().build()
        return if (documents.save(boardId, state)) ResponseEntity.noContent().build() else ResponseEntity.notFound().build()
    }
}
