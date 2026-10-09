package io.github.thescarletarrow.codraw.board

import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

/** The board named by an id from a request path; 404 when there is none. */
fun BoardService.existing(id: String): Board =
    BoardIds.parse(id)?.let(::find) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found")

/**
 * The board, which only those with the role [BoardRole.OWNER] on it may change, delete, share with members or give
 * away: its owner, and on a board of a workspace those who manage the workspace too; 403 for anybody else.
 */
fun BoardService.ownedBy(id: String, userId: UUID): Board {
    val board = existing(id)
    if (board.ownerId != userId && roleOf(board, userId) != BoardRole.OWNER) {
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

/**
 * The board in the list of the user [userId], which they organize with tags and folders, see [BoardService.isListed];
 * 403 for a board that is not, e.g. one they never opened or whose owner closed its link.
 */
fun BoardService.listedBy(id: String, userId: UUID): Board {
    val board = existing(id)
    if (!isListed(board, userId)) {
        throw ResponseStatusException(HttpStatus.FORBIDDEN, "The board is not in the list of the user")
    }
    return board
}

/**
 * The board whose versions the user [userId] sees, saves, names and restores, see [BoardRole.managesVersions]; 403 when
 * their role does not let them.
 */
fun BoardService.versionsManagedBy(id: String, userId: UUID): Board {
    val (board, role) = participated(id, userId)
    if (!role.managesVersions) {
        throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner and editors see the versions of the board")
    }
    return board
}
