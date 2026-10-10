package io.github.thescarletarrow.codraw.workspace

import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardLimitReachedException
import io.github.thescarletarrow.codraw.board.BoardOwner
import io.github.thescarletarrow.codraw.board.BoardOwnerChangedException
import io.github.thescarletarrow.codraw.board.BoardResponse
import io.github.thescarletarrow.codraw.board.BoardRole
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.LinkAccess
import io.github.thescarletarrow.codraw.board.WorkspaceAccess
import io.github.thescarletarrow.codraw.board.existing
import io.github.thescarletarrow.codraw.board.ownerOf
import io.github.thescarletarrow.codraw.board.toResponse
import io.github.thescarletarrow.codraw.user.UserService
import io.github.thescarletarrow.codraw.user.userId
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
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.net.URI
import java.time.Instant
import java.util.UUID

/**
 * Team workspaces of the user who asks: their members, invitations, projects and boards, and moving boards into and out
 * of them. A workspace that the user is not a member of is not found; what they may change depends on their role in it.
 */
@RestController
class WorkspaceController(
    private val workspaces: WorkspaceService,
    private val workspaceBoards: WorkspaceBoardService,
    private val boards: BoardService,
    private val users: UserService,
) {

    @GetMapping(WORKSPACES)
    fun list(@AuthenticationPrincipal principal: OAuth2User): List<WorkspaceResponse> =
        workspaces.list(principal.userId).map { it.toResponse() }

    @PostMapping(WORKSPACES)
    fun create(
        @RequestBody request: WorkspaceRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<WorkspaceResponse> {
        val workspace = workspaces.create(principal.userId, name(request.name, WorkspaceService.NAME_MAX_LENGTH)).toResponse()
        return ResponseEntity.created(URI.create("$WORKSPACES/${workspace.id}")).body(workspace)
    }

    @GetMapping(WORKSPACE)
    fun get(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): WorkspaceResponse =
        workspaces.summary(workspaceId(id), principal.userId).toResponse()

    @PatchMapping(WORKSPACE)
    fun rename(
        @PathVariable id: String,
        @RequestBody request: WorkspaceRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): WorkspaceResponse =
        workspaces.rename(workspaceId(id), principal.userId, name(request.name, WorkspaceService.NAME_MAX_LENGTH)).toResponse()

    /** Deletes the workspace; its boards go to the trash of the owner who deletes it. */
    @DeleteMapping(WORKSPACE)
    fun delete(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        workspaces.delete(workspaceId(id), principal.userId)
        return ResponseEntity.noContent().build()
    }

    @GetMapping("$WORKSPACE/members")
    fun members(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<WorkspaceMember> =
        workspaces.members(workspaceId(id), principal.userId)

    @PutMapping("$WORKSPACE/members/{userId}")
    fun changeRole(
        @PathVariable id: String,
        @PathVariable userId: String,
        @RequestBody request: WorkspaceRoleRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): WorkspaceMember = workspaces.changeRole(workspaceId(id), principal.userId, memberId(userId), role(request.role))

    /** Takes a member out of the workspace, or lets the user leave it with their own id. */
    @DeleteMapping("$WORKSPACE/members/{userId}")
    fun removeMember(
        @PathVariable id: String,
        @PathVariable userId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Void> {
        workspaces.removeMember(workspaceId(id), principal.userId, memberId(userId))
        return ResponseEntity.noContent().build()
    }

    @GetMapping("$WORKSPACE/invites")
    fun invites(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<WorkspaceInviteResponse> =
        workspaces.invites(workspaceId(id), principal.userId).map { it.toResponse() }

    @PostMapping("$WORKSPACE/invites")
    fun invite(
        @PathVariable id: String,
        @RequestBody request: WorkspaceRoleRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<WorkspaceInviteResponse> {
        val invite = workspaces.invite(workspaceId(id), principal.userId, role(request.role)).toResponse()
        return ResponseEntity.created(URI.create("$WORKSPACES/$id/invites/${invite.id}")).body(invite)
    }

    @DeleteMapping("$WORKSPACE/invites/{inviteId}")
    fun revoke(
        @PathVariable id: String,
        @PathVariable inviteId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Void> {
        val invite = BoardIds.parse(inviteId) ?: throw WorkspaceInviteNotFoundException()
        workspaces.revoke(workspaceId(id), principal.userId, invite)
        return ResponseEntity.noContent().build()
    }

    /** A user who signed in through a provider accepts an invitation and sees the workspace with their role. */
    @PostMapping("$INVITES/{token:[A-Za-z0-9_-]{22}}/accept")
    fun accept(@PathVariable token: String, @AuthenticationPrincipal principal: OAuth2User): WorkspaceResponse =
        workspaces.accept(token, principal.userId).toResponse()

    @GetMapping("$WORKSPACE/projects")
    fun projects(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<WorkspaceProject> =
        workspaces.projects(workspaceId(id), principal.userId)

    @PostMapping("$WORKSPACE/projects")
    fun createProject(
        @PathVariable id: String,
        @RequestBody request: WorkspaceRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<WorkspaceProject> {
        val project = workspaces.createProject(
            workspaceId(id),
            principal.userId,
            name(request.name, WorkspaceService.PROJECT_NAME_MAX_LENGTH),
        )
        return ResponseEntity.created(URI.create("$WORKSPACES/$id/projects/${project.id}")).body(project)
    }

    @PatchMapping("$WORKSPACE/projects/{projectId}")
    fun renameProject(
        @PathVariable id: String,
        @PathVariable projectId: String,
        @RequestBody request: WorkspaceRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): WorkspaceProject = workspaces.renameProject(
        workspaceId(id),
        principal.userId,
        projectId(projectId),
        name(request.name, WorkspaceService.PROJECT_NAME_MAX_LENGTH),
    )

    /** Deletes the project; its boards stay in the workspace, in no project. */
    @DeleteMapping("$WORKSPACE/projects/{projectId}")
    fun deleteProject(
        @PathVariable id: String,
        @PathVariable projectId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Void> {
        workspaces.deleteProject(workspaceId(id), principal.userId, projectId(projectId))
        return ResponseEntity.noContent().build()
    }

    /** The boards of the workspace that the user has a role on, the latest changed first. */
    @GetMapping("$WORKSPACE/boards")
    fun boards(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<WorkspaceBoardResponse> =
        workspaceBoards.list(workspaceId(id), principal.userId).map { it.toResponse() }

    @PostMapping("$WORKSPACE/boards")
    fun createBoard(
        @PathVariable id: String,
        @RequestBody request: WorkspaceBoardRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<BoardResponse> {
        val title = request.title?.trim().orEmpty()
        if (title.length !in 1..TITLE_MAX_LENGTH) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Title must have 1 to $TITLE_MAX_LENGTH characters")
        }
        val board = workspaceBoards.create(workspaceId(id), principal.userId, title, request.projectId)
        val response = board.toResponse(users.ownerOf(board), BoardRole.OWNER, boards.workspaceOf(board))
        return ResponseEntity.created(URI.create("/api/boards/${response.id}")).body(response)
    }

    /**
     * Moves a board into a workspace, into another project of its workspace, or with `"workspaceId": null` out of its
     * workspace into the personal boards of the user.
     */
    @PutMapping("/api/boards/{id}/workspace")
    fun move(
        @PathVariable id: String,
        @RequestBody request: BoardPlaceRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): BoardResponse {
        val board = workspaceBoards.move(boards.existing(id), principal.userId, request.workspaceId, request.projectId)
        val role = boards.roleOf(board, principal.userId)
            ?: throw ResponseStatusException(HttpStatus.FORBIDDEN, "The board gives the user no role")
        return board.toResponse(users.ownerOf(board), role, boards.workspaceOf(board))
    }

    @ExceptionHandler
    fun notFound(exception: WorkspaceNotFoundException): ProblemDetail = problem(HttpStatus.NOT_FOUND, "Workspace not found", exception)

    @ExceptionHandler
    fun memberNotFound(exception: WorkspaceMemberNotFoundException): ProblemDetail =
        problem(HttpStatus.NOT_FOUND, "Member not found", exception)

    @ExceptionHandler
    fun inviteNotFound(exception: WorkspaceInviteNotFoundException): ProblemDetail =
        problem(HttpStatus.NOT_FOUND, "Invitation not found", exception)

    @ExceptionHandler
    fun projectNotFound(exception: ProjectNotFoundException): ProblemDetail =
        problem(HttpStatus.NOT_FOUND, "Project not found", exception)

    @ExceptionHandler
    fun forbidden(exception: WorkspaceForbiddenException): ProblemDetail = problem(HttpStatus.FORBIDDEN, "Forbidden", exception)

    @ExceptionHandler
    fun accountRequired(exception: AccountRequiredException): ProblemDetail =
        problem(HttpStatus.FORBIDDEN, "Account required", exception)

    @ExceptionHandler
    fun invalidInviteRole(exception: InvalidInviteRoleException): ProblemDetail =
        problem(HttpStatus.BAD_REQUEST, "Invalid role", exception)

    @ExceptionHandler
    fun lastOwner(exception: LastOwnerException): ProblemDetail = problem(HttpStatus.CONFLICT, "Last owner", exception)

    @ExceptionHandler
    fun projectNameTaken(exception: ProjectNameTakenException): ProblemDetail =
        problem(HttpStatus.CONFLICT, "Project name taken", exception)

    @ExceptionHandler
    fun limitReached(exception: WorkspaceLimitException): ProblemDetail =
        problem(HttpStatus.CONFLICT, "Limit reached", exception).apply {
            setProperty("limit", exception.limit)
            setProperty("scope", exception.kind.tag)
        }

    /** The workspace or, when a board leaves one, the user has as many boards as the limit allows. */
    @ExceptionHandler
    fun boardLimitReached(exception: BoardLimitReachedException): ProblemDetail =
        problem(HttpStatus.CONFLICT, "Board limit reached", exception).apply { setProperty("limit", exception.limit) }

    @ExceptionHandler
    fun nothingToMove(exception: NothingToMoveException): ProblemDetail = problem(HttpStatus.BAD_REQUEST, "Nothing to move", exception)

    @ExceptionHandler
    fun otherWorkspace(exception: BoardInOtherWorkspaceException): ProblemDetail =
        problem(HttpStatus.CONFLICT, "Board in another workspace", exception)

    @ExceptionHandler
    fun ownerChanged(exception: BoardOwnerChangedException): ProblemDetail =
        problem(HttpStatus.CONFLICT, "Board changed", exception)

    private fun problem(status: HttpStatus, title: String, exception: Exception): ProblemDetail =
        ProblemDetail.forStatusAndDetail(status, exception.message).apply { this.title = title }

    /** An id that is not a UUID names no workspace, like one that the user is not a member of. */
    private fun workspaceId(id: String): UUID = BoardIds.parse(id) ?: throw WorkspaceNotFoundException()

    private fun memberId(id: String): UUID = BoardIds.parse(id) ?: throw WorkspaceMemberNotFoundException()

    private fun projectId(id: String): UUID = BoardIds.parse(id) ?: throw ProjectNotFoundException()

    private fun role(value: String?): WorkspaceRole = WorkspaceRole.entries.firstOrNull { it.value == value }
        ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown role")

    /** A name as it is kept: trimmed, a run of spaces inside as one, of 1 to [maxLength] characters. */
    private fun name(value: String?, maxLength: Int): String {
        val name = value.orEmpty().trim().replace(WHITESPACE, " ")
        if (name.length !in 1..maxLength) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "A name must have 1 to $maxLength characters")
        }
        return name
    }

    private fun WorkspaceSummary.toResponse() =
        WorkspaceResponse(workspace.id, workspace.name, role, workspace.createdAt, members, boards)

    private fun WorkspaceInvite.toResponse() = WorkspaceInviteResponse(id, "$INVITE_PAGE/$token", role, createdAt)

    private fun WorkspaceBoard.toResponse() = with(listed.board) {
        WorkspaceBoardResponse(
            id = checkNotNull(id),
            title = title,
            createdAt = createdAt,
            updatedAt = updatedAt,
            linkAccess = linkAccess,
            workspaceAccess = workspaceAccess,
            owner = BoardOwner(ownerId, listed.ownerName, listed.ownerAvatarUrl),
            role = role,
            projectId = projectId,
            openedAt = openedAt,
        )
    }

    companion object {
        private const val WORKSPACES = "/api/workspaces"
        private const val WORKSPACE = "$WORKSPACES/{id}"
        const val INVITES = "/api/workspace-invites"

        /** The page of the app that accepts an invitation into a workspace. */
        const val INVITE_PAGE = "/workspace-invite"

        private const val TITLE_MAX_LENGTH = 200
        private val WHITESPACE = Regex("\\s+")
    }
}

/** The name of a workspace or a project; checked for length after trimming. */
data class WorkspaceRequest(val name: String? = null)

/** A role in a workspace by its value, e.g. `editor`. */
data class WorkspaceRoleRequest(val role: String? = null)

data class WorkspaceBoardRequest(val title: String? = null, val projectId: UUID? = null)

/** Where a board goes: a workspace and its project, or with a `null` [workspaceId] the personal boards of the user. */
data class BoardPlaceRequest(val workspaceId: UUID? = null, val projectId: UUID? = null)

data class WorkspaceResponse(
    val id: UUID,
    val name: String,
    /** The role of the user who asks. */
    val role: WorkspaceRole,
    val createdAt: Instant,
    val members: Int,
    /** The boards of the workspace, without those in the trash. */
    val boards: Int,
)

/** An invitation link of a workspace. */
data class WorkspaceInviteResponse(
    val id: UUID,
    /** The address of the invitation in the app, from the root of the site: `/workspace-invite/<token>`. */
    val path: String,
    val role: WorkspaceRole,
    val createdAt: Instant,
)

/** A board of a workspace in its list, as the user who asks sees it. */
data class WorkspaceBoardResponse(
    val id: UUID,
    val title: String,
    val createdAt: Instant,
    val updatedAt: Instant,
    val linkAccess: LinkAccess,
    val workspaceAccess: WorkspaceAccess,
    /** The member of the workspace responsible for the board. */
    val owner: BoardOwner,
    val role: BoardRole,
    val projectId: UUID?,
    /** When the user was last on the board; `null` while they never were. */
    val openedAt: Instant?,
)
