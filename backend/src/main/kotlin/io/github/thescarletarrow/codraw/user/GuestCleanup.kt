package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.CodrawMetrics
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

@ConfigurationProperties("codraw.guests")
data class GuestProperties(
    /** A board of a guest who can no longer come back is deleted once nobody worked on it for this long. */
    val boardRetention: Duration = Duration.ofDays(30),
)

/**
 * Deletes guests who can no longer come back and the boards that nobody works on any more. A guest signs in through
 * their session only: once it has expired, the guest is gone. Their boards stay while participants keep opening them
 * through their links; the guest goes when no board is left.
 */
@Component
class GuestCleanup(
    private val jdbc: JdbcClient,
    private val properties: GuestProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    /** Rows deleted by one statement; tests make it small. */
    internal var batchSize = BATCH_SIZE

    @Scheduled(cron = "\${codraw.guests.cleanup-cron}")
    fun run() {
        val result = cleanUp()
        if (result.boards > 0 || result.guests > 0) {
            log.info("Guest cleanup deleted {} boards and {} guests", result.boards, result.guests)
        }
    }

    /** Deletes the abandoned boards of gone guests, then the gone guests without boards. */
    fun cleanUp(): Result {
        val now = clock.instant()
        val boards = inBatches { deleteAbandonedBoards(now) }
        val guests = inBatches { deleteGoneGuests(now) }
        metrics.guestCleanupDeleted(boards = boards, guests = guests)
        return Result(boards = boards, guests = guests)
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

    private fun deleteAbandonedBoards(now: Instant): Int = jdbc.sql(
        """
        DELETE FROM boards WHERE id IN (
            SELECT b.id FROM boards b JOIN users u ON u.id = b.owner_id
            WHERE $GONE_GUEST
              AND b.deleted_at IS NULL
              AND b.updated_at < :activeBefore
              AND NOT EXISTS (SELECT 1 FROM board_visits v WHERE v.board_id = b.id AND v.visited_at >= :activeBefore)
            LIMIT :batchSize
        )
        """,
    )
        .gone(now)
        .param("activeBefore", (now - properties.boardRetention).atOffset(ZoneOffset.UTC))
        .update()

    private fun deleteGoneGuests(now: Instant): Int = jdbc.sql(
        """
        DELETE FROM users WHERE id IN (
            SELECT u.id FROM users u
            WHERE $GONE_GUEST AND NOT EXISTS (SELECT 1 FROM boards b WHERE b.owner_id = u.id)
            LIMIT :batchSize
        )
        """,
    )
        .gone(now)
        .update()

    private fun JdbcClient.StatementSpec.gone(now: Instant) = this
        .param("guest", ProviderProfile.GUEST)
        .param("createdBefore", (now - GRACE_PERIOD).atOffset(ZoneOffset.UTC))
        .param("nowMillis", now.toEpochMilli())
        .param("batchSize", batchSize)

    data class Result(val boards: Int, val guests: Int)

    companion object {
        const val BATCH_SIZE = 500

        /**
         * A new guest is left alone: their session is stored at the end of the request that created them, and a cleanup
         * running meanwhile would take them for gone.
         */
        val GRACE_PERIOD: Duration = Duration.ofDays(1)

        /** A guest who has no live session, where Spring Session keeps their id as the principal name. */
        private const val GONE_GUEST = """
            u.provider = :guest AND u.created_at < :createdBefore
              AND NOT EXISTS (
                  SELECT 1 FROM spring_session s WHERE s.principal_name = u.id::text AND s.expiry_time > :nowMillis
              )
        """
    }
}
