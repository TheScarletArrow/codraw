package io.github.thescarletarrow.codraw.notification

import com.fasterxml.jackson.annotation.JsonValue
import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.LinkAccess
import io.github.thescarletarrow.codraw.board.MemberRole
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** What a notification tells its recipient. Stored by its name. */
enum class NotificationKind(@get:JsonValue val value: String) {
    /** A comment mentions the recipient. */
    MENTION("mention"),

    /** A comment answers in a thread that the recipient started or wrote in. */
    REPLY("reply"),

    /** Somebody made the recipient the assignee of a thread of comments. */
    ASSIGNED("assigned"),

    /** A user asks the recipient, the owner of the board, for a role on it. */
    ACCESS_REQUEST("access-request"),

    /** The owner gave the recipient a role on the board, or a higher one. */
    ACCESS_GRANTED("access-granted"),

    /** The owner declined the request of the recipient for a role on the board. */
    ACCESS_DECLINED("access-declined"),

    /** The recipient became the owner of the board. */
    OWNERSHIP("ownership"),

    /** A user proposes changes of the board, which the recipient reviews. */
    PROPOSAL_CREATED("proposal-created"),

    /** The owner or an editor accepted the proposal of changes of the recipient. */
    PROPOSAL_ACCEPTED("proposal-accepted"),

    /** The owner or an editor declined the proposal of changes of the recipient. */
    PROPOSAL_DECLINED("proposal-declined"),

    /** A participant asks the recipient, the owner of the board, to review an element they marked «Нужно ревью». */
    REVIEW_REQUEST("review-request"),
}

/** The user who did what a notification tells. */
data class Actor(
    val id: UUID,
    val name: String,
    val avatarUrl: String?,
)

/** A stored notification with what its recipient may see of it: the board and the comment as they are now. */
data class StoredNotification(
    val id: UUID,
    /** The recipient. */
    val userId: UUID,
    val kind: NotificationKind,
    val board: Board,
    /** The role of the recipient as a member of the board, `null` when they are not one. */
    val memberRole: MemberRole?,
    val commentId: UUID?,
    val threadId: UUID?,
    /** The page of the thread, or of the element of a request for a review. */
    val pageId: String?,
    /** The element of the board document that a request for a review is about. */
    val cellId: String?,
    val proposalId: UUID?,
    /**
     * The start of the comment, of the first comment of an assigned thread, or of the title of the proposal, at most
     * [Notifications.SNIPPET_LENGTH] characters.
     */
    val snippet: String?,
    /** `null` once the actor is deleted. */
    val actor: Actor?,
    /** The role asked for, given or declined. */
    val role: MemberRole?,
    val createdAt: Instant,
    val readAt: Instant?,
)

/**
 * Notifications of users. A row keeps who did what to whom and where; the board, the comment, the proposal and the actor
 * are read with it, and the element of a request for a review is read on the board.
 */
@Repository
class Notifications(private val jdbc: JdbcClient) {

    /**
     * Notifies each of the users [userIds] of the [kind] at [at]. A user who has a notification about the comment
     * [commentId] or the thread [threadId] already is skipped: one notification per comment or thread and recipient.
     * Returns the ids of the notifications it created.
     */
    fun add(
        userIds: Collection<UUID>,
        kind: NotificationKind,
        boardId: UUID,
        commentId: UUID?,
        threadId: UUID?,
        actorId: UUID,
        role: MemberRole?,
        at: Instant,
        proposalId: UUID? = null,
    ): List<UUID> {
        if (userIds.isEmpty()) return emptyList()
        return jdbc.sql(
            """
            INSERT INTO notifications
                (user_id, kind, board_id, comment_id, thread_id, proposal_id, actor_id, role, created_at)
            SELECT recipient, :kind, :boardId, :commentId::uuid, :threadId::uuid, :proposalId::uuid, :actorId, :role,
                   :at
            FROM unnest(:userIds::uuid[]) AS recipient
            ON CONFLICT DO NOTHING
            RETURNING id
            """,
        )
            .param("userIds", userIds.toTypedArray())
            .param("kind", kind.name)
            .param("boardId", boardId)
            .param("commentId", commentId)
            .param("threadId", threadId)
            .param("proposalId", proposalId)
            .param("actorId", actorId)
            .param("role", role?.name)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .query(UUID::class.java)
            .list()
            .filterNotNull()
    }

    /**
     * Notifies the owner [ownerId] of the board [boardId] at [at] that the user [actorId] asks them to review the element
     * [cellId] of the page [pageId], unless the owner has a notification about that element created after [notifiedAfter].
     * Returns the id of the notification, `null` when it did not notify them.
     */
    fun addReviewRequest(
        ownerId: UUID,
        boardId: UUID,
        pageId: String,
        cellId: String,
        actorId: UUID,
        at: Instant,
        notifiedAfter: Instant,
    ): UUID? = jdbc.sql(
        """
        INSERT INTO notifications (user_id, kind, board_id, page_id, cell_id, actor_id, created_at)
        SELECT :ownerId, 'REVIEW_REQUEST', :boardId, :pageId, :cellId, :actorId, :at
        WHERE NOT EXISTS (
            SELECT FROM notifications
            WHERE user_id = :ownerId AND board_id = :boardId AND kind = 'REVIEW_REQUEST'
              AND page_id = :pageId AND cell_id = :cellId AND created_at > :notifiedAfter
        )
        RETURNING id
        """,
    )
        .param("ownerId", ownerId)
        .param("boardId", boardId)
        .param("pageId", pageId)
        .param("cellId", cellId)
        .param("actorId", actorId)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .param("notifiedAfter", notifiedAfter.atOffset(ZoneOffset.UTC))
        .query(UUID::class.java)
        .optional()
        .orElse(null)

    /** How many notifications about requests for reviews the user [actorId] caused after [after]. */
    fun reviewRequestsAfter(actorId: UUID, after: Instant): Int = jdbc.sql(
        "SELECT count(*) FROM notifications WHERE actor_id = :actorId AND kind = 'REVIEW_REQUEST' AND created_at > :after",
    )
        .param("actorId", actorId)
        .param("after", after.atOffset(ZoneOffset.UTC))
        .query(Int::class.java)
        .single()

    /** Deletes the notifications of the users [userIds] that the comment [commentId] answers them. */
    fun deleteReplies(commentId: UUID, userIds: Collection<UUID>) {
        if (userIds.isEmpty()) return
        jdbc.sql(
            "DELETE FROM notifications WHERE comment_id = :commentId AND kind = 'REPLY' AND user_id = ANY (:userIds::uuid[])",
        )
            .param("commentId", commentId)
            .param("userIds", userIds.toTypedArray())
            .update()
    }

    /** Deletes the notification of the user [userId] about the thread [threadId], only an unread one with [unreadOnly]. */
    fun deleteAboutThread(userId: UUID, threadId: UUID, unreadOnly: Boolean) {
        jdbc.sql(
            """
            DELETE FROM notifications
            WHERE user_id = :userId AND thread_id = :threadId AND (read_at IS NULL OR NOT :unreadOnly)
            """,
        )
            .param("userId", userId)
            .param("threadId", threadId)
            .param("unreadOnly", unreadOnly)
            .update()
    }

    /** Deletes the unread notifications of the [kind] about the board [boardId] that the user [actorId] caused [userId]. */
    fun deleteUnread(userId: UUID, boardId: UUID, actorId: UUID, kind: NotificationKind) {
        jdbc.sql(
            """
            DELETE FROM notifications
            WHERE user_id = :userId AND board_id = :boardId AND actor_id = :actorId AND kind = :kind AND read_at IS NULL
            """,
        )
            .param("userId", userId)
            .param("boardId", boardId)
            .param("actorId", actorId)
            .param("kind", kind.name)
            .update()
    }

    /** Marks read the notifications of the [kind] about the board [boardId] that the user [actorId] caused [userId]. */
    fun markReadAbout(userId: UUID, boardId: UUID, actorId: UUID, kind: NotificationKind, at: Instant) {
        jdbc.sql(
            """
            UPDATE notifications SET read_at = :at
            WHERE user_id = :userId AND board_id = :boardId AND actor_id = :actorId AND kind = :kind AND read_at IS NULL
            """,
        )
            .param("userId", userId)
            .param("boardId", boardId)
            .param("actorId", actorId)
            .param("kind", kind.name)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** Deletes the unread notifications of the [kind] about the proposal [proposalId], whoever got them. */
    fun deleteUnreadAbout(proposalId: UUID, kind: NotificationKind) {
        jdbc.sql("DELETE FROM notifications WHERE proposal_id = :proposalId AND kind = :kind AND read_at IS NULL")
            .param("proposalId", proposalId)
            .param("kind", kind.name)
            .update()
    }

    /** Marks read the notifications of the [kind] about the proposal [proposalId] of the user [userId]. */
    fun markReadAbout(userId: UUID, proposalId: UUID, kind: NotificationKind, at: Instant) {
        jdbc.sql(
            """
            UPDATE notifications SET read_at = :at
            WHERE user_id = :userId AND proposal_id = :proposalId AND kind = :kind AND read_at IS NULL
            """,
        )
            .param("userId", userId)
            .param("proposalId", proposalId)
            .param("kind", kind.name)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /**
     * The notifications of the user [userId], newest first, older than the notification [before] when it is given, at
     * most [limit] of them.
     */
    fun page(userId: UUID, before: UUID?, limit: Int): List<StoredNotification> = jdbc.sql(
        """
        $SELECT_STORED
        WHERE b.deleted_at IS NULL AND n.user_id = :userId AND (:before::uuid IS NULL OR n.id < :before::uuid)
        ORDER BY n.id DESC
        LIMIT :limit
        """,
    )
        .param("userId", userId)
        .param("before", before)
        .param("limit", limit)
        .param("snippetLength", SNIPPET_LENGTH)
        .query { rs, _ -> rs.toStoredNotification() }
        .list()

    /** The notification [id] with what its recipient may see of it, `null` once it is gone. */
    fun find(id: UUID): StoredNotification? = jdbc.sql("$SELECT_STORED WHERE n.id = :id")
        .param("id", id)
        .param("snippetLength", SNIPPET_LENGTH)
        .query { rs, _ -> rs.toStoredNotification() }
        .optional()
        .orElse(null)

    fun unreadCount(userId: UUID): Int = jdbc.sql(
        "SELECT count(*) FROM notifications n JOIN boards b ON b.id = n.board_id WHERE n.user_id = :userId AND n.read_at IS NULL AND b.deleted_at IS NULL",
    )
        .param("userId", userId)
        .query(Int::class.java)
        .single()

    /** Marks the notification [id] of the user [userId] read; `false` when they have no such notification. */
    fun markRead(userId: UUID, id: UUID, at: Instant): Boolean = jdbc.sql(
        "UPDATE notifications SET read_at = coalesce(read_at, :at) WHERE id = :id AND user_id = :userId",
    )
        .param("id", id)
        .param("userId", userId)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .update() > 0

    fun markAllRead(userId: UUID, at: Instant) {
        jdbc.sql("UPDATE notifications SET read_at = :at WHERE user_id = :userId AND read_at IS NULL")
            .param("userId", userId)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** Deletes the notifications of each of the users [userIds] but the newest [limit]. */
    fun keepNewest(userIds: Collection<UUID>, limit: Int) {
        if (userIds.isEmpty()) return
        jdbc.sql(
            """
            DELETE FROM notifications n
            USING (
                SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY id DESC) AS position
                FROM notifications WHERE user_id = ANY (:userIds::uuid[])
            ) ranked
            WHERE n.id = ranked.id AND ranked.position > :limit
            """,
        )
            .param("userIds", userIds.toTypedArray())
            .param("limit", limit)
            .update()
    }

    /** Deletes at most [batchSize] notifications created before [before]; returns how many it deleted. */
    fun deleteCreatedBefore(before: Instant, batchSize: Int): Int = jdbc.sql(
        """
        DELETE FROM notifications WHERE id IN (
            SELECT id FROM notifications WHERE created_at < :before LIMIT :batchSize
        )
        """,
    )
        .param("before", before.atOffset(ZoneOffset.UTC))
        .param("batchSize", batchSize)
        .update()

    /**
     * Passes the notifications of the user [fromUserId], and those that they caused others, to the user [toUserId].
     * Notifications that would tell [toUserId] about themselves are dropped, and so are those of [fromUserId] about a
     * comment or a thread, or of a kind about a proposal, that [toUserId] has a notification about already.
     */
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        jdbc.sql(
            """
            DELETE FROM notifications
            WHERE (user_id = :fromUserId AND actor_id = :toUserId) OR (user_id = :toUserId AND actor_id = :fromUserId)
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql(
            """
            DELETE FROM notifications incoming USING notifications existing
            WHERE incoming.user_id = :fromUserId AND existing.user_id = :toUserId
              AND (existing.comment_id = incoming.comment_id OR existing.thread_id = incoming.thread_id
                   OR (existing.proposal_id = incoming.proposal_id AND existing.kind = incoming.kind))
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql("UPDATE notifications SET user_id = :toUserId WHERE user_id = :fromUserId")
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql("UPDATE notifications SET actor_id = :toUserId WHERE actor_id = :fromUserId")
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
    }

    private fun ResultSet.toStoredNotification() = StoredNotification(
        id = getObject("id", UUID::class.java),
        userId = getObject("user_id", UUID::class.java),
        kind = NotificationKind.valueOf(getString("kind")),
        board = Board(
            id = getObject("board_id", UUID::class.java),
            title = getString("title"),
            ownerId = getObject("owner_id", UUID::class.java),
            createdAt = instant("board_created_at")!!,
            updatedAt = instant("board_updated_at")!!,
            linkAccess = LinkAccess.valueOf(getString("link_access")),
        ),
        memberRole = getString("member_role")?.let(MemberRole::valueOf),
        commentId = getObject("comment_id", UUID::class.java),
        threadId = getObject("thread_id", UUID::class.java),
        pageId = getString("page_id"),
        cellId = getString("cell_id"),
        proposalId = getObject("proposal_id", UUID::class.java),
        snippet = getString("body")?.let(::snippetOf),
        actor = getObject("actor_id", UUID::class.java)?.let { id ->
            Actor(id, getString("actor_name"), getString("actor_avatar_url"))
        },
        role = getString("role")?.let(MemberRole::valueOf),
        createdAt = instant("created_at")!!,
        readAt = instant("read_at"),
    )

    /** The text cut to [SNIPPET_LENGTH] characters, with an ellipsis when it goes on. */
    private fun snippetOf(body: String): String =
        if (body.length > SNIPPET_LENGTH) body.take(SNIPPET_LENGTH - 1) + "…" else body

    private fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()

    companion object {
        /** The most characters of a comment that a notification shows. */
        const val SNIPPET_LENGTH = 200

        /** Notifications with their board, the role of the recipient on it, the actor, the thread and the snippet. */
        private const val SELECT_STORED = """
            SELECT n.id, n.user_id, n.kind, n.comment_id, n.proposal_id, n.role, n.created_at, n.read_at,
                   b.id AS board_id, b.title, b.owner_id, b.created_at AS board_created_at,
                   b.updated_at AS board_updated_at, b.link_access, m.role AS member_role,
                   a.id AS actor_id, a.name AS actor_name, a.avatar_url AS actor_avatar_url,
                   t.id AS thread_id, coalesce(t.page_id, n.page_id) AS page_id, n.cell_id,
                   left(coalesce(c.body, f.body, p.title), :snippetLength + 1) AS body
            FROM notifications n
            JOIN boards b ON b.id = n.board_id
            LEFT JOIN board_members m ON m.board_id = n.board_id AND m.user_id = n.user_id
            LEFT JOIN users a ON a.id = n.actor_id
            LEFT JOIN comments c ON c.id = n.comment_id
            LEFT JOIN comment_threads t ON t.id = coalesce(c.thread_id, n.thread_id)
            -- The first comment of an assigned thread tells what the thread is about.
            LEFT JOIN LATERAL (
                SELECT body FROM comments WHERE thread_id = n.thread_id ORDER BY created_at, id LIMIT 1
            ) f ON true
            LEFT JOIN proposals p ON p.id = n.proposal_id
        """
    }
}
