package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardMembers
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.LinkAccess
import io.github.thescarletarrow.codraw.board.MemberRole
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/** Internal API for collab: who may edit or view the document of a board now, to update open connections. */
@RestController
class BoardAccessController(private val boards: BoardService, private val members: BoardMembers) {

    /**
     * Everything that the role of any user on the board depends on, so that collab checks all connections of a document
     * with one request; the members of a board are limited.
     */
    @GetMapping("/internal/boards/{id}/access")
    fun access(@PathVariable id: String): ResponseEntity<BoardAccess> {
        val board = BoardIds.parse(id)?.let(boards::find) ?: return ResponseEntity.notFound().build()
        return ResponseEntity.ok(BoardAccess(board.ownerId, board.linkAccess, members.roles(checkNotNull(board.id))))
    }
}

/** The owner always edits the board; anybody else gets the higher of their role as a member and what its link gives. */
data class BoardAccess(
    val ownerId: UUID,
    val linkAccess: LinkAccess,
    /** The roles of the members by their ids. */
    val members: Map<UUID, MemberRole>,
)
