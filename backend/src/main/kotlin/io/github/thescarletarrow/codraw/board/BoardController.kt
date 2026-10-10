package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.image.ImageQuotaReachedException
import io.github.thescarletarrow.codraw.image.ImageStorageException
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
    private val copies: BoardCopyService,
    private val organization: BoardOrganizationService,
    private val users: UserService,
) {

    @PostMapping
    fun create(
        @Valid @RequestBody request: CreateBoardRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<BoardResponse> {
        val user = currentUser(principal)
        val board = boards.create(request.title.trim(), user.id).toResponse(user, BoardRole.OWNER, null)
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
            // Boards of the workspaces of the user are in their workspaces, not here: no role in a workspace counts.
            val role = board.roleOf(principal.userId, shared.memberRole, null) ?: return@mapNotNull null
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
        return board.toResponse(owner(board), role, boards.workspaceOf(board))
    }

    /** Renames the board or changes what its link or its workspace gives, or any of them. */
    @PatchMapping("/{id}")
    fun update(
        @PathVariable id: String,
        @RequestBody request: UpdateBoardRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): BoardResponse {
        val board = ownBoard(id, principal)
        if (request.title == null && request.linkAccess == null && request.workspaceAccess == null) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Nothing to change")
        }
        if (request.workspaceAccess != null && board.workspaceId == null) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "A personal board has no workspace to give access")
        }
        val title = request.title?.trim()
        if (title != null && title.length !in 1..TITLE_MAX_LENGTH) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Title must have 1 to $TITLE_MAX_LENGTH characters")
        }
        var updated = board
        if (request.linkAccess != null) updated = boards.changeLinkAccess(updated, request.linkAccess)
        if (request.workspaceAccess != null) updated = boards.changeWorkspaceAccess(updated, request.workspaceAccess)
        if (title != null) updated = boards.rename(updated, title)
        return updated.toResponse(owner(board), BoardRole.OWNER, boards.workspaceOf(updated))
    }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        boards.moveToTrash(ownBoard(id, principal))
        return ResponseEntity.noContent().build()
    }

    /**
     * Copies the board for the user, who needs only a role on it: a new board of theirs with its document and copies of
     * its images, see [BoardCopyService.copy].
     */
    @PostMapping("/{id}/copy")
    fun copy(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<BoardResponse> {
        val (original, _) = boards.participated(id, principal.userId)
        val copy = copies.copy(original, principal.userId)
        val response = copy.toResponse(currentUser(principal), BoardRole.OWNER, boards.workspaceOf(copy))
        return ResponseEntity.created(URI.create("/api/boards/${response.id}")).body(response)
    }

    /** Boards in the trash that the user restores: their own, and those of the workspaces they manage. */
    @GetMapping("/trash")
    fun trash(@AuthenticationPrincipal principal: OAuth2User): List<TrashedBoardResponse> =
        boards.trash(principal.userId).map { board ->
            val at = checkNotNull(board.deletedAt)
            TrashedBoardResponse(
                checkNotNull(board.id),
                board.title,
                at,
                at.plus(BoardService.TRASH_RETENTION),
                boards.workspaceOf(board),
            )
        }

    @PostMapping("/trash/{id}/restore")
    fun restore(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): BoardResponse {
        val board = boards.restore(ownTrashedBoard(id, principal))
        return board.toResponse(owner(board), checkNotNull(boards.roleOf(board, principal.userId)), boards.workspaceOf(board))
    }

    @DeleteMapping("/trash/{id}")
    fun purge(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        boards.purgeTrash(ownTrashedBoard(id, principal))
        return ResponseEntity.noContent().build()
    }

    private fun ownTrashedBoard(id: String, principal: OAuth2User): Board {
        val board = BoardIds.parse(id)?.let(boards::deleted)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found in trash")
        if (!boards.managesTrashed(board, principal.userId)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can change the board")
        }
        return board
    }

    @ExceptionHandler
    fun boardLimitReached(exception: BoardLimitReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "The user owns ${exception.limit} boards, the most allowed")
            .apply {
                title = "Board limit reached"
                setProperty("limit", exception.limit)
            }

    @ExceptionHandler
    fun imageQuotaReached(exception: ImageQuotaReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Image quota reached"
            setProperty("limit", exception.limit)
            setProperty("used", exception.used)
        }

    @ExceptionHandler
    fun imageStorageUnavailable(exception: ImageStorageException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, exception.message)

    private fun ownBoard(id: String, principal: OAuth2User): Board = boards.ownedBy(id, principal.userId)

    private fun currentUser(principal: OAuth2User): User =
        checkNotNull(users.find(principal.userId)) { "Signed-in user ${principal.userId} does not exist" }

    private fun owner(board: Board): User = users.ownerOf(board)
}

/** The board is there, but its owner closed its link to others, and the user is not a member. */
fun linkAccessClosed() = ResponseStatusException(HttpStatus.FORBIDDEN, "The owner closed the link to the board")

/** The owner of the [board], who exists as long as the board does. */
fun UserService.ownerOf(board: Board): User = checkNotNull(find(board.ownerId)) { "Owner of board ${board.id} does not exist" }

/** The longest title of a board. */
internal const val TITLE_MAX_LENGTH = 200

data class CreateBoardRequest(
    @field:NotBlank
    @field:Size(max = TITLE_MAX_LENGTH)
    val title: String,
)

data class TrashedBoardResponse(
    val id: UUID,
    val title: String,
    val deletedAt: Instant,
    val expiresAt: Instant,
    /** The workspace that the board belongs to; `null` for a personal board. */
    val workspace: BoardWorkspace?,
)

/** At least one of the fields; a missing field stays as it is. */
data class UpdateBoardRequest(
    /** Checked for length after trimming. */
    val title: String? = null,
    val linkAccess: LinkAccess? = null,
    /** Only for a board of a workspace. */
    val workspaceAccess: WorkspaceAccess? = null,
)

/** The workspace of a board, as the board names it. */
data class BoardWorkspace(
    val id: UUID,
    val name: String,
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
    /** The workspace that the board belongs to; `null` for a personal board. */
    val workspace: BoardWorkspace?,
    /** The project of the workspace that the board is in; `null` for none. */
    val projectId: UUID?,
    /** What the workspace gives its editors and viewers on the board. */
    val workspaceAccess: WorkspaceAccess,
    /** An administrator of the installation closed the link and the live image of the board; its owner opens neither. */
    val sharingBlocked: Boolean,
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

/** The board of the [workspace], `null` for a personal one, as the user with the [role] on it sees it. */
fun Board.toResponse(owner: User, role: BoardRole, workspace: BoardWorkspace?) = BoardResponse(
    id = checkNotNull(id) { "Persisted board must have an id" },
    title = title,
    createdAt = createdAt,
    updatedAt = updatedAt,
    linkAccess = linkAccess,
    owner = BoardOwner(owner.id, owner.name, owner.avatarUrl),
    role = role,
    workspace = workspace,
    projectId = projectId,
    workspaceAccess = workspaceAccess,
    sharingBlocked = sharingBlockedAt != null,
)
