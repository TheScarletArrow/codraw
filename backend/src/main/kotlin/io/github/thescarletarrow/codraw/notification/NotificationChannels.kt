package io.github.thescarletarrow.codraw.notification

import com.fasterxml.jackson.annotation.JsonValue
import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.LinkAccess
import io.github.thescarletarrow.codraw.board.MemberRole
import io.github.thescarletarrow.codraw.board.WorkspaceAccess
import io.github.thescarletarrow.codraw.workspace.WorkspaceRole
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** Where messages of notifications go outside of CoDraw. Stored by its name. */
enum class ChannelKind(@get:JsonValue val value: String) {
    EMAIL("email"),

    /** An incoming webhook of a team chat: Slack, Mattermost, Rocket.Chat. */
    WEBHOOK("webhook"),
}

/**
 * What a user may choose to hear of outside of CoDraw: groups of kinds of notifications. Stored by its name; a kind of
 * notification added later joins one of the groups.
 */
enum class NotificationEvent(@get:JsonValue val value: String, val kinds: Set<NotificationKind>) {
    MENTIONS("mentions", setOf(NotificationKind.MENTION)),
    REPLIES("replies", setOf(NotificationKind.REPLY)),
    ASSIGNMENTS("assignments", setOf(NotificationKind.ASSIGNED)),
    ACCESS(
        "access",
        setOf(
            NotificationKind.ACCESS_REQUEST,
            NotificationKind.ACCESS_GRANTED,
            NotificationKind.ACCESS_DECLINED,
            NotificationKind.OWNERSHIP,
        ),
    ),
    REVIEWS(
        "reviews",
        setOf(
            NotificationKind.REVIEW_REQUEST,
            NotificationKind.PROPOSAL_CREATED,
            NotificationKind.PROPOSAL_ACCEPTED,
            NotificationKind.PROPOSAL_DECLINED,
        ),
    ),
    ;

    companion object {
        /** The group of the [kind]. */
        fun of(kind: NotificationKind): NotificationEvent = entries.first { kind in it.kinds }
    }
}

/** Why a message did not go. Stored by its name. */
enum class DeliveryError(@get:JsonValue val value: String) {
    /** The recipient refused it: the mail server did not take the address, the webhook answered 4xx. Not repeated. */
    REJECTED("rejected"),

    /** No answer, a timeout, an error of the server: the message is tried again later. */
    UNAVAILABLE("unavailable"),
}

/** A channel of a user, with the secret of its address: never give it to anybody but the backend itself. */
data class NotificationChannel(
    val id: UUID,
    val userId: UUID,
    val kind: ChannelKind,
    /** The email address, or the URL of the webhook. */
    val address: String,
    val enabled: Boolean,
    val events: Set<NotificationEvent>,
    /** When the address was confirmed; a webhook is confirmed as it is saved. */
    val verifiedAt: Instant?,
    /** When the letter that confirms the address went, `null` when it did not. */
    val verificationSentAt: Instant?,
    val lastDeliveredAt: Instant?,
    val lastError: DeliveryError?,
    val lastErrorAt: Instant?,
) {
    /** Whether messages go to the channel at all. */
    val active: Boolean
        get() = enabled && verifiedAt != null
}

/** A board whose notifications the user does not want outside of CoDraw. */
data class MutedBoard(
    val board: Board,
    /** The role of the user as a member of the board, `null` when they are not one. */
    val memberRole: MemberRole?,
    /** The role of the user in the workspace of the board, `null` when they are not its member or there is none. */
    val workspaceRole: WorkspaceRole?,
    val mutedAt: Instant,
)

/** The channels of users and the boards they muted. Every method works on the channels of one user. */
@Repository
class NotificationChannels(private val jdbc: JdbcClient) {

    fun find(userId: UUID, kind: ChannelKind): NotificationChannel? =
        jdbc.sql("SELECT * FROM notification_channels WHERE user_id = :userId AND kind = :kind")
            .param("userId", userId)
            .param("kind", kind.name)
            .query { rs, _ -> rs.toChannel() }
            .optional()
            .orElse(null)

    fun findById(id: UUID): NotificationChannel? =
        jdbc.sql("SELECT * FROM notification_channels WHERE id = :id")
            .param("id", id)
            .query { rs, _ -> rs.toChannel() }
            .optional()
            .orElse(null)

    fun list(userId: UUID): List<NotificationChannel> =
        jdbc.sql("SELECT * FROM notification_channels WHERE user_id = :userId")
            .param("userId", userId)
            .query { rs, _ -> rs.toChannel() }
            .list()

    /**
     * Gives the user [userId] the channel of the [kind] at the [address] in place of any earlier one: a new address
     * starts without a history of deliveries, confirmed at [verifiedAt] or waiting for the letter with the token whose
     * hash is [tokenHash].
     */
    fun save(
        userId: UUID,
        kind: ChannelKind,
        address: String,
        enabled: Boolean,
        events: Set<NotificationEvent>,
        verifiedAt: Instant?,
        tokenHash: ByteArray?,
        at: Instant,
    ): NotificationChannel = jdbc.sql(
        """
        INSERT INTO notification_channels
            (user_id, kind, address, enabled, events, verified_at, verification_token_hash, created_at)
        VALUES (:userId, :kind, :address, :enabled, :events::text[], :verifiedAt, :tokenHash, :at)
        ON CONFLICT (user_id, kind) DO UPDATE SET
            address = EXCLUDED.address, enabled = EXCLUDED.enabled, events = EXCLUDED.events,
            verified_at = EXCLUDED.verified_at, verification_token_hash = EXCLUDED.verification_token_hash,
            verification_sent_at = NULL, last_delivered_at = NULL, last_error = NULL, last_error_at = NULL
        RETURNING *
        """,
    )
        .param("userId", userId)
        .param("kind", kind.name)
        .param("address", address)
        .param("enabled", enabled)
        .param("events", events.names())
        .param("verifiedAt", verifiedAt?.atOffset(ZoneOffset.UTC))
        .param("tokenHash", tokenHash)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> rs.toChannel() }
        .single()

    /** Changes what the channel of the [kind] of the user [userId] sends; `null` when they have none. */
    fun update(userId: UUID, kind: ChannelKind, enabled: Boolean, events: Set<NotificationEvent>): NotificationChannel? =
        jdbc.sql(
            """
            UPDATE notification_channels SET enabled = :enabled, events = :events::text[]
            WHERE user_id = :userId AND kind = :kind
            RETURNING *
            """,
        )
            .param("userId", userId)
            .param("kind", kind.name)
            .param("enabled", enabled)
            .param("events", events.names())
            .query { rs, _ -> rs.toChannel() }
            .optional()
            .orElse(null)

    /** Deletes the channel, and the messages it has not sent with it; `false` when the user has no such channel. */
    fun delete(userId: UUID, kind: ChannelKind): Boolean =
        jdbc.sql("DELETE FROM notification_channels WHERE user_id = :userId AND kind = :kind")
            .param("userId", userId)
            .param("kind", kind.name)
            .update() > 0

    /** A new letter with the token whose hash is [tokenHash] confirms the unconfirmed email address of the user. */
    fun newToken(userId: UUID, tokenHash: ByteArray): Boolean = jdbc.sql(
        """
        UPDATE notification_channels SET verification_token_hash = :tokenHash, verification_sent_at = NULL
        WHERE user_id = :userId AND kind = 'EMAIL' AND verified_at IS NULL
        """,
    )
        .param("userId", userId)
        .param("tokenHash", tokenHash)
        .update() > 0

    /** The letter that confirms the address of the channel [id] went at [at]. */
    fun verificationSent(id: UUID, at: Instant) {
        jdbc.sql("UPDATE notification_channels SET verification_sent_at = :at WHERE id = :id")
            .param("id", id)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /**
     * Confirms the email address of the user [userId] whose letter carried the token with the hash [tokenHash] and went
     * after [sentAfter]; the token works once. `false` when no such letter of theirs is waiting.
     */
    fun confirm(userId: UUID, tokenHash: ByteArray, sentAfter: Instant, at: Instant): Boolean = jdbc.sql(
        """
        UPDATE notification_channels SET verified_at = :at, verification_token_hash = NULL
        WHERE user_id = :userId AND kind = 'EMAIL' AND verified_at IS NULL
          AND verification_token_hash = :tokenHash AND verification_sent_at > :sentAfter
        """,
    )
        .param("userId", userId)
        .param("tokenHash", tokenHash)
        .param("sentAfter", sentAfter.atOffset(ZoneOffset.UTC))
        .param("at", at.atOffset(ZoneOffset.UTC))
        .update() > 0

    /** A message went through the channel [id] at [at]: the channel works again. */
    fun delivered(id: UUID, at: Instant) {
        jdbc.sql("UPDATE notification_channels SET last_delivered_at = :at, last_error = NULL, last_error_at = NULL WHERE id = :id")
            .param("id", id)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** A message did not go through the channel [id] at [at]. */
    fun failed(id: UUID, error: DeliveryError, at: Instant) {
        jdbc.sql("UPDATE notification_channels SET last_error = :error, last_error_at = :at WHERE id = :id")
            .param("id", id)
            .param("error", error.name)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    fun mute(userId: UUID, boardId: UUID, at: Instant) {
        jdbc.sql(
            """
            INSERT INTO notification_board_mutes (user_id, board_id, created_at) VALUES (:userId, :boardId, :at)
            ON CONFLICT DO NOTHING
            """,
        )
            .param("userId", userId)
            .param("boardId", boardId)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    fun unmute(userId: UUID, boardId: UUID) {
        jdbc.sql("DELETE FROM notification_board_mutes WHERE user_id = :userId AND board_id = :boardId")
            .param("userId", userId)
            .param("boardId", boardId)
            .update()
    }

    fun muted(userId: UUID, boardId: UUID): Boolean = jdbc.sql(
        "SELECT EXISTS (SELECT FROM notification_board_mutes WHERE user_id = :userId AND board_id = :boardId)",
    )
        .param("userId", userId)
        .param("boardId", boardId)
        .query(Boolean::class.java)
        .single()

    /** The boards that the user [userId] muted, most recently muted first. */
    fun mutedBoards(userId: UUID): List<MutedBoard> = jdbc.sql(
        """
        SELECT b.id, b.title, b.owner_id, b.created_at, b.updated_at, b.link_access, m.role AS member_role,
               b.workspace_id, b.project_id, b.workspace_access, w.role AS workspace_role,
               mute.created_at AS muted_at
        FROM notification_board_mutes mute
        JOIN boards b ON b.id = mute.board_id
        LEFT JOIN board_members m ON m.board_id = mute.board_id AND m.user_id = mute.user_id
        LEFT JOIN workspace_members w ON w.workspace_id = b.workspace_id AND w.user_id = mute.user_id
        WHERE mute.user_id = :userId
        ORDER BY mute.created_at DESC, b.id
        """,
    )
        .param("userId", userId)
        .query { rs, _ ->
            MutedBoard(
                board = Board(
                    id = rs.getObject("id", UUID::class.java),
                    title = rs.getString("title"),
                    ownerId = rs.getObject("owner_id", UUID::class.java),
                    createdAt = rs.instant("created_at")!!,
                    updatedAt = rs.instant("updated_at")!!,
                    linkAccess = LinkAccess.valueOf(rs.getString("link_access")),
                    workspaceId = rs.getObject("workspace_id", UUID::class.java),
                    projectId = rs.getObject("project_id", UUID::class.java),
                    workspaceAccess = WorkspaceAccess.valueOf(rs.getString("workspace_access")),
                ),
                memberRole = rs.getString("member_role")?.let(MemberRole::valueOf),
                workspaceRole = rs.getString("workspace_role")?.let(WorkspaceRole::valueOf),
                mutedAt = rs.instant("muted_at")!!,
            )
        }
        .list()

    private fun Set<NotificationEvent>.names(): Array<String> = map { it.name }.sorted().toTypedArray()

    private fun ResultSet.toChannel() = NotificationChannel(
        id = getObject("id", UUID::class.java),
        userId = getObject("user_id", UUID::class.java),
        kind = ChannelKind.valueOf(getString("kind")),
        address = getString("address"),
        enabled = getBoolean("enabled"),
        events = (getArray("events").array as Array<*>).map { NotificationEvent.valueOf(it as String) }.toSet(),
        verifiedAt = instant("verified_at"),
        verificationSentAt = instant("verification_sent_at"),
        lastDeliveredAt = instant("last_delivered_at"),
        lastError = getString("last_error")?.let(DeliveryError::valueOf),
        lastErrorAt = instant("last_error_at"),
    )

    private fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()
}
