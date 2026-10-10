package io.github.thescarletarrow.codraw.account

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.board.BoardRepository
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.MemberNotFoundException
import io.github.thescarletarrow.codraw.user.UserRepository
import io.github.thescarletarrow.codraw.workspace.WorkspaceRole
import io.github.thescarletarrow.codraw.workspace.WorkspaceService
import org.slf4j.LoggerFactory
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/** What becomes of a personal board with other participants when its owner is deleted. */
sealed interface BoardDecision {
    /** The board passes to its member [newOwnerId], as when its owner gives it away. */
    data class Transfer(val newOwnerId: UUID) : BoardDecision

    /** The board is deleted for good with its images. */
    data object Delete : BoardDecision
}

/** What deleting a user does to boards with other participants that have no [BoardDecision]. */
enum class UndecidedBoards {
    /** Nothing is deleted: [DecisionsRequiredException]. The user deleting themselves decides on each board. */
    REFUSE,

    /** They are deleted too: an administrator may choose so. */
    DELETE,
}

/** What deleting the user would do: the boards to decide on, the workspaces in the way and how many boards go. */
data class DeletionPreview(
    val sharedBoards: List<SharedBoard>,
    val blockingWorkspaces: List<BlockingWorkspace>,
    /** Personal boards that go without a question: those without other participants and those in the trash. */
    val deletedBoards: Int,
)

/** A workspace whose only owner the user is, while others are members of it. */
data class BlockingWorkspace(val id: UUID, val name: String)

/**
 * Deletes accounts: of a user who asks for it, and of anybody whom an administrator of the installation deletes. Their
 * personal boards go, or pass to members where the deletion says so; their boards of workspaces pass to other owners of
 * the workspaces; what is theirs only goes with the row of the user (foreign keys `ON DELETE CASCADE`), and what they
 * gave to boards of others stays without its author (`ON DELETE SET NULL`), shown as a deleted user. Their sessions end.
 */
@Service
class AccountDeletionService(
    private val accounts: Accounts,
    private val users: UserRepository,
    private val boards: BoardService,
    private val boardRepository: BoardRepository,
    private val workspaces: WorkspaceService,
    private val metrics: CodrawMetrics,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    fun preview(userId: UUID): DeletionPreview {
        val shared = accounts.sharedBoards(userId)
        return DeletionPreview(
            sharedBoards = shared,
            blockingWorkspaces = blockingWorkspaces(userId),
            deletedBoards = accounts.personalBoards(userId).size - shared.size,
        )
    }

    /**
     * Deletes the user [userId]. Each board of [DeletionPreview.sharedBoards] goes as [decisions] say; boards without a
     * decision go as [undecided] says. Nothing changes when the user is the only owner of a workspace with other members
     * ([SoleWorkspaceOwnerException]), when a board with others has no decision under [UndecidedBoards.REFUSE]
     * ([DecisionsRequiredException]), when a decision names another board or passes a board to a user who is not its
     * member ([InvalidDecisionException]), or when the new owner owns as many boards as the limit allows
     * (`BoardLimitReachedException`). Returns `false` when there is no such user.
     */
    @Transactional
    fun delete(userId: UUID, decisions: Map<UUID, BoardDecision>, undecided: UndecidedBoards = UndecidedBoards.REFUSE): Boolean {
        // Boards that the user creates meanwhile wait for the lock, then find no user.
        users.lock(userId) ?: return false
        val blocking = blockingWorkspaces(userId)
        if (blocking.isNotEmpty()) throw SoleWorkspaceOwnerException(blocking)
        val shared = accounts.sharedBoards(userId).associateBy { it.id }
        val unknown = decisions.keys - shared.keys
        if (unknown.isNotEmpty()) throw InvalidDecisionException("Boards $unknown are no boards of the user with others on them")
        val missing = shared.keys - decisions.keys
        if (missing.isNotEmpty() && undecided == UndecidedBoards.REFUSE) throw DecisionsRequiredException(missing.toList())
        for ((boardId, decision) in decisions) {
            if (decision is BoardDecision.Transfer && shared.getValue(boardId).members.none { it.id == decision.newOwnerId }) {
                throw InvalidDecisionException("User ${decision.newOwnerId} is no member of board $boardId")
            }
        }

        // What may fail goes first: the images of deleted boards leave the storage at once.
        for ((boardId, decision) in decisions) {
            if (decision !is BoardDecision.Transfer) continue
            val board = checkNotNull(boards.find(boardId)) { "Board $boardId of user $userId is gone" }
            try {
                boards.transferOwnership(board, decision.newOwnerId)
            } catch (exception: MemberNotFoundException) {
                throw InvalidDecisionException("User ${decision.newOwnerId} is no member of board $boardId")
            }
        }
        leaveWorkspaces(userId)
        // The boards of workspaces where the user was alone are in their trash now, personal ones.
        for (boardId in accounts.personalBoards(userId)) boardRepository.findByIdOrNull(boardId)?.let(boards::delete)
        accounts.anonymizeEditors(userId)
        val sessions = accounts.endSessions(userId)
        accounts.deleteUser(userId)
        metrics.accountDeleted()
        log.info("Deleted the account of user {} and ended {} sessions", userId, sessions)
        return true
    }

    private fun blockingWorkspaces(userId: UUID): List<BlockingWorkspace> = accounts.memberships(userId)
        .filter { it.role == WorkspaceRole.OWNER && it.owners == 1 && it.members > 1 }
        .map { BlockingWorkspace(it.workspaceId, it.name) }

    /**
     * Leaves the workspaces of the user [userId] as they would themselves: their boards there pass to the first other
     * owner. A workspace where they are alone goes, and its boards go to their trash.
     */
    private fun leaveWorkspaces(userId: UUID) {
        for (membership in accounts.memberships(userId)) {
            if (membership.members == 1) {
                workspaces.delete(membership.workspaceId, userId)
            } else {
                workspaces.removeMember(membership.workspaceId, userId, userId)
            }
        }
    }
}

/** The user is the only owner of workspaces with other members: they pass the role on first. */
class SoleWorkspaceOwnerException(val workspaces: List<BlockingWorkspace>) :
    RuntimeException("The user is the only owner of workspaces ${workspaces.map { it.id }} with other members")

/** Boards with other participants have no decision. */
class DecisionsRequiredException(val boards: List<UUID>) : RuntimeException("Boards $boards with other participants need a decision")

/** A decision names a board that is not to decide on, or passes a board to a user who is not its member. */
class InvalidDecisionException(message: String) : RuntimeException(message)
