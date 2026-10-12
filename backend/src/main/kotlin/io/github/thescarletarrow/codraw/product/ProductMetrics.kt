package io.github.thescarletarrow.codraw.product

import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Tags
import org.slf4j.LoggerFactory
import org.springframework.dao.DataAccessException
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

/**
 * The statistics of the installation as gauges for Prometheus, next to the metrics of `CodrawMetrics`. They show the
 * latest computation, which runs in the background every few minutes rather than at every scrape; until the first one,
 * and for a share of nothing, they are NaN.
 */
@Component
class ProductMetrics(private val registry: MeterRegistry, private val statistics: ProductStatistics) {

    private val log = LoggerFactory.getLogger(javaClass)

    @Volatile
    private var latest: ProductStats? = null

    init {
        for (days in ProductStatistics.ACTIVE_PERIODS) {
            val users = { stats: ProductStats -> stats.activeUsers.single { it.days == days } }
            val description = "Users with a day of activity in the period"
            gauge("codraw.product.active.users", description, period(days).and("kind", "accounts")) { users(it).accounts }
            gauge("codraw.product.active.users", description, period(days).and("kind", "guests")) { users(it).guests }
        }
        for (days in ProductStatistics.PERIODS) {
            val inPeriod = { stats: ProductStats -> stats.periods.single { it.days == days } }
            val tags = period(days)
            gauge("codraw.product.new.accounts", "Accounts created in the period", tags) { inPeriod(it).newAccounts }
            gauge("codraw.product.guest.conversions", "Guests who signed in with a provider in the period", tags) {
                inPeriod(it).guestConversions
            }
            gauge("codraw.product.edited.boards", "Boards with changes of users in the period", tags) { inPeriod(it).editedBoards }
            gauge("codraw.product.coedited.boards", "Boards edited by two users or more at the same time in the period", tags) {
                inPeriod(it).coEditedBoards
            }
            gauge("codraw.product.coedited.share", "Share of the edited boards that were edited together", tags) {
                val boards = inPeriod(it)
                if (boards.editedBoards == 0) Double.NaN else boards.coEditedBoards.toDouble() / boards.editedBoards
            }
        }
        for (index in 1..ProductStatistics.COHORTS) {
            val cohort = { stats: ProductStats -> stats.cohorts[index - 1] }
            val tags = Tags.of("cohort", index.toString())
            gauge("codraw.product.week1.retention", "Share of a weekly cohort of new accounts that came back in its first week", tags) {
                val accounts = cohort(it)
                if (!accounts.complete || accounts.accounts == 0) Double.NaN else accounts.returned.toDouble() / accounts.accounts
            }
            gauge("codraw.product.week1.cohort.accounts", "Accounts of a weekly cohort of new accounts", tags) { cohort(it).accounts }
        }
    }

    /** Computes the statistics again; a failure keeps the previous values. */
    @Scheduled(fixedDelay = REFRESH_MINUTES, timeUnit = TimeUnit.MINUTES)
    fun refresh() {
        try {
            latest = statistics.compute()
        } catch (exception: DataAccessException) {
            log.warn("Failed to compute the statistics of the installation", exception)
        }
    }

    private fun gauge(name: String, description: String, tags: Tags, value: (ProductStats) -> Number) {
        Gauge.builder(name) { latest?.let(value)?.toDouble() ?: Double.NaN }
            .description(description)
            .tags(tags)
            .register(registry)
    }

    private fun period(days: Int): Tags = Tags.of("period", "${days}d")

    companion object {
        /** How often the gauges are computed again, in minutes. */
        const val REFRESH_MINUTES = 5L
    }
}
