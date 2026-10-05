package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.LinkAccess
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/** Internal API for collab: who may edit or view the document of a board now, to update open connections. */
@RestController
class BoardAccessController(private val boards: BoardService) {

    @GetMapping("/internal/boards/{id}/access")
    fun access(@PathVariable id: String): ResponseEntity<BoardAccess> {
        val board = BoardIds.parse(id)?.let(boards::find) ?: return ResponseEntity.notFound().build()
        return ResponseEntity.ok(BoardAccess(board.ownerId, board.linkAccess))
    }
}

/** The owner always edits the board; anybody else gets what its link gives. */
data class BoardAccess(
    val ownerId: UUID,
    val linkAccess: LinkAccess,
)
