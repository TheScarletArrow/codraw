package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.github.thescarletarrow.codraw.user.userId
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
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
class BoardController(
    private val boards: BoardService,
    private val organization: BoardOrganizationService,
    private val users: UserService,
) {

    @PostMapping
    fun create(
        @Valid @RequestBody request: CreateBoardRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<BoardResponse> {
        val user = currentUser(principal)
        val board = boards.create(request.title.trim(), user.id).toResponse(user, BoardRole.OWNER)
        return ResponseEntity.created(URI.create("/api/boards/${board.id}")).body(board)
    }

    /** The boards of the user, most recently changed first, with when they were on each and how they organized it. */
    @GetMapping
    fun list(@AuthenticationPrincipal principal: OAuth2User): List<OwnBoardResponse> {
        val user = currentUser(principal)
        val own = boards.list(user.id)
        val seen = boards.seenAt(user.id, own)
        val organized = organization.of(user.id)
        return own.map { board ->
            val id = checkNotNull(board.id)
            OwnBoardResponse(
                id = id,
                title = board.title,
                createdAt = board.createdAt,
                updatedAt = board.updatedAt,
                linkAccess = board.linkAccess,
                owner = BoardOwner(user.id, user.name, user.avatarUrl),
                role = BoardRole.OWNER,
                openedAt = seen[id],
                tags = organized.tagsOf(id),
                folderId = organized.folderOf(id),
            )
        }
    }

    /**
     * Boards of other users that the user is a member of, or opened through their links and can still open through
     * them, with how the user organized each.
     */
    @GetMapping("/shared")
    fun shared(@AuthenticationPrincipal principal: OAuth2User): List<SharedBoardResponse> {
        val organized = organization.of(principal.userId)
        return boards.sharedWith(principal.userId).mapNotNull { shared ->
            val board = shared.board
            val id = checkNotNull(board.id)
            val role = board.roleOf(principal.userId, shared.memberRole) ?: return@mapNotNull null
            SharedBoardResponse(
                id = id,
                title = board.title,
                createdAt = board.createdAt,
                updatedAt = board.updatedAt,
                linkAccess = board.linkAccess,
                owner = BoardOwner(board.ownerId, shared.ownerName, shared.ownerAvatarUrl),
                role = role,
                openedAt = shared.visitedAt,
                tags = organized.tagsOf(id),
                folderId = organized.folderOf(id),
            )
        }
    }

    /**
     * Any board by its id, as far as the role of the user gives access to it: the owner closes it to all but the
     * members with [LinkAccess.NONE]. Opening a board of another user is remembered.
     */
    @GetMapping("/{id}")
    fun get(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): BoardResponse {
        val (board, role) = boards.participated(id, principal.userId)
        boards.recordVisit(board, principal.userId)
        return board.toResponse(owner(board), role)
    }

    /** Renames the board or changes what its link gives, or both. */
    @PatchMapping("/{id}")
    fun update(
        @PathVariable id: String,
        @RequestBody request: UpdateBoardRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): BoardResponse {
        val board = ownBoard(id, principal)
        if (request.title == null && request.linkAccess == null) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Nothing to change")
        }
        val title = request.title?.trim()
        if (title != null && title.length !in 1..TITLE_MAX_LENGTH) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Title must have 1 to $TITLE_MAX_LENGTH characters")
        }
        var updated = board
        if (request.linkAccess != null) updated = boards.changeLinkAccess(updated, request.linkAccess)
        if (title != null) updated = boards.rename(updated, title)
        return updated.toResponse(owner(board), BoardRole.OWNER)
    }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        boards.delete(ownBoard(id, principal))
        return ResponseEntity.noContent().build()
    }

    @ExceptionHandler
    fun boardLimitReached(exception: BoardLimitReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "The user owns ${exception.limit} boards, the most allowed")
            .apply {
                title = "Board limit reached"
                setProperty("limit", exception.limit)
            }

    private fun ownBoard(id: String, principal: OAuth2User): Board = boards.ownedBy(id, principal.userId)

    private fun currentUser(principal: OAuth2User): User =
        checkNotNull(users.find(principal.userId)) { "Signed-in user ${principal.userId} does not exist" }

    private fun owner(board: Board): User = users.ownerOf(board)
}

/** The board is there, but its owner closed its link to others, and the user is not a member. */
fun linkAccessClosed() = ResponseStatusException(HttpStatus.FORBIDDEN, "The owner closed the link to the board")

/** The owner of the [board], who exists as long as the board does. */
fun UserService.ownerOf(board: Board): User = checkNotNull(find(board.ownerId)) { "Owner of board ${board.id} does not exist" }

private const val TITLE_MAX_LENGTH = 200

data class CreateBoardRequest(
    @field:NotBlank
    @field:Size(max = TITLE_MAX_LENGTH)
    val title: String,
)

/** At least one of the fields; a missing field stays as it is. */
data class UpdateBoardRequest(
    /** Checked for length after trimming. */
    val title: String? = null,
    val linkAccess: LinkAccess? = null,
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
    val linkAccess: LinkAccess,
    val owner: BoardOwner,
    /** The role of the user who asks. */
    val role: BoardRole,
)

/** A board of the user in their list of boards. */
data class OwnBoardResponse(
    val id: UUID,
    val title: String,
    val createdAt: Instant,
    val updatedAt: Instant,
    val linkAccess: LinkAccess,
    val owner: BoardOwner,
    val role: BoardRole,
    /** When the user was last on the board; `null` while they never were. */
    val openedAt: Instant?,
    /** The personal tags of the user on the board. */
    val tags: List<String>,
    /** The personal folder of the user that the board is in; `null` for none. */
    val folderId: UUID?,
)

data class SharedBoardResponse(
    val id: UUID,
    val title: String,
    val createdAt: Instant,
    val updatedAt: Instant,
    val linkAccess: LinkAccess,
    val owner: BoardOwner,
    val role: BoardRole,
    /** When the user last opened the board; `null` for a board they are a member of and never opened. */
    val openedAt: Instant?,
    /** The personal tags of the user on the board. */
    val tags: List<String>,
    /** The personal folder of the user that the board is in; `null` for none. */
    val folderId: UUID?,
)

/** The board as the user with the [role] on it sees it. */
fun Board.toResponse(owner: User, role: BoardRole) = BoardResponse(
    id = checkNotNull(id) { "Persisted board must have an id" },
    title = title,
    createdAt = createdAt,
    updatedAt = updatedAt,
    linkAccess = linkAccess,
    owner = BoardOwner(owner.id, owner.name, owner.avatarUrl),
    role = role,
)
