package io.github.thescarletarrow.codraw.workspace

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.BoardLimitReachedException
import io.github.thescarletarrow.codraw.board.BoardMembers
import io.github.thescarletarrow.codraw.board.BoardOwnerChangedException
import io.github.thescarletarrow.codraw.board.BoardReads
import io.github.thescarletarrow.codraw.board.BoardRepository
import io.github.thescarletarrow.codraw.board.BoardRole
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.LinkAccess
import io.github.thescarletarrow.codraw.board.MemberRole
import io.github.thescarletarrow.codraw.user.UserRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/** A board of a workspace with the role of the user who asks and when they were last on it. */
data class WorkspaceBoard(
    val listed: ListedWorkspaceBoard,
    val role: BoardRole,
    val openedAt: Instant?,
)

/** The boards of workspaces: creating them there, listing them, and moving boards into and out of workspaces. */
@Service
class WorkspaceBoardService(
    private val workspaces: WorkspaceService,
    private val workspaceRoles: Workspaces,
    private val projects: WorkspaceProjects,
    private val workspaceBoards: WorkspaceBoards,
    private val boardRepository: BoardRepository,
    private val boards: BoardService,
    private val members: BoardMembers,
    private val reads: BoardReads,
    private val users: UserRepository,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    /** The boards of the workspace [id] that the member [userId] has a role on, the latest changed first. */
    fun list(id: UUID, userId: UUID): List<WorkspaceBoard> {
        val workspaceRole = workspaces.requireRole(id, userId) { true }
        val listed = workspaceBoards.list(id, userId).mapNotNull { listed ->
            listed.board.roleOf(userId, listed.memberRole, workspaceRole)?.let { listed to it }
        }
        val seen = reads.seenAt(userId, listed.map { (listed, _) -> checkNotNull(listed.board.id) })
        return listed.map { (listed, role) -> WorkspaceBoard(listed, role, seen[listed.board.id]) }
    }

    /**
     * Creates the board [title] in the workspace [id], in its project [projectId] or none; the user [userId], an editor
     * of the workspace or more, is responsible for it. Its link gives nothing: the board of a team opens to whom its
     * owner decides. Throws [BoardLimitReachedException] when the workspace has as many boards as the limit allows.
     */
    @Transactional
    fun create(id: UUID, userId: UUID, title: String, projectId: UUID?): Board {
        workspaces.lock(id)
        workspaces.requireRole(id, userId) { it.createsBoards }
        checkProject(id, projectId)
        boards.checkWorkspaceLimit(id)
        val now = now()
        val board = Board(
            title = title,
            ownerId = userId,
            createdAt = now,
            updatedAt = now,
            linkAccess = LinkAccess.NONE,
            workspaceId = id,
            projectId = projectId,
        )
        return boardRepository.save(board).also { metrics.boardCreated() }
    }

    /**
     * Moves the [board] for the user [userId]: a personal board into the workspace [workspaceId], a board of a workspace
     * into its project [projectId], or with a `null` [workspaceId] out of its workspace into the personal boards of the
     * user. Returns the board as it is then.
     */
    @Transactional
    fun move(board: Board, userId: UUID, workspaceId: UUID?, projectId: UUID?): Board {
        val current = board.workspaceId
        return when {
            current == null && workspaceId == null -> throw NothingToMoveException()
            current == null -> moveIn(board, userId, checkNotNull(workspaceId), projectId)
            workspaceId == null -> moveOut(board, userId, current)
            workspaceId == current -> place(board, userId, current, projectId)
            else -> throw BoardInOtherWorkspaceException()
        }
    }

    /**
     * Only the owner of a personal board brings it into a workspace where they are an editor or more; it keeps all it
     * has, and the user stays responsible for it.
     */
    private fun moveIn(board: Board, userId: UUID, workspaceId: UUID, projectId: UUID?): Board {
        if (board.ownerId != userId) throw WorkspaceForbiddenException("Only the owner brings a board into a workspace")
        workspaces.lock(workspaceId)
        workspaces.requireRole(workspaceId, userId) { it.createsBoards }
        checkProject(workspaceId, projectId)
        boards.checkWorkspaceLimit(workspaceId)
        val boardId = checkNotNull(board.id)
        if (!workspaceBoards.moveIn(boardId, userId, workspaceId, projectId)) throw BoardOwnerChangedException()
        return board.copy(workspaceId = workspaceId, projectId = projectId).also(boards::dropSatisfiedRequests)
    }

    /**
     * Only who manages the workspace takes a board out of it, as their personal board within their limit; the member
     * responsible for it so far stays on it as an editor. The other members of the workspace keep only what the board
     * gives them as its members or through its link.
     */
    private fun moveOut(board: Board, userId: UUID, workspaceId: UUID): Board {
        workspaces.lock(workspaceId)
        val role = workspaceRoles.roleOf(workspaceId, userId)
        if (role?.manages != true) throw WorkspaceForbiddenException("Only who manages the workspace takes a board out of it")
        checkNotNull(users.lock(userId)) { "User $userId does not exist" }
        if (boardRepository.countByOwnerId(userId) >= limits.boardsPerUser) {
            metrics.limitReached(Limit.BOARDS)
            throw BoardLimitReachedException(limits.boardsPerUser)
        }
        val boardId = checkNotNull(board.id)
        if (!workspaceBoards.moveOut(boardId, workspaceId, userId)) throw BoardOwnerChangedException()
        members.remove(boardId, userId)
        if (board.ownerId != userId) members.put(boardId, board.ownerId, MemberRole.EDITOR, now())
        val moved = board.copy(workspaceId = null, projectId = null, ownerId = userId)
        boards.forgetUsersWithoutAccess(moved)
        boards.dropSatisfiedRequests(moved)
        return moved
    }

    /** Who manages the board puts it into another project of its workspace, or into none. */
    private fun place(board: Board, userId: UUID, workspaceId: UUID, projectId: UUID?): Board {
        if (boards.roleOf(board, userId) != BoardRole.OWNER) {
            throw WorkspaceForbiddenException("Only who manages the board puts it into a project")
        }
        checkProject(workspaceId, projectId)
        if (!workspaceBoards.place(checkNotNull(board.id), workspaceId, projectId)) throw BoardOwnerChangedException()
        return board.copy(projectId = projectId)
    }

    private fun checkProject(workspaceId: UUID, projectId: UUID?) {
        if (projectId != null && projects.list(workspaceId).none { it.id == projectId }) throw ProjectNotFoundException()
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)
}

/** A personal board stays personal: there is nothing to move. */
class NothingToMoveException : RuntimeException("The board is personal already")

/** A board moves from one workspace to another through the personal boards only. */
class BoardInOtherWorkspaceException : RuntimeException("The board belongs to another workspace")
