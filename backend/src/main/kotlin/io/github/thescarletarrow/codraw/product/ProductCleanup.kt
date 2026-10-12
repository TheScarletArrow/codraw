package io.github.thescarletarrow.codraw.product

import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.LocalDate

/**
 * Deletes the days of activity of users, the days of changes of boards and the counts of a day once they are older than
 * [RETENTION_DAYS]. Deleted accounts, guests removed by their cleanup and boards deleted for good take their days with
 * them at once.
 */
@Component
class ProductCleanup(private val jdbc: JdbcClient, private val clock: Clock) {

    private val log = LoggerFactory.getLogger(javaClass)

    /** Rows deleted by one statement; tests make it small. */
    internal var batchSize = BATCH_SIZE

    @Scheduled(cron = "0 29 * * * *")
    fun run() {
        val result = cleanUp()
        if (result.users > 0 || result.boards > 0 || result.counts > 0) {
            log.info(
                "Product cleanup deleted {} days of activity of users, {} days of changes of boards and {} counts of a day",
                result.users,
                result.boards,
                result.counts,
            )
        }
    }

    fun cleanUp(): Result {
        val before = LocalDate.now(clock).minusDays(RETENTION_DAYS)
        return Result(
            users = inBatches { deleteOld("user_activity_days", "user_id, day", before) },
            boards = inBatches { deleteOld("board_activity_days", "board_id, day", before) },
            counts = inBatches { deleteOld("product_daily_counts", "day, kind", before) },
        )
    }

    /** Deletes up to [batchSize] rows of the [table] with a day before [before]; its primary key is [key]. */
    private fun deleteOld(table: String, key: String, before: LocalDate): Int = jdbc.sql(
        "DELETE FROM $table WHERE ($key) IN (SELECT $key FROM $table WHERE day < :before LIMIT :limit)",
    )
        .param("before", before)
        .param("limit", batchSize)
        .update()

    /** Each batch is a statement of its own, so a large cleanup holds no long locks. */
    private fun inBatches(deleteBatch: () -> Int): Int {
        var total = 0
        do {
            val deleted = deleteBatch()
            total += deleted
        } while (deleted == batchSize)
        return total
    }

    data class Result(val users: Int, val boards: Int, val counts: Int)

    companion object {
        /**
         * How long the days are kept. The statistics read days up to 34 days back: the days 7 to 13 after the creation of
         * the accounts of the oldest weekly cohort, created 35 to 41 days ago; the periods of 28 days need 27. Six weeks
         * keep that with a week to spare. It is fixed here rather than a setting: the statistics are defined by it, and
         * the privacy policy names it.
         */
        const val RETENTION_DAYS = 42L

        const val BATCH_SIZE = 500
    }
}
