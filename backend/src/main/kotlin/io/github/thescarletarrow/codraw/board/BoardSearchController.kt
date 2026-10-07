package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.board.BoardSearchService.Companion.MAX_QUERY_LENGTH
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

/** Search in the texts of the boards that the user who asks can open; the list of boards finds titles by itself. */
@RestController
class BoardSearchController(private val search: BoardSearchService) {

    /**
     * Boards whose text has the query [q], lower or upper case and «ё» or «е» alike, with the line of the text around the
     * first match; at most [BoardSearchService.LIMIT].
     */
    @GetMapping("/api/boards/search")
    fun search(@RequestParam q: String, @AuthenticationPrincipal principal: OAuth2User): List<BoardTextMatch> {
        if (q.trim().length > MAX_QUERY_LENGTH) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "A query must have at most $MAX_QUERY_LENGTH characters")
        }
        return search.search(principal.userId, q)
    }
}
