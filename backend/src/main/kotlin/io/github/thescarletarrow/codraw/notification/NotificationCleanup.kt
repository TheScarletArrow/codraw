package io.github.thescarletarrow.codraw.notification

import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Duration

@ConfigurationProperties("codraw.notifications")
data class NotificationProperties(
    /** A notification is deleted once it is this old, read or not. */
    val retention: Duration = Duration.ofDays(90),
    /** The owner of a board gets at most one notification about a request to review an element within this time. */
    val reviewRequestInterval: Duration = Duration.ofMinutes(10),
)

/**
 * Deletes notifications older than the retention. Their number per user is kept within the limit as they come, but a
 * user to whom nothing comes any more would keep old ones for ever.
 */
@Component
class NotificationCleanup(
    private val notifications: Notifications,
    private val properties: NotificationProperties,
    private val clock: Clock,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    /** Rows deleted by one statement; tests make it small. */
    internal var batchSize = BATCH_SIZE

    @Scheduled(cron = "\${codraw.notifications.cleanup-cron}")
    fun run() {
        val deleted = cleanUp()
        if (deleted > 0) log.info("Notification cleanup deleted {} notifications", deleted)
    }

    /** Deletes the notifications created before the retention; returns how many. */
    fun cleanUp(): Int {
        val before = clock.instant() - properties.retention
        var total = 0
        // Each batch is a statement of its own, so a large cleanup holds no long locks.
        do {
            val deleted = notifications.deleteCreatedBefore(before, batchSize)
            total += deleted
        } while (deleted == batchSize)
        return total
    }

    companion object {
        const val BATCH_SIZE = 500
    }
}
