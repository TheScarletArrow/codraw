package io.github.thescarletarrow.codraw.workspace

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.Tokens
import io.github.thescarletarrow.codraw.board.AccessRequests
import io.github.thescarletarrow.codraw.board.BoardMembers
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.user.UserRepository
import io.github.thescarletarrow.codraw.user.guest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Workspaces, their members, invitations and projects. Every method takes the user who acts and checks what their role
 * lets them do: a workspace that they are not a member of is not found. Changes of one workspace go one after another
 * under its lock, so that the last owner stays and limits hold.
 */
@Service
class WorkspaceService(
    private val workspaces: Workspaces,
    private val invites: WorkspaceInvites,
    private val projects: WorkspaceProjects,
    private val workspaceBoards: WorkspaceBoards,
    private val boards: BoardService,
    private val boardMembers: BoardMembers,
    private val requests: AccessRequests,
    private val users: UserRepository,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    /** The workspaces of the user [userId] by name. */
    fun list(userId: UUID): List<WorkspaceSummary> = workspaces.summaries(userId)

    /** The workspace [id] as its member [userId] sees it; throws [WorkspaceNotFoundException] for anybody else. */
    fun summary(id: UUID, userId: UUID): WorkspaceSummary = workspaces.summary(id, userId) ?: throw WorkspaceNotFoundException()

    /**
     * Creates the workspace [name] owned by the user [userId]. Throws [AccountRequiredException] for a guest and
     * [WorkspaceLimitReachedException] when they are in as many workspaces as the limit allows.
     */
    @Transactional
    fun create(userId: UUID, name: String): WorkspaceSummary {
        val user = checkNotNull(users.lock(userId)) { "User $userId does not exist" }
        if (user.guest) throw AccountRequiredException()
        checkWorkspacesOf(userId)
        val workspace = workspaces.create(name, now())
        workspaces.put(workspace.id, userId, WorkspaceRole.OWNER, now())
        return summary(workspace.id, userId)
    }

    /** Gives the workspace [id] the [name]; for those who manage it. */
    @Transactional
    fun rename(id: UUID, userId: UUID, name: String): WorkspaceSummary {
        requireRole(id, userId) { it.manages }
        workspaces.rename(id, name)
        return summary(id, userId)
    }

    /**
     * Deletes the workspace [id]; only its owners may. All its boards, those in the trash too, become personal boards of
     * the user [userId] in their trash; its members lose what the workspace gave them, and its projects, members and
     * invitations go.
     */
    @Transactional
    fun delete(id: UUID, userId: UUID) {
        lock(id)
        requireRole(id, userId) { it == WorkspaceRole.OWNER }
        for (board in workspaceBoards.release(id, userId, now())) {
            // The owner is no member of their board.
            boardMembers.remove(checkNotNull(board.id), userId)
            boards.forgetUsersWithoutAccess(board)
        }
        workspaces.delete(id)
    }

    /** The members of the workspace [id], owners first; for any of its members. */
    fun members(id: UUID, userId: UUID): List<WorkspaceMember> {
        requireRole(id, userId) { true }
        return workspaces.members(id)
    }

    /**
     * Gives the member [memberId] of the workspace [id] the [role]. The user [userId] who does it gives and takes only
     * roles that [WorkspaceRole.mayGive] lets them; the last owner stays an owner. Boards whose access the member loses
     * forget them.
     */
    @Transactional
    fun changeRole(id: UUID, userId: UUID, memberId: UUID, role: WorkspaceRole): WorkspaceMember {
        lock(id)
        val own = requireRole(id, userId) { true }
        val current = workspaces.roleOf(id, memberId) ?: throw WorkspaceMemberNotFoundException()
        if (!own.mayGive(current) || !own.mayGive(role)) throw WorkspaceForbiddenException()
        if (current == WorkspaceRole.OWNER && role != WorkspaceRole.OWNER) checkNotLastOwner(id)
        workspaces.put(id, memberId, role, now())
        if (role < current) forgetLostAccess(id, memberId) else dropSatisfiedRequests(id, memberId)
        return workspaces.members(id).first { it.id == memberId }
    }

    /**
     * Takes the member [memberId] out of the workspace [id], or lets them leave it when [userId] is [memberId]; the last
     * owner does neither. The boards that they were responsible for, those in the trash too, pass to [userId], or when
     * the member leaves to the first owner of the workspace; their roles of their own on boards of the workspace go too,
     * and those boards forget them unless their links let them in.
     */
    @Transactional
    fun removeMember(id: UUID, userId: UUID, memberId: UUID) {
        lock(id)
        val own = requireRole(id, userId) { true }
        val current = workspaces.roleOf(id, memberId) ?: throw WorkspaceMemberNotFoundException()
        if (userId != memberId && !own.mayGive(current)) throw WorkspaceForbiddenException()
        if (current == WorkspaceRole.OWNER) checkNotLastOwner(id)
        val heir = if (userId != memberId) userId else workspaces.owners(id).first { it != memberId }
        for (boardId in workspaceBoards.pass(id, memberId, heir)) boards.find(boardId)?.let(boards::dropSatisfiedRequests)
        workspaceBoards.removeMemberships(id, memberId)
        workspaces.remove(id, memberId)
        forgetLostAccess(id, memberId)
    }

    /** The invitations of the workspace [id], oldest first; for those who manage it. */
    fun invites(id: UUID, userId: UUID): List<WorkspaceInvite> {
        requireRole(id, userId) { it.manages }
        return invites.list(id)
    }

    /** Creates an invitation that makes whoever accepts it a member of the workspace [id] with the [role]. */
    @Transactional
    fun invite(id: UUID, userId: UUID, role: WorkspaceRole): WorkspaceInvite {
        lock(id)
        val own = requireRole(id, userId) { it.manages }
        if (role == WorkspaceRole.OWNER) throw InvalidInviteRoleException()
        if (!own.mayGive(role)) throw WorkspaceForbiddenException()
        if (invites.count(id) >= limits.invitesPerWorkspace) {
            metrics.limitReached(Limit.WORKSPACE_INVITES)
            throw WorkspaceLimitException(Limit.WORKSPACE_INVITES, limits.invitesPerWorkspace)
        }
        return invites.add(id, Tokens.next(), role, now())
    }

    /** Revokes the invitation [inviteId]; those who joined through it stay. Only who may give its role revokes it. */
    @Transactional
    fun revoke(id: UUID, userId: UUID, inviteId: UUID) {
        val own = requireRole(id, userId) { it.manages }
        val invite = invites.find(id, inviteId) ?: throw WorkspaceInviteNotFoundException()
        if (!own.mayGive(invite.role)) throw WorkspaceForbiddenException()
        invites.delete(id, inviteId)
    }

    /**
     * The user [userId] accepts the invitation [token]: they become a member with its role, a member with a lower role
     * gets it, and a member with a higher role keeps theirs. Throws [AccountRequiredException] for a guest,
     * [WorkspaceInviteNotFoundException] when there is no such invitation and [WorkspaceLimitException] when either the
     * user or the workspace reached its limit.
     */
    @Transactional
    fun accept(token: String, userId: UUID): WorkspaceSummary {
        val invite = invites.find(token) ?: throw WorkspaceInviteNotFoundException()
        // The workspace first, then the user, as everywhere: members who join at the same time count each other.
        lock(invite.workspaceId)
        val user = checkNotNull(users.lock(userId)) { "User $userId does not exist" }
        if (user.guest) throw AccountRequiredException()
        val current = workspaces.roleOf(invite.workspaceId, userId)
        if (current == null) {
            checkWorkspacesOf(userId)
            if (workspaces.memberCount(invite.workspaceId) >= limits.membersPerWorkspace) {
                metrics.limitReached(Limit.WORKSPACE_MEMBERS)
                throw WorkspaceLimitException(Limit.WORKSPACE_MEMBERS, limits.membersPerWorkspace)
            }
        }
        if (current == null || current < invite.role) {
            workspaces.put(invite.workspaceId, userId, invite.role, now())
            dropSatisfiedRequests(invite.workspaceId, userId)
        }
        return summary(invite.workspaceId, userId)
    }

    /** The projects of the workspace [id] by name; for any of its members. */
    fun projects(id: UUID, userId: UUID): List<WorkspaceProject> {
        requireRole(id, userId) { true }
        return projects.list(id)
    }

    /** Creates the project [name] of the workspace [id]; for those who manage it. */
    @Transactional
    fun createProject(id: UUID, userId: UUID, name: String): WorkspaceProject {
        lock(id)
        requireRole(id, userId) { it.manages }
        val existing = projects.list(id)
        if (existing.any { it.name.equals(name, ignoreCase = true) }) throw ProjectNameTakenException()
        if (existing.size >= limits.projectsPerWorkspace) {
            metrics.limitReached(Limit.WORKSPACE_PROJECTS)
            throw WorkspaceLimitException(Limit.WORKSPACE_PROJECTS, limits.projectsPerWorkspace)
        }
        return projects.add(id, name, now())
    }

    /** Gives the project [projectId] of the workspace [id] the [name]; for those who manage it. */
    @Transactional
    fun renameProject(id: UUID, userId: UUID, projectId: UUID, name: String): WorkspaceProject {
        lock(id)
        requireRole(id, userId) { it.manages }
        val existing = projects.list(id)
        if (existing.none { it.id == projectId }) throw ProjectNotFoundException()
        if (existing.any { it.id != projectId && it.name.equals(name, ignoreCase = true) }) throw ProjectNameTakenException()
        projects.rename(id, projectId, name)
        return WorkspaceProject(projectId, name)
    }

    /** Deletes the project [projectId]; its boards stay in the workspace [id], in no project. */
    @Transactional
    fun deleteProject(id: UUID, userId: UUID, projectId: UUID) {
        requireRole(id, userId) { it.manages }
        if (!projects.delete(id, projectId)) throw ProjectNotFoundException()
    }

    /**
     * The role of the user [userId] in the workspace [id] when it lets them do what [allowed] says. Throws
     * [WorkspaceNotFoundException] when they are not its member and [WorkspaceForbiddenException] when the role does
     * not let them.
     */
    fun requireRole(id: UUID, userId: UUID, allowed: (WorkspaceRole) -> Boolean): WorkspaceRole {
        val role = workspaces.roleOf(id, userId) ?: throw WorkspaceNotFoundException()
        if (!allowed(role)) throw WorkspaceForbiddenException()
        return role
    }

    /** Locks the workspace [id]; throws [WorkspaceNotFoundException] when there is none. */
    fun lock(id: UUID): Workspace = workspaces.lock(id) ?: throw WorkspaceNotFoundException()

    /** Drops the requests of the user [userId] for access to boards of the workspace that their role there satisfies. */
    private fun dropSatisfiedRequests(workspaceId: UUID, userId: UUID) =
        requests.boardsOf(userId).mapNotNull(boards::find).filter { it.workspaceId == workspaceId }
            .forEach(boards::dropSatisfiedRequests)

    /** The boards of the workspace [workspaceId] that the member [userId] was on forget them where they lost access. */
    private fun forgetLostAccess(workspaceId: UUID, userId: UUID) =
        workspaceBoards.known(workspaceId, userId).forEach(boards::forgetUsersWithoutAccess)

    private fun checkNotLastOwner(id: UUID) {
        if (workspaces.owners(id).size <= 1) throw LastOwnerException()
    }

    private fun checkWorkspacesOf(userId: UUID) {
        if (workspaces.countOf(userId) >= limits.workspacesPerUser) {
            metrics.limitReached(Limit.WORKSPACES)
            throw WorkspaceLimitException(Limit.WORKSPACES, limits.workspacesPerUser)
        }
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    companion object {
        /** The longest name of a workspace. */
        const val NAME_MAX_LENGTH = 80

        /** The longest name of a project. */
        const val PROJECT_NAME_MAX_LENGTH = 60
    }
}

/** The user is not a member of the workspace, or there is no such workspace. */
class WorkspaceNotFoundException : RuntimeException("Workspace not found")

/** The role of the user in the workspace does not let them do this. */
class WorkspaceForbiddenException(message: String = "The role in the workspace does not allow this") : RuntimeException(message)

/** The user is not a member of the workspace. */
class WorkspaceMemberNotFoundException : RuntimeException("The user is not a member of the workspace")

/** No invitation of the workspace has this token or id: it was revoked, or it never was. */
class WorkspaceInviteNotFoundException : RuntimeException("The invitation is not valid")

/** Nobody becomes an owner through an invitation. */
class InvalidInviteRoleException : RuntimeException("An invitation gives the role of an administrator, an editor or a viewer")

/** Workspaces are for users who signed in through a provider, not for guests. */
class AccountRequiredException : RuntimeException("Workspaces need an account of GitHub or Google")

/** The change would leave the workspace without an owner. */
class LastOwnerException : RuntimeException("The workspace needs an owner")

/** The workspace has a project of that name, regardless of case. */
class ProjectNameTakenException : RuntimeException("The workspace has a project of that name")

/** The workspace has no such project. */
class ProjectNotFoundException : RuntimeException("The workspace has no such project")

/** The user or the workspace has as many of the things of the [kind] as the [limit] allows. */
class WorkspaceLimitException(val kind: Limit, val limit: Int) : RuntimeException("The limit of $limit ${kind.tag} is reached")
