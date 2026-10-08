package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.DeliveryResult
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.concurrent.Executors

/**
 * Sends the queued messages of notifications to the channels of their recipients. Each instance of the backend takes
 * the messages that are due with a lease, so that no two send one message, and sends them outside of transactions.
 * Before sending, it looks again at what may have changed since the notification: whether it was read, the settings of
 * the channel and of the board, and whether the recipient may still open the board.
 */
@Component
class NotificationDelivery(
    private val deliveries: NotificationDeliveries,
    private val notifications: Notifications,
    private val channels: NotificationChannels,
    private val service: NotificationService,
    private val messages: NotificationMessages,
    private val email: EmailTransport,
    private val webhooks: WebhookSender,
    private val properties: NotificationProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    /** Messages taken at once; tests make it small. */
    internal var batchSize = BATCH_SIZE

    @Scheduled(cron = "\${codraw.notifications.delivery.cron}")
    fun run() {
        val sent = deliverDue()
        if (sent > 0) log.debug("Notification delivery handled {} messages", sent)
    }

    /** Sends the messages that are due now, batch after batch; returns how many it handled. */
    fun deliverDue(): Int {
        var total = 0
        do {
            val now = now()
            val batch = deliveries.claim(now, now + LEASE, batchSize)
            // A slow mail server or chat holds up only its own messages: each one goes on a thread of its own.
            Executors.newVirtualThreadPerTaskExecutor().use { executor ->
                batch.forEach { delivery -> executor.submit { deliver(delivery) } }
            }
            total += batch.size
        } while (batch.size == batchSize)
        return total
    }

    private fun deliver(delivery: ClaimedDelivery) {
        try {
            attempt(delivery)
        } catch (exception: RuntimeException) {
            // Whatever went wrong, the message stays in the queue and is tried again once its lease ends.
            log.warn("Notification delivery {} failed", delivery.id, exception)
        }
    }

    private fun attempt(delivery: ClaimedDelivery) {
        // Gone with its notification or its channel meanwhile: the row of the message went with them.
        val stored = notifications.find(delivery.notificationId) ?: return
        val channel = channels.findById(delivery.channelId) ?: return
        val tag = channel.kind.value
        val event = NotificationEvent.of(stored.kind)
        val skipped = when {
            stored.readAt != null -> DeliveryReason.READ
            !channel.active || event !in channel.events || channels.muted(stored.userId, stored.board.id!!) ->
                DeliveryReason.SETTINGS
            else -> null
        }
        val notification = service.view(stored)
        // A refusal of access is what the user waits for, and tells nothing of the board; anything else needs access.
        val reason = skipped ?: DeliveryReason.NO_ACCESS.takeIf {
            !notification.access && stored.kind != NotificationKind.ACCESS_DECLINED
        }
        if (reason != null) {
            deliveries.finish(delivery.id, DeliveryStatus.SKIPPED, reason, now())
            metrics.notificationDelivery(tag, DeliveryResult.SKIPPED)
            return
        }
        val message = messages.of(notification)
        try {
            when (channel.kind) {
                ChannelKind.EMAIL -> email.send(messages.email(channel.address, message, event))
                ChannelKind.WEBHOOK -> webhooks.send(channel.address, messages.chat(message))
            }
        } catch (exception: DeliveryException) {
            failed(delivery, channel, exception)
            return
        }
        val now = now()
        deliveries.finish(delivery.id, DeliveryStatus.SENT, null, now)
        channels.delivered(channel.id, now)
        metrics.notificationDelivery(tag, DeliveryResult.SENT)
    }

    private fun failed(delivery: ClaimedDelivery, channel: NotificationChannel, exception: DeliveryException) {
        val now = now()
        val reason = DeliveryReason.of(exception.error)
        channels.failed(channel.id, exception.error, now)
        val tag = channel.kind.value
        if (exception.error == DeliveryError.REJECTED || delivery.attempts >= properties.delivery.maxAttempts) {
            log.info("Notification delivery {} to {} failed: {}", delivery.id, tag, exception.message)
            deliveries.finish(delivery.id, DeliveryStatus.FAILED, reason, now)
            metrics.notificationDelivery(tag, DeliveryResult.FAILED)
        } else {
            deliveries.retry(delivery.id, reason, now + backoff(delivery.attempts))
            metrics.notificationDelivery(tag, DeliveryResult.RETRIED)
        }
    }

    // PostgreSQL stores microseconds, so truncate to compare exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    companion object {
        const val BATCH_SIZE = 20

        /** How long other instances leave a message alone that one instance is sending. */
        val LEASE: Duration = Duration.ofMinutes(2)

        /** The pause after the failed attempt number [attempt]: 1, 5 and 25 minutes, then 2 hours. */
        fun backoff(attempt: Int): Duration {
            var pause = Duration.ofMinutes(1)
            repeat(attempt - 1) { pause = minOf(pause.multipliedBy(5), MAX_BACKOFF) }
            return pause
        }

        private val MAX_BACKOFF: Duration = Duration.ofHours(2)
    }
}
