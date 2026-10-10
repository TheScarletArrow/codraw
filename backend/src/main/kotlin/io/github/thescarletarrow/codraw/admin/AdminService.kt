package io.github.thescarletarrow.codraw.admin

import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.BoardRepository
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.LinkAccess
import io.github.thescarletarrow.codraw.embed.EmbedService
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserRepository
import org.springframework.data.repository.findByIdOrNull
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * What administrators of the installation do to users and boards. Every change is written to the journal in its own
 * transaction, so that what failed leaves no entry and what happened always has one.
 */
@Service
class AdminService(
    private val users: UserRepository,
    private val boards: BoardRepository,
    private val boardService: BoardService,
    private val embeds: EmbedService,
    private val reports: BoardReports,
    private val actions: AdminActions,
    private val sessions: UserSessions,
    private val access: AdminAccess,
    private val clock: Clock,
) {

    /**
     * Blocks the user [userId]: they no longer sign in and their sessions are deleted, so that collab closes their
     * connections too. Throws 409 for the administrator themselves and other administrators; blocking again changes
     * nothing.
     */
    @Transactional
    fun block(admin: User, userId: UUID): User {
        val user = userOf(userId)
        if (user.id == admin.id || access.isAdmin(user)) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Administrators of the installation are not blocked")
        }
        val now = now()
        if (users.block(user.id, now)) {
            sessions.deleteAll(user.id)
            actions.record(admin, AdminActionKind.BLOCK_USER, AdminTargetKind.USER, user.id, user.name, now)
        }
        return userOf(userId)
    }

    /** Lets the user [userId] sign in again; their deleted sessions do not come back. */
    @Transactional
    fun unblock(admin: User, userId: UUID): User {
        val user = userOf(userId)
        if (users.unblock(user.id)) {
            actions.record(admin, AdminActionKind.UNBLOCK_USER, AdminTargetKind.USER, user.id, user.name, now())
        }
        return userOf(userId)
    }

    /**
     * Closes the link of the board [boardId], in the trash too, and turns its live image off; its owner opens neither
     * again until [unblockSharing]. Those whom the link gave access lose it like after its owner closed it.
     */
    @Transactional
    fun blockSharing(admin: User, boardId: UUID) {
        val board = boardOf(boardId)
        val now = now()
        if (!boards.blockSharing(boardId, now)) return
        embeds.disable(boardId)
        val closed = board.copy(linkAccess = LinkAccess.NONE, sharingBlockedAt = now)
        if (closed.deletedAt == null) boardService.forgetUsersWithoutAccess(closed)
        actions.record(admin, AdminActionKind.BLOCK_SHARING, AdminTargetKind.BOARD, boardId, board.title, now)
    }

    /** Lets the owner of the board [boardId] open its link again; nothing opens by itself. */
    @Transactional
    fun unblockSharing(admin: User, boardId: UUID) {
        val board = boardOf(boardId)
        if (boards.unblockSharing(boardId)) {
            actions.record(admin, AdminActionKind.UNBLOCK_SHARING, AdminTargetKind.BOARD, boardId, board.title, now())
        }
    }

    /** Moves the board [boardId] to the trash as its owner would; its owner may restore it while the trash keeps it. */
    @Transactional
    fun moveToTrash(admin: User, boardId: UUID) {
        val board = boardService.find(boardId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found, or in the trash")
        boardService.moveToTrash(board)
        actions.record(admin, AdminActionKind.TRASH_BOARD, AdminTargetKind.BOARD, boardId, board.title, now())
    }

    /** Closes the open report [reportId]. */
    @Transactional
    fun resolveReport(admin: User, reportId: UUID): BoardReport {
        val report = reports.find(reportId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found")
        if (report.resolvedAt == null) resolve(admin, report.board.id, report.board.title, listOf(reportId))
        return checkNotNull(reports.find(reportId))
    }

    /** Closes all open reports of the board [boardId]; returns how many. */
    @Transactional
    fun resolveReportsOf(admin: User, boardId: UUID): Int = resolve(admin, boardId, boardOf(boardId).title, null)

    private fun resolve(admin: User, boardId: UUID, title: String, ids: List<UUID>?): Int {
        val now = now()
        val resolved = reports.resolve(boardId, ids, admin, now)
        if (resolved > 0) {
            actions.record(admin, AdminActionKind.RESOLVE_REPORTS, AdminTargetKind.BOARD, boardId, title, now, "$resolved")
        }
        return resolved
    }

    private fun userOf(id: UUID): User = users.findById(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "User not found")

    /** The board, in the trash too. */
    private fun boardOf(id: UUID): Board = boards.findByIdOrNull(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found")

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)
}
