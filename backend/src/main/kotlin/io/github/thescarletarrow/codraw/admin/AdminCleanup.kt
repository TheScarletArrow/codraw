package io.github.thescarletarrow.codraw.admin

import io.github.thescarletarrow.codraw.feedback.FeedbackRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Clock

/** Deletes entries of the journal of administrators, closed reports and closed feedback older than the retention. */
@Component
class AdminCleanup(
    private val actions: AdminActions,
    private val reports: BoardReports,
    private val feedback: FeedbackRepository,
    private val properties: AdminProperties,
    private val clock: Clock,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    /** Rows deleted by one statement; tests make it small. */
    internal var batchSize = BATCH_SIZE

    @Scheduled(cron = "\${codraw.admin.cleanup-cron}")
    fun run() {
        val result = cleanUp()
        if (result.actions > 0 || result.reports > 0 || result.feedback > 0) {
            log.info(
                "Admin cleanup deleted {} entries of the journal, {} closed reports and {} closed feedback",
                result.actions,
                result.reports,
                result.feedback,
            )
        }
    }

    fun cleanUp(): Result {
        val before = clock.instant() - properties.retention
        return Result(
            actions = inBatches { actions.deleteCreatedBefore(before, batchSize) },
            reports = inBatches { reports.deleteResolvedBefore(before, batchSize) },
            feedback = inBatches { feedback.deleteResolvedBefore(before, batchSize) },
        )
    }

    /** Each batch is a statement of its own, so a large cleanup holds no long locks. */
    private fun inBatches(deleteBatch: () -> Int): Int {
        var total = 0
        do {
            val deleted = deleteBatch()
            total += deleted
        } while (deleted == batchSize)
        return total
    }

    data class Result(val actions: Int, val reports: Int, val feedback: Int)

    companion object {
        const val BATCH_SIZE = 500
    }
}
