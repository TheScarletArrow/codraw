package io.github.thescarletarrow.codraw.notification

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

/** How a message of a notification to a channel ended, or that it waits. Stored by its name. */
enum class DeliveryStatus {
    PENDING,
    SENT,

    /** The recipient refused it, or it did not go in all the attempts. */
    FAILED,

    /** Not sent: the notification was read, the settings or the access of the recipient changed meanwhile. */
    SKIPPED,
}

/** Why a message was not sent or did not go. Stored by its name. */
enum class DeliveryReason {
    REJECTED,
    UNAVAILABLE,
    READ,
    SETTINGS,
    NO_ACCESS,
    ;

    companion object {
        fun of(error: DeliveryError): DeliveryReason = when (error) {
            DeliveryError.REJECTED -> REJECTED
            DeliveryError.UNAVAILABLE -> UNAVAILABLE
        }
    }
}

/** A message that an instance of the backend took to send: [attempts] counts this attempt too. */
data class ClaimedDelivery(
    val id: UUID,
    val notificationId: UUID,
    val channelId: UUID,
    val attempts: Int,
)

/**
 * The queue of messages of notifications to channels of their recipients. A message goes with its notification and
 * its channel; one notification gives at most one message per channel.
 */
@Repository
class NotificationDeliveries(private val jdbc: JdbcClient) {

    /**
     * Queues the notifications [notificationIds] of the [event], created at [at], to the active channels of their
     * recipients that deliver the [event], unless the recipient muted the board; they are due at [dueAt].
     */
    fun enqueue(notificationIds: Collection<UUID>, event: NotificationEvent, at: Instant, dueAt: Instant) {
        if (notificationIds.isEmpty()) return
        jdbc.sql(
            """
            INSERT INTO notification_deliveries (notification_id, channel_id, status, attempts, next_attempt_at, created_at)
            SELECT n.id, c.id, 'PENDING', 0, :dueAt, :at
            FROM notifications n
            JOIN notification_channels c ON c.user_id = n.user_id
            WHERE n.id = ANY (:ids::uuid[])
              AND c.enabled AND c.verified_at IS NOT NULL AND :event = ANY (c.events)
              AND NOT EXISTS (
                  SELECT FROM notification_board_mutes m WHERE m.user_id = n.user_id AND m.board_id = n.board_id
              )
            ON CONFLICT DO NOTHING
            """,
        )
            .param("ids", notificationIds.toTypedArray())
            .param("event", event.name)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .param("dueAt", dueAt.atOffset(ZoneOffset.UTC))
            .update()
    }

    /**
     * Takes at most [limit] messages due at [now] to send, counting an attempt for each: until [leaseUntil] no other
     * instance of the backend takes them, and after it they are due again, should this instance stop meanwhile.
     */
    fun claim(now: Instant, leaseUntil: Instant, limit: Int): List<ClaimedDelivery> = jdbc.sql(
        """
        UPDATE notification_deliveries d SET attempts = d.attempts + 1, next_attempt_at = :leaseUntil
        FROM (
            SELECT id FROM notification_deliveries
            WHERE status = 'PENDING' AND next_attempt_at <= :now
            ORDER BY next_attempt_at, id
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
        ) due
        WHERE d.id = due.id
        RETURNING d.id, d.notification_id, d.channel_id, d.attempts
        """,
    )
        .param("now", now.atOffset(ZoneOffset.UTC))
        .param("leaseUntil", leaseUntil.atOffset(ZoneOffset.UTC))
        .param("limit", limit)
        .query { rs, _ ->
            ClaimedDelivery(
                id = rs.getObject("id", UUID::class.java),
                notificationId = rs.getObject("notification_id", UUID::class.java),
                channelId = rs.getObject("channel_id", UUID::class.java),
                attempts = rs.getInt("attempts"),
            )
        }
        .list()

    /** Ends the pending message [id] at [at] with the [status]. */
    fun finish(id: UUID, status: DeliveryStatus, reason: DeliveryReason?, at: Instant) {
        require(status != DeliveryStatus.PENDING) { "A message ends sent, failed or skipped" }
        jdbc.sql(
            """
            UPDATE notification_deliveries SET status = :status, reason = :reason, finished_at = :at
            WHERE id = :id AND status = 'PENDING'
            """,
        )
            .param("id", id)
            .param("status", status.name)
            .param("reason", reason?.name)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** The pending message [id] did not go for the [reason]; it is tried again at [nextAttemptAt]. */
    fun retry(id: UUID, reason: DeliveryReason, nextAttemptAt: Instant) {
        jdbc.sql(
            """
            UPDATE notification_deliveries SET reason = :reason, next_attempt_at = :nextAttemptAt
            WHERE id = :id AND status = 'PENDING'
            """,
        )
            .param("id", id)
            .param("reason", reason.name)
            .param("nextAttemptAt", nextAttemptAt.atOffset(ZoneOffset.UTC))
            .update()
    }
}
