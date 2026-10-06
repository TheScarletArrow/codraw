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

    /** A user asks the recipient, the owner of the board, for a role on it. */
    ACCESS_REQUEST("access-request"),

    /** The owner gave the recipient a role on the board, or a higher one. */
    ACCESS_GRANTED("access-granted"),

    /** The owner declined the request of the recipient for a role on the board. */
    ACCESS_DECLINED("access-declined"),

    /** The recipient became the owner of the board. */
    OWNERSHIP("ownership"),
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
    val kind: NotificationKind,
    val board: Board,
    /** The role of the recipient as a member of the board, `null` when they are not one. */
    val memberRole: MemberRole?,
    val commentId: UUID?,
    val threadId: UUID?,
    val pageId: String?,
    /** The start of the comment, at most [Notifications.SNIPPET_LENGTH] characters. */
    val snippet: String?,
    /** `null` once the actor is deleted. */
    val actor: Actor?,
    /** The role asked for, given or declined. */
    val role: MemberRole?,
    val createdAt: Instant,
    val readAt: Instant?,
)

/**
 * Notifications of users. A row keeps who did what to whom and where; the board, the comment and the actor are read
 * with it.
 */
@Repository
class Notifications(private val jdbc: JdbcClient) {

    /**
     * Notifies each of the users [userIds] of the [kind] at [at]. A user who has a notification about the comment
     * [commentId] already is skipped: one notification per comment and recipient.
     */
    fun add(
        userIds: Collection<UUID>,
        kind: NotificationKind,
        boardId: UUID,
        commentId: UUID?,
        actorId: UUID,
        role: MemberRole?,
        at: Instant,
    ) {
        if (userIds.isEmpty()) return
        jdbc.sql(
            """
            INSERT INTO notifications (user_id, kind, board_id, comment_id, actor_id, role, created_at)
            SELECT recipient, :kind, :boardId, :commentId::uuid, :actorId, :role, :at
            FROM unnest(:userIds::uuid[]) AS recipient
            ON CONFLICT (user_id, comment_id) DO NOTHING
            """,
        )
            .param("userIds", userIds.toTypedArray())
            .param("kind", kind.name)
            .param("boardId", boardId)
            .param("commentId", commentId)
            .param("actorId", actorId)
            .param("role", role?.name)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

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

    /**
     * The notifications of the user [userId], newest first, older than the notification [before] when it is given, at
     * most [limit] of them.
     */
    fun page(userId: UUID, before: UUID?, limit: Int): List<StoredNotification> = jdbc.sql(
        """
        SELECT n.id, n.kind, n.comment_id, n.role, n.created_at, n.read_at,
               b.id AS board_id, b.title, b.owner_id, b.created_at AS board_created_at,
               b.updated_at AS board_updated_at, b.link_access, m.role AS member_role,
               a.id AS actor_id, a.name AS actor_name, a.avatar_url AS actor_avatar_url,
               t.id AS thread_id, t.page_id, left(c.body, :snippetLength + 1) AS body
        FROM notifications n
        JOIN boards b ON b.id = n.board_id
        LEFT JOIN board_members m ON m.board_id = n.board_id AND m.user_id = n.user_id
        LEFT JOIN users a ON a.id = n.actor_id
        LEFT JOIN comments c ON c.id = n.comment_id
        LEFT JOIN comment_threads t ON t.id = c.thread_id
        WHERE n.user_id = :userId AND (:before::uuid IS NULL OR n.id < :before::uuid)
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

    fun unreadCount(userId: UUID): Int = jdbc.sql(
        "SELECT count(*) FROM notifications WHERE user_id = :userId AND read_at IS NULL",
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
     * comment that [toUserId] has a notification about already.
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
              AND existing.comment_id = incoming.comment_id
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
    }
}
