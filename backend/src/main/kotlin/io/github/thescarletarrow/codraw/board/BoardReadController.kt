package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

/**
 * The visit of the user who asks to a board, reported by the pages of the user on the board: when they were on it, and
 * what changed since their previous visit. Anybody with a role on the board has visits, a viewer too.
 */
@RestController
@RequestMapping("/api/boards/{id}/visit")
class BoardReadController(private val boards: BoardService, private val reads: BoardReadService) {

    /** A page of the user opened the board: their visit begins, or goes on, with what changed since the previous one. */
    @PostMapping
    fun start(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ChangesSinceVisit =
        reads.start(boardId(id, principal), principal.userId)

    /** A page of the user is on the board. */
    @PutMapping
    fun see(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        reads.see(boardId(id, principal), principal.userId)
        return ResponseEntity.noContent().build()
    }

    /** A page of the user left the board. */
    @DeleteMapping
    fun leave(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        reads.leave(boardId(id, principal), principal.userId)
        return ResponseEntity.noContent().build()
    }

    /**
     * The state of the version that the current visit compares the board with, to a viewer too: it is the board about as
     * they left it, and the board forgets the visits of those who lose access to it. No other version is given here.
     */
    @GetMapping("/baseline", produces = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
    fun baseline(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ByteArray =
        reads.baselineState(boardId(id, principal), principal.userId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "No version to compare the board with")

    private fun boardId(id: String, principal: OAuth2User): UUID = checkNotNull(boards.participated(id, principal.userId).board.id)
}
