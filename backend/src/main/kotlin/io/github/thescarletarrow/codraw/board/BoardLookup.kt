package io.github.thescarletarrow.codraw.board

import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

/** The board named by an id from a request path; 404 when there is none. */
fun BoardService.existing(id: String): Board =
    BoardIds.parse(id)?.let(::find) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found")

/** The board, which only its owner may change, delete or see the versions of; 403 for anybody else. */
fun BoardService.ownedBy(id: String, userId: UUID): Board {
    val board = existing(id)
    if (board.ownerId != userId) {
        throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can change the board")
    }
    return board
}
