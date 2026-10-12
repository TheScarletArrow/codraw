package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.product.ProductActivity
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Internal API for collab: a board was edited together today, for the statistics of the installation. Collab tells it
 * at most once a day per board, on a day when the document changed and at least two users had connections that may edit
 * it at the same time.
 */
@RestController
class BoardCoEditingController(private val activity: ProductActivity) {

    @PostMapping("/internal/boards/{id}/co-edited")
    fun coEdited(@PathVariable id: String): ResponseEntity<Void> {
        val boardId = BoardIds.parse(id) ?: return ResponseEntity.notFound().build()
        if (!activity.boardCoEdited(boardId)) return ResponseEntity.notFound().build()
        return ResponseEntity.noContent().build()
    }
}
