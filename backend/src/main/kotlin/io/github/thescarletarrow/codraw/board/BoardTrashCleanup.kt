package io.github.thescarletarrow.codraw.board

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.ZoneOffset

/** Foreign-key cascades remove related data; ImageCleanup subsequently collects orphaned objects. */
@Component
class BoardTrashCleanup(private val jdbc: JdbcClient, private val clock: Clock) {
    @Scheduled(cron = "\${codraw.trash.cleanup-cron:0 11 * * * *}")
    fun run(): Int {
        var total = 0
        do {
            val deleted = jdbc.sql("""
                DELETE FROM boards WHERE deleted_at <= :before AND id IN (
                    SELECT id FROM boards WHERE deleted_at <= :before ORDER BY deleted_at LIMIT 500
                )
            """).param("before", clock.instant().minus(BoardService.TRASH_RETENTION).atOffset(ZoneOffset.UTC)).update()
            total += deleted
        } while (deleted == 500)
        return total
    }
}
