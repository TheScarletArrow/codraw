package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.TestcontainersConfiguration
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.scheduling.config.CronTask
import org.springframework.scheduling.config.ScheduledTaskHolder
import kotlin.test.assertEquals

/** The cleanup of notifications with the schedule of the application configuration, which the other tests turn off. */
@SpringBootTest(
    properties = [
        "codraw.internal-token=${IntegrationTest.INTERNAL_TOKEN}",
        // The same as GuestCleanupScheduleTest, so that both share one application context.
        "codraw.guests.cleanup-cron=0 23 * * * *",
        "codraw.notifications.cleanup-cron=0 41 * * * *",
    ],
)
@Import(TestcontainersConfiguration::class)
class NotificationCleanupScheduleTest(@Autowired private val tasks: ScheduledTaskHolder) {

    @Test
    fun `runs the cleanup of notifications every hour`() {
        val cleanup = tasks.scheduledTasks.map { it.task }.filterIsInstance<CronTask>()
            .single { it.toString().contains(NotificationCleanup::class.java.name) }

        assertEquals("0 41 * * * *", cleanup.expression)
    }
}
