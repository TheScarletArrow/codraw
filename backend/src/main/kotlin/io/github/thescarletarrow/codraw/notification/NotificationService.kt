package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.MemberRole
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Notifications of users about what others did that concerns them. The actions call it in their own transactions, so
 * that a notification comes with its action or not at all; whoever acts gets no notification about it.
 */
@Service
class NotificationService(
    private val notifications: Notifications,
    private val limits: LimitProperties,
    private val clock: Clock,
) {

    /**
     * A new comment [commentId] of the user [authorId] on the board [boardId] mentions the users [mentioned] and answers
     * the thread of the users [answered]. A user both mentioned and answered gets one notification, of the mention.
     */
    fun commentAdded(boardId: UUID, commentId: UUID, authorId: UUID, mentioned: Set<UUID>, answered: Set<UUID>) {
        notify(mentioned, NotificationKind.MENTION, boardId, authorId, commentId = commentId)
        notify(answered - mentioned, NotificationKind.REPLY, boardId, authorId, commentId = commentId)
    }

    /**
     * An edit of the comment [commentId] mentions the users [mentioned], whom it did not mention before. A notification
     * of an answer becomes one of the mention, at the top of the list; a user notified of a mention of theirs in this
     * comment once is not notified again.
     */
    fun mentionsAdded(boardId: UUID, commentId: UUID, authorId: UUID, mentioned: Set<UUID>) {
        notifications.deleteReplies(commentId, mentioned - authorId)
        notify(mentioned, NotificationKind.MENTION, boardId, authorId, commentId = commentId)
    }

    /**
     * The user [actorId] made [assigneeId] the assignee of the thread [threadId] on the board [boardId] in place of
     * [previousAssigneeId], or left the thread without one. The previous assignee loses their unread notification of the
     * thread, which is no longer theirs. The new one gets a notification at the top of the list in place of any earlier
     * one of the thread, unless they assigned the thread to themselves.
     */
    fun threadAssigned(boardId: UUID, threadId: UUID, actorId: UUID, previousAssigneeId: UUID?, assigneeId: UUID?) {
        if (previousAssigneeId == assigneeId) return
        previousAssigneeId?.let { notifications.deleteAboutThread(it, threadId, unreadOnly = true) }
        if (assigneeId == null || assigneeId == actorId) return
        notifications.deleteAboutThread(assigneeId, threadId, unreadOnly = false)
        notify(setOf(assigneeId), NotificationKind.ASSIGNED, boardId, actorId, threadId = threadId)
    }

    /** The user [userId] asks the owner of the [board] for the [role]; a notification of their earlier unread request goes. */
    fun accessRequested(board: Board, userId: UUID, role: MemberRole) {
        notifications.deleteUnread(board.ownerId, board.boardId, userId, NotificationKind.ACCESS_REQUEST)
        notify(setOf(board.ownerId), NotificationKind.ACCESS_REQUEST, board.boardId, userId, role = role)
    }

    /** The user [userId] no longer asks for access to the [board]: the owner has nothing to answer. */
    fun accessRequestCancelled(board: Board, userId: UUID) {
        notifications.deleteUnread(board.ownerId, board.boardId, userId, NotificationKind.ACCESS_REQUEST)
    }

    /** The owner answered the request of the user [userId] for access to the [board], so they have read about it. */
    fun accessRequestAnswered(board: Board, userId: UUID) {
        notifications.markReadAbout(board.ownerId, board.boardId, userId, NotificationKind.ACCESS_REQUEST, now())
    }

    /** The owner of the [board] gave the user [userId] the [role], or a role higher than theirs. */
    fun accessGranted(board: Board, userId: UUID, role: MemberRole) =
        notify(setOf(userId), NotificationKind.ACCESS_GRANTED, board.boardId, board.ownerId, role = role)

    /** The owner of the [board] declined the request of the user [userId] for the [role]. */
    fun accessDeclined(board: Board, userId: UUID, role: MemberRole) =
        notify(setOf(userId), NotificationKind.ACCESS_DECLINED, board.boardId, board.ownerId, role = role)

    /** The owner of the [board] made the user [newOwnerId] its owner. */
    fun ownershipGiven(board: Board, newOwnerId: UUID) =
        notify(setOf(newOwnerId), NotificationKind.OWNERSHIP, board.boardId, board.ownerId)

    /**
     * A page of the notifications of the user [userId], newest first, older than the notification [before] when it is
     * given. A notification about a board that the user has no role on now tells only what happened and when.
     */
    fun page(userId: UUID, before: UUID?): NotificationPage {
        val stored = notifications.page(userId, before, PAGE_SIZE + 1)
        val page = stored.take(PAGE_SIZE)
        return NotificationPage(
            notifications = page.map { it.toNotification(userId) },
            next = if (stored.size > PAGE_SIZE) page.last().id else null,
        )
    }

    fun unreadCount(userId: UUID): Int = notifications.unreadCount(userId)

    /** Marks the notification [id] of the user [userId] read; throws [NotificationNotFoundException] for any other. */
    fun markRead(userId: UUID, id: UUID) {
        if (!notifications.markRead(userId, id, now())) throw NotificationNotFoundException()
    }

    fun markAllRead(userId: UUID) = notifications.markAllRead(userId, now())

    /** Passes the notifications of the guest [fromUserId] to the user [toUserId] who signs in, like their boards. */
    @Transactional
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        notifications.transfer(fromUserId, toUserId)
        notifications.keepNewest(setOf(toUserId), limits.notificationsPerUser)
    }

    private fun notify(
        userIds: Set<UUID>,
        kind: NotificationKind,
        boardId: UUID,
        actorId: UUID,
        commentId: UUID? = null,
        threadId: UUID? = null,
        role: MemberRole? = null,
    ) {
        val recipients = userIds - actorId
        if (recipients.isEmpty()) return
        notifications.add(recipients, kind, boardId, commentId, threadId, actorId, role, now())
        // Others create the notifications of a user: the oldest go, so that nobody fills the database of another.
        notifications.keepNewest(recipients, limits.notificationsPerUser)
    }

    private fun StoredNotification.toNotification(userId: UUID): Notification {
        val access = board.roleOf(userId, memberRole) != null
        return Notification(
            id = id,
            kind = kind,
            boardId = board.boardId,
            access = access,
            boardTitle = board.title.takeIf { access },
            pageId = pageId.takeIf { access },
            threadId = threadId.takeIf { access },
            commentId = commentId.takeIf { access },
            snippet = snippet.takeIf { access },
            actor = actor.takeIf { access },
            role = role.takeIf { access },
            createdAt = createdAt,
            readAt = readAt,
        )
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private val Board.boardId: UUID
        get() = checkNotNull(id) { "Persisted board must have an id" }

    companion object {
        /** The most notifications on one page of the list. */
        const val PAGE_SIZE = 30
    }
}

/**
 * A notification as its recipient sees it. Without a role on the board now ([access] is `false`) it names neither the
 * board nor the comment nor who did it.
 */
data class Notification(
    val id: UUID,
    val kind: NotificationKind,
    val boardId: UUID,
    /** Whether the recipient may open the board now. */
    val access: Boolean,
    val boardTitle: String?,
    /** The page of the thread of a mention, an answer or an assignment. */
    val pageId: String?,
    val threadId: UUID?,
    val commentId: UUID?,
    /** The start of the comment of a mention or an answer, or of the first comment of an assigned thread. */
    val snippet: String?,
    /** `null` without access and once the actor is deleted. */
    val actor: Actor?,
    /** The role asked for, given or declined. */
    val role: MemberRole?,
    val createdAt: Instant,
    /** When the recipient read it, `null` while they did not. */
    val readAt: Instant?,
)

/** A page of notifications, newest first, and the cursor of the next page, `null` after the last one. */
data class NotificationPage(val notifications: List<Notification>, val next: UUID?)

/** The user has no such notification. */
class NotificationNotFoundException : RuntimeException("Notification not found")
