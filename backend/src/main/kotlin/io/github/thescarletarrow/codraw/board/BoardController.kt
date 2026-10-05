package io.github.thescarletarrow.codraw.board

import com.fasterxml.jackson.annotation.JsonValue
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.github.thescarletarrow.codraw.user.userId
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
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
class BoardController(private val boards: BoardService, private val users: UserService) {

    @PostMapping
    fun create(
        @Valid @RequestBody request: CreateBoardRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<BoardResponse> {
        val user = currentUser(principal)
        val board = boards.create(request.title.trim(), user.id).toResponse(user, BoardRole.OWNER)
        return ResponseEntity.created(URI.create("/api/boards/${board.id}")).body(board)
    }

    @GetMapping
    fun list(@AuthenticationPrincipal principal: OAuth2User): List<BoardResponse> {
        val user = currentUser(principal)
        return boards.list(user.id).map { it.toResponse(user, BoardRole.OWNER) }
    }

    /** Boards of other users that the user opened through their links. */
    @GetMapping("/shared")
    fun shared(@AuthenticationPrincipal principal: OAuth2User): List<SharedBoardResponse> =
        boards.visitedBy(principal.userId).map { visited ->
            val board = visited.board
            SharedBoardResponse(
                id = checkNotNull(board.id),
                title = board.title,
                createdAt = board.createdAt,
                updatedAt = board.updatedAt,
                owner = BoardOwner(board.ownerId, visited.ownerName, visited.ownerAvatarUrl),
                role = BoardRole.EDITOR,
                openedAt = visited.visitedAt,
            )
        }

    /** Any board by its id: a link to a board gives access to it. Opening a board of another user is remembered. */
    @GetMapping("/{id}")
    fun get(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): BoardResponse {
        val board = existingBoard(id)
        boards.recordVisit(board, principal.userId)
        return board.toResponse(owner(board), board.roleOf(principal.userId))
    }

    @PatchMapping("/{id}")
    fun update(
        @PathVariable id: String,
        @Valid @RequestBody request: UpdateBoardRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): BoardResponse {
        val board = ownBoard(id, principal)
        val title = request.title!!.trim()
        if (title.length > TITLE_MAX_LENGTH) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Title is too long")
        return boards.rename(board, title).toResponse(owner(board), BoardRole.OWNER)
    }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        boards.delete(ownBoard(id, principal))
        return ResponseEntity.noContent().build()
    }

    private fun existingBoard(id: String): Board =
        BoardIds.parse(id)?.let(boards::find) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found")

    /** The board, which only its owner may change or delete. */
    private fun ownBoard(id: String, principal: OAuth2User): Board {
        val board = existingBoard(id)
        if (board.ownerId != principal.userId) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can change the board")
        }
        return board
    }

    private fun currentUser(principal: OAuth2User): User =
        checkNotNull(users.find(principal.userId)) { "Signed-in user ${principal.userId} does not exist" }

    private fun owner(board: Board): User = checkNotNull(users.find(board.ownerId)) { "Owner of board ${board.id} does not exist" }
}

/** What the user may do on a board. */
enum class BoardRole(@get:JsonValue val value: String) {
    OWNER("owner"),
    EDITOR("editor"),
}

/** The owner has the board; anybody else opened it through its link. */
fun Board.roleOf(userId: UUID): BoardRole = if (ownerId == userId) BoardRole.OWNER else BoardRole.EDITOR

private const val TITLE_MAX_LENGTH = 200

data class CreateBoardRequest(
    @field:NotBlank
    @field:Size(max = TITLE_MAX_LENGTH)
    val title: String,
)

data class UpdateBoardRequest(
    /** Checked for length after trimming. */
    @field:NotBlank
    val title: String? = null,
)

data class BoardOwner(
    val id: UUID,
    val name: String,
    val avatarUrl: String?,
)

data class BoardResponse(
    val id: UUID,
    val title: String,
    val createdAt: Instant,
    val updatedAt: Instant,
    val owner: BoardOwner,
    /** The role of the user who asks. */
    val role: BoardRole,
)

data class SharedBoardResponse(
    val id: UUID,
    val title: String,
    val createdAt: Instant,
    val updatedAt: Instant,
    val owner: BoardOwner,
    val role: BoardRole,
    /** When the user last opened the board. */
    val openedAt: Instant,
)

private fun Board.toResponse(owner: User, role: BoardRole) = BoardResponse(
    id = checkNotNull(id) { "Persisted board must have an id" },
    title = title,
    createdAt = createdAt,
    updatedAt = updatedAt,
    owner = BoardOwner(owner.id, owner.name, owner.avatarUrl),
    role = role,
)
