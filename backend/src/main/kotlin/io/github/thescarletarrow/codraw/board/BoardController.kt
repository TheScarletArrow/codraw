package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.user.userId
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.net.URI
import java.time.Instant
import java.util.UUID

@RestController
@RequestMapping("/api/boards")
class BoardController(private val boards: BoardService) {

    @PostMapping
    fun create(
        @Valid @RequestBody request: CreateBoardRequest,
        @AuthenticationPrincipal user: OAuth2User,
    ): ResponseEntity<BoardResponse> {
        val board = boards.create(request.title.trim(), user.userId).toResponse()
        return ResponseEntity.created(URI.create("/api/boards/${board.id}")).body(board)
    }

    @GetMapping
    fun list(@AuthenticationPrincipal user: OAuth2User): List<BoardResponse> = boards.list(user.userId).map { it.toResponse() }

    @GetMapping("/{id}")
    fun get(@PathVariable id: String): BoardResponse =
        BoardIds.parse(id)?.let(boards::find)?.toResponse()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found")
}

data class CreateBoardRequest(
    @field:NotBlank
    @field:Size(max = 200)
    val title: String,
)

data class BoardResponse(
    val id: UUID,
    val title: String,
    val createdAt: Instant,
    val updatedAt: Instant,
)

private fun Board.toResponse() = BoardResponse(
    id = checkNotNull(id) { "Persisted board must have an id" },
    title = title,
    createdAt = createdAt,
    updatedAt = updatedAt,
)
