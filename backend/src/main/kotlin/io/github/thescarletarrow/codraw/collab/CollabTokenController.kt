package io.github.thescarletarrow.codraw.collab

import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.roleOf
import io.github.thescarletarrow.codraw.user.UserService
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
class CollabTokenController(
    private val boards: BoardService,
    private val users: UserService,
    private val tokens: CollabTokenService,
) {

    /** Token to connect to the document of a board that the user may open, with their role on it. */
    @PostMapping("/api/boards/{id}/collab-token")
    fun issue(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): CollabToken {
        val board = BoardIds.parse(id)?.let(boards::find)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found")
        val role = board.roleOf(principal.userId)
            ?: throw ResponseStatusException(HttpStatus.FORBIDDEN, "The owner closed the link to the board")
        val user = checkNotNull(users.find(principal.userId)) { "Signed-in user ${principal.userId} does not exist" }
        return tokens.issue(user, checkNotNull(board.id), role)
    }
}
