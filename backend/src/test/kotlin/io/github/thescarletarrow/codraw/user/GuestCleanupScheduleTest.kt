package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.TestcontainersConfiguration
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.scheduling.config.CronTask
import org.springframework.scheduling.config.ScheduledTaskHolder
import kotlin.test.assertEquals

/** The cleanup of guests with the schedule of the application configuration, which the other tests turn off. */
@SpringBootTest(
    properties = [
        "codraw.internal-token=${IntegrationTest.INTERNAL_TOKEN}",
        "codraw.guests.cleanup-cron=0 23 * * * *",
    ],
)
@Import(TestcontainersConfiguration::class)
class GuestCleanupScheduleTest(@Autowired private val tasks: ScheduledTaskHolder) {

    @Test
    fun `runs the cleanup of guests every hour`() {
        val cleanup = tasks.scheduledTasks.map { it.task }.filterIsInstance<CronTask>()
            .single { it.toString().contains(GuestCleanup::class.java.name) }

        assertEquals("0 23 * * * *", cleanup.expression)
    }
}
