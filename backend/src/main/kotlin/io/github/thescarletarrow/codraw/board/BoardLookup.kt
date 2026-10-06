package io.github.thescarletarrow.codraw.board

import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

/** The board named by an id from a request path; 404 when there is none. */
fun BoardService.existing(id: String): Board =
    BoardIds.parse(id)?.let(::find) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found")

/** The board, which only its owner may change, delete, share with members or give away; 403 for anybody else. */
fun BoardService.ownedBy(id: String, userId: UUID): Board {
    val board = existing(id)
    if (board.ownerId != userId) {
        throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can change the board")
    }
    return board
}

/** A board and the role on it of the user who asks. */
data class Participation(val board: Board, val role: BoardRole)

/** The board with the role of the user [userId] on it; 403 when they have none, e.g. its owner closed its link. */
fun BoardService.participated(id: String, userId: UUID): Participation {
    val board = existing(id)
    val role = roleOf(board, userId) ?: throw linkAccessClosed()
    return Participation(board, role)
}

/** The board whose versions the user [userId] sees and saves; 403 when their role does not let them. */
fun BoardService.versionsManagedBy(id: String, userId: UUID): Board {
    val (board, role) = participated(id, userId)
    if (!role.managesVersions) {
        throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner and editors see the versions of the board")
    }
    return board
}
