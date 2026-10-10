package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.notification.NotificationService
import io.github.thescarletarrow.codraw.user.UserRepository
import io.github.thescarletarrow.codraw.workspace.Workspaces
import org.springframework.context.ApplicationEventPublisher
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class BoardService(
    private val boards: BoardRepository,
    private val visits: BoardVisits,
    private val members: BoardMembers,
    private val requests: AccessRequests,
    private val reads: BoardReads,
    private val organization: BoardOrganization,
    private val workspaces: Workspaces,
    private val users: UserRepository,
    private val notifications: NotificationService,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val events: ApplicationEventPublisher,
    private val clock: Clock,
) {

    /**
     * Creates a board owned by the user [ownerId]; throws [BoardLimitReachedException] when they own as many boards as
     * the limit allows.
     */
    @Transactional
    fun create(title: String, ownerId: UUID): Board {
        // Boards created at the same time by one owner count each other.
        checkNotNull(users.lock(ownerId)) { "Owner $ownerId does not exist" }
        if (boards.countByOwnerId(ownerId) >= limits.boardsPerUser) {
            metrics.limitReached(Limit.BOARDS)
            throw BoardLimitReachedException(limits.boardsPerUser)
        }
        val now = now()
        return boards.save(Board(title = title, ownerId = ownerId, createdAt = now, updatedAt = now))
            .also { metrics.boardCreated() }
    }

    /** Personal boards of the user [ownerId], most recently changed first. */
    fun list(ownerId: UUID): List<Board> = boards.findAllByOwnerIdOrderByUpdatedAtDesc(ownerId)

    /** When the user [userId] was last on each of the [boards] that they were on. */
    fun seenAt(userId: UUID, boards: List<Board>): Map<UUID, Instant> = reads.seenAt(userId, boards.mapNotNull { it.id })

    /** Returns the board of any user; what the caller may do with it depends on [roleOf]. */
    fun find(id: UUID): Board? = boards.findByIdOrNull(id)?.takeIf { it.deletedAt == null }

    /** The boards in the trash that the user [userId] may restore or delete for good, see [managesTrashed]. */
    fun trash(userId: UUID): List<Board> = boards.trashOf(userId, now().minus(TRASH_RETENTION))

    /**
     * Whether the user [userId] restores the [board] from the trash or deletes it for good: its owner, and for a board of
     * a workspace those who manage the workspace too.
     */
    fun managesTrashed(board: Board, userId: UUID): Boolean =
        board.ownerId == userId || board.workspaceId?.let { workspaces.roleOf(it, userId) }?.manages == true

    fun deleted(id: UUID): Board? = boards.findByIdOrNull(id)?.takeIf { it.deletedAt != null }

    /** Keeps all related data for recovery; active API and collab lookups no longer find the board. */
    @Transactional
    fun moveToTrash(board: Board) {
        checkNotNull(users.lock(board.ownerId))
        if (!boards.moveToTrash(checkNotNull(board.id), board.ownerId, now())) throw BoardOwnerChangedException()
    }

    /**
     * Creating and restoring serialize on the owner, or on the workspace of a board of a workspace, so recovery cannot
     * exceed the active-board quota of either.
     */
    @Transactional
    fun restore(board: Board): Board {
        val workspaceId = board.workspaceId
        if (workspaceId == null) {
            checkNotNull(users.lock(board.ownerId))
            if (boards.countByOwnerId(board.ownerId) >= limits.boardsPerUser) {
                metrics.limitReached(Limit.BOARDS)
                throw BoardLimitReachedException(limits.boardsPerUser)
            }
        } else {
            checkNotNull(workspaces.lock(workspaceId)) { "Workspace $workspaceId of a board does not exist" }
            checkWorkspaceLimit(workspaceId)
        }
        if (!boards.restore(checkNotNull(board.id), board.ownerId, now().minus(TRASH_RETENTION))) {
            throw org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Board not found in trash")
        }
        return checkNotNull(find(board.id))
    }

    @Transactional
    fun purgeTrash(board: Board) {
        checkNotNull(users.lock(board.ownerId))
        val id = checkNotNull(board.id)
        if (!boards.purgeTrash(id, board.ownerId)) {
            throw org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Board not found in trash")
        }
        events.publishEvent(BoardDeleted(id))
    }

    /**
     * The role of the user [userId] on the [board], with their role as a member and in the workspace of the board;
     * `null` when it gives them none.
     */
    fun roleOf(board: Board, userId: UUID): BoardRole? {
        if (board.ownerId == userId) return BoardRole.OWNER
        val memberRole = members.roleOf(checkNotNull(board.id), userId)
        return board.roleOf(userId, memberRole, board.workspaceId?.let { workspaces.roleOf(it, userId) })
    }

    /**
     * The role of any user on the [board] now, from its members and the members of its workspace read once: for changes
     * that go through all users of a board.
     */
    fun rolesOn(board: Board): (UUID) -> BoardRole? {
        val memberRoles = members.roles(checkNotNull(board.id))
        val workspaceRoles = board.workspaceId?.let(workspaces::roles).orEmpty()
        return { userId -> board.roleOf(userId, memberRoles[userId], workspaceRoles[userId]) }
    }

    /** The workspace of the [board] as its responses name it; `null` for a personal board. */
    fun workspaceOf(board: Board): BoardWorkspace? =
        board.workspaceId?.let(workspaces::find)?.let { BoardWorkspace(it.id, it.name) }

    /**
     * Whether the [board] is in the list of the user [userId]: it is theirs, or shared with them — they are its member,
     * a member of its workspace whom the workspace gives a role on it, or opened it through its link, which still gives
     * them a role.
     */
    fun isListed(board: Board, userId: UUID): Boolean {
        if (board.ownerId == userId) return true
        val boardId = checkNotNull(board.id)
        val workspaceRole = board.workspaceId?.let { workspaces.roleOf(it, userId) }
        if (workspaceRole != null && board.roleOf(userId, null, workspaceRole) != null) return true
        return members.roleOf(boardId, userId) != null || (board.linkAccess.role != null && members.visited(boardId, userId))
    }

    /** Records that the user [userId] opened the [board] of another user, through its link or as a member. */
    fun recordVisit(board: Board, userId: UUID) {
        if (board.ownerId != userId) visits.record(userId, checkNotNull(board.id), now())
    }

    /** Boards of other users that the user [userId] opened or is a member of, the latest opened or joined first. */
    fun sharedWith(userId: UUID): List<SharedBoard> = visits.sharedWith(userId, SHARED_LIMIT)

    /** Gives the [board] a new [title]; renaming is a change of the board. */
    fun rename(board: Board, title: String): Board {
        val now = now()
        boards.rename(checkNotNull(board.id), title, now)
        return board.copy(title = title, updatedAt = now)
    }

    /**
     * Sets what the link to the [board] gives to others; this is not a change of the board itself. Requests for access
     * that the link satisfies now are dropped, and the visits of those whom it no longer gives access are forgotten.
     */
    @Transactional
    fun changeLinkAccess(board: Board, linkAccess: LinkAccess): Board {
        // Updating the row locks it: a request for access to the board waits for the new link, or the link for it.
        boards.updateLinkAccess(checkNotNull(board.id), linkAccess.name)
        return board.copy(linkAccess = linkAccess).also(::dropSatisfiedRequests).also(::forgetUsersWithoutAccess)
    }

    /**
     * Sets what the workspace of the [board] gives its members on it; like the link access, this is not a change of the
     * board itself. Requests for access that it satisfies now are dropped, and the visits of those whom it no longer
     * gives access are forgotten.
     */
    @Transactional
    fun changeWorkspaceAccess(board: Board, workspaceAccess: WorkspaceAccess): Board {
        boards.updateWorkspaceAccess(checkNotNull(board.id), workspaceAccess.name)
        return board.copy(workspaceAccess = workspaceAccess).also(::dropSatisfiedRequests).also(::forgetUsersWithoutAccess)
    }

    /**
     * Drops the requests for access to the [board] that it satisfies: their users have the role they asked for or a
     * higher one, e.g. since its link gives it, its owner made them members or its workspace gives it. Every change that
     * may widen the access calls it, and the role is the one [Board.roleOf] gives.
     */
    fun dropSatisfiedRequests(board: Board) {
        val boardId = checkNotNull(board.id)
        val wanted = requests.wanted(boardId)
        if (wanted.isEmpty()) return
        val roleOf = rolesOn(board)
        val satisfied = wanted.filter { (userId, role) ->
            val current = roleOf(userId)
            current != null && current >= role.role
        }
        requests.deleteAll(boardId, satisfied.keys)
    }

    /**
     * Forgets when the users whom the [board] gives no role any more were on it, e.g. after its owner closed its link: a
     * later visit compares the board with a state of it that the user could see, so the access to it must not have had a
     * gap. Their tags and folder of the board go too. Every change that may take a role away calls it, and the role is
     * the one [Board.roleOf] gives.
     */
    fun forgetUsersWithoutAccess(board: Board) {
        val boardId = checkNotNull(board.id)
        val roleOf = rolesOn(board)
        val withoutAccess = { userId: UUID -> roleOf(userId) == null }
        reads.forget(boardId, reads.readers(boardId).filter(withoutAccess))
        organization.forget(boardId, organization.users(boardId).filter(withoutAccess))
    }

    /**
     * Deletes the [board] for good, with its document, its members, the requests for access to it, the visits of its
     * users and their tags of it; [BoardDeleted] tells what keeps more of it, e.g. its images.
     */
    fun delete(board: Board) {
        val boardId = checkNotNull(board.id)
        boards.deleteById(boardId)
        events.publishEvent(BoardDeleted(boardId))
    }

    /**
     * Makes the member [newOwnerId] the owner of the [board], which notifies them; its previous owner stays on it as an
     * editor. Throws [MemberNotFoundException] when [newOwnerId] is no member, [BoardLimitReachedException] when they
     * own as many boards as the limit allows, and [BoardOwnerChangedException] when the board got another owner since it
     * was read. A board of a workspace goes to a member of the workspace instead, see [transferWorkspaceBoard].
     */
    @Transactional
    fun transferOwnership(board: Board, newOwnerId: UUID): Board {
        if (board.workspaceId != null) return transferWorkspaceBoard(board, board.workspaceId, newOwnerId)
        val boardId = checkNotNull(board.id)
        // Like creating a board: the boards of the new owner do not change while they are counted.
        users.lock(newOwnerId) ?: throw MemberNotFoundException()
        if (members.roleOf(boardId, newOwnerId) == null) throw MemberNotFoundException()
        if (boards.countByOwnerId(newOwnerId) >= limits.boardsPerUser) {
            metrics.limitReached(Limit.BOARDS)
            throw BoardLimitReachedException(limits.boardsPerUser)
        }
        // A second transfer of the same board waits for the first one here, then finds another owner.
        if (!boards.changeOwnerOf(boardId, board.ownerId, newOwnerId)) throw BoardOwnerChangedException()
        members.remove(boardId, newOwnerId)
        members.put(boardId, board.ownerId, MemberRole.EDITOR, now())
        notifications.ownershipGiven(board, newOwnerId)
        // The new owner asks for nothing any more.
        return board.copy(ownerId = newOwnerId).also(::dropSatisfiedRequests)
    }

    /**
     * Makes the member [newOwnerId] of the workspace [workspaceId] responsible for its [board], which notifies them; the
     * board does not count against their limit of personal boards. Its previous owner keeps what the workspace gives
     * them, or stays on the board as an editor when that is nothing, e.g. under [WorkspaceAccess.NONE]. Throws
     * [MemberNotFoundException] when [newOwnerId] is no other member of the workspace and [BoardOwnerChangedException]
     * when the board got another owner meanwhile.
     */
    private fun transferWorkspaceBoard(board: Board, workspaceId: UUID, newOwnerId: UUID): Board {
        val boardId = checkNotNull(board.id)
        // Under the lock of the workspace, the new owner stays its member till the transfer is done.
        checkNotNull(workspaces.lock(workspaceId)) { "Workspace $workspaceId of a board does not exist" }
        if (newOwnerId == board.ownerId || workspaces.roleOf(workspaceId, newOwnerId) == null) throw MemberNotFoundException()
        if (!boards.changeOwnerOf(boardId, board.ownerId, newOwnerId)) throw BoardOwnerChangedException()
        members.remove(boardId, newOwnerId)
        val transferred = board.copy(ownerId = newOwnerId)
        if (roleOf(transferred, board.ownerId) == null) members.put(boardId, board.ownerId, MemberRole.EDITOR, now())
        notifications.ownershipGiven(board, newOwnerId)
        return transferred.also(::dropSatisfiedRequests)
    }

    /** Throws [BoardLimitReachedException] when the workspace [workspaceId] has as many boards as the limit allows. */
    fun checkWorkspaceLimit(workspaceId: UUID) {
        if (boards.countInWorkspace(workspaceId) >= limits.boardsPerWorkspace) {
            metrics.limitReached(Limit.WORKSPACE_BOARDS)
            throw BoardLimitReachedException(limits.boardsPerWorkspace)
        }
    }

    /**
     * Passes all boards of the user [fromUserId], the boards they opened through links, when they were on boards, their
     * memberships, their requests for access, their folders and their tags to the user [toUserId]. Requests that
     * [toUserId] needs no more, e.g. for a board that has just become theirs, are dropped.
     */
    @Transactional
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        boards.changeOwner(fromUserId, toUserId)
        visits.transfer(fromUserId, toUserId)
        reads.transfer(fromUserId, toUserId)
        members.transfer(fromUserId, toUserId)
        requests.transfer(fromUserId, toUserId)
        organization.transfer(fromUserId, toUserId)
        requests.boardsOf(toUserId).forEach { boardId -> find(boardId)?.let(::dropSatisfiedRequests) }
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    companion object {
        /** The most boards the list of boards shared with a user holds. */
        const val SHARED_LIMIT = 50
        val TRASH_RETENTION: java.time.Duration = java.time.Duration.ofDays(30)
    }
}

/**
 * Its owner deleted the board [boardId]. Boards that the cleanup of gone guests deletes are not told: what keeps more of
 * a board finds those itself.
 */
data class BoardDeleted(val boardId: UUID)

/** The user owns as many boards as the [limit] allows. */
class BoardLimitReachedException(val limit: Int) : RuntimeException("The user owns $limit boards, the most allowed")

/** The board got another owner while its owner was changing it. */
class BoardOwnerChangedException : RuntimeException("The owner of the board changed meanwhile")
