package io.github.thescarletarrow.codraw.collab

import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.participated
import io.github.thescarletarrow.codraw.user.UserService
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class CollabTokenController(
    private val boards: BoardService,
    private val users: UserService,
    private val tokens: CollabTokenService,
) {

    /** Token to connect to the document of a board that the user owns, is a member of, or whose link lets them in. */
    @PostMapping("/api/boards/{id}/collab-token")
    fun issue(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): CollabToken {
        val board = boards.participated(id, principal.userId).board
        val user = checkNotNull(users.find(principal.userId)) { "Signed-in user ${principal.userId} does not exist" }
        return tokens.issue(user, checkNotNull(board.id))
    }
}
