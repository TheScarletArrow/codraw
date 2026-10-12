package io.github.thescarletarrow.codraw.product

import io.github.thescarletarrow.codraw.user.ProviderProfile
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneOffset

/** Users with a day of activity in the last [days] days: accounts and guests apart. */
data class ActiveUsers(val days: Int, val accounts: Int, val guests: Int)

/** What happened in the last [days] days. */
data class PeriodStats(
    val days: Int,
    /** Accounts, not guests, created in the period that still exist. */
    val newAccounts: Int,
    /** Guests who signed in with a provider in their session. */
    val guestConversions: Int,
    /** Boards with changes of users on at least one day of the period. */
    val editedBoards: Int,
    /** Of those, boards that at least two users could edit at the same time on a day they changed. */
    val coEditedBoards: Int,
)

/** Accounts created from [from] to [to], and how many of them came back 7 to 13 days after the day they were created. */
data class Cohort(
    val from: LocalDate,
    val to: LocalDate,
    val accounts: Int,
    val returned: Int,
    /** Whether days of activity were collected for all the days that tell whether its accounts came back. */
    val complete: Boolean,
)

/**
 * The statistics of the installation on [date] (UTC). A period of N days is [date] and the N − 1 days before it. Deleted
 * accounts, guests removed by their cleanup and boards deleted for good count nowhere: their days go with them.
 */
data class ProductStats(
    val date: LocalDate,
    /** The first day with a day of activity of anybody; `null` while there is none. */
    val collectedSince: LocalDate?,
    /** For 1, 7 and 28 days. */
    val activeUsers: List<ActiveUsers>,
    /** For 7 and 28 days. */
    val periods: List<PeriodStats>,
    /** The four weekly cohorts of new accounts, the latest first. */
    val cohorts: List<Cohort>,
)

/** Computes the statistics of the installation from the days that [ProductActivity] wrote and the users. */
@Service
class ProductStatistics(private val jdbc: JdbcClient, private val clock: Clock) {

    fun compute(): ProductStats = compute(LocalDate.now(clock))

    fun compute(date: LocalDate): ProductStats {
        val collectedSince = jdbc.sql("SELECT min(day) AS since FROM user_activity_days WHERE day <= :date")
            .param("date", date)
            .query { rs, _ -> rs.getObject("since", LocalDate::class.java) }
            .list()
            .firstOrNull()
        return ProductStats(
            date = date,
            collectedSince = collectedSince,
            activeUsers = ACTIVE_PERIODS.map { days -> activeUsers(date, days) },
            periods = PERIODS.map { days -> period(date, days) },
            cohorts = (1..COHORTS).map { index -> cohort(date, index, collectedSince) },
        )
    }

    private fun activeUsers(date: LocalDate, days: Int): ActiveUsers = jdbc.sql(
        """
        SELECT count(DISTINCT a.user_id) FILTER (WHERE u.provider <> :guest) AS accounts,
               count(DISTINCT a.user_id) FILTER (WHERE u.provider = :guest) AS guests
        FROM user_activity_days a JOIN users u ON u.id = a.user_id
        WHERE a.day BETWEEN :from AND :date
        """,
    )
        .param("guest", ProviderProfile.GUEST)
        .param("from", firstDay(date, days))
        .param("date", date)
        .query { rs, _ -> ActiveUsers(days = days, accounts = rs.getInt("accounts"), guests = rs.getInt("guests")) }
        .single()

    private fun period(date: LocalDate, days: Int): PeriodStats {
        val from = firstDay(date, days)
        return jdbc.sql(
            """
            SELECT
                (SELECT count(*) FROM users
                 WHERE provider <> :guest AND created_at >= :fromInstant AND created_at < :untilInstant) AS new_accounts,
                (SELECT coalesce(sum(count), 0) FROM product_daily_counts
                 WHERE kind = :conversion AND day BETWEEN :from AND :date) AS guest_conversions,
                (SELECT count(DISTINCT board_id) FROM board_activity_days
                 WHERE day BETWEEN :from AND :date) AS edited_boards,
                (SELECT count(DISTINCT board_id) FROM board_activity_days
                 WHERE co_edited AND day BETWEEN :from AND :date) AS co_edited_boards
            """,
        )
            .param("guest", ProviderProfile.GUEST)
            .param("conversion", DailyCount.GUEST_CONVERSION.name)
            .param("from", from)
            .param("date", date)
            .param("fromInstant", startOf(from))
            .param("untilInstant", startOf(date.plusDays(1)))
            .query { rs, _ ->
                PeriodStats(
                    days = days,
                    newAccounts = rs.getInt("new_accounts"),
                    guestConversions = rs.getInt("guest_conversions"),
                    editedBoards = rs.getInt("edited_boards"),
                    coEditedBoards = rs.getInt("co_edited_boards"),
                )
            }
            .single()
    }

    /**
     * The cohort [index], 1 for the latest: accounts created from 13 + 7 × [index] to 7 + 7 × [index] days before [date],
     * so that the days 7 to 13 after the creation of each of them are over.
     */
    private fun cohort(date: LocalDate, index: Int, collectedSince: LocalDate?): Cohort {
        val from = date.minusDays(13L + 7 * index)
        val to = date.minusDays(7L + 7 * index)
        return jdbc.sql(
            """
            SELECT count(*) AS accounts,
                   count(*) FILTER (WHERE EXISTS (
                       SELECT 1 FROM user_activity_days a
                       WHERE a.user_id = u.id
                         AND a.day BETWEEN (u.created_at AT TIME ZONE 'UTC')::date + :firstDay
                                       AND (u.created_at AT TIME ZONE 'UTC')::date + :lastDay
                   )) AS returned
            FROM users u
            WHERE u.provider <> :guest AND u.created_at >= :fromInstant AND u.created_at < :untilInstant
            """,
        )
            .param("guest", ProviderProfile.GUEST)
            .param("firstDay", RETURN_FIRST_DAY)
            .param("lastDay", RETURN_LAST_DAY)
            .param("fromInstant", startOf(from))
            .param("untilInstant", startOf(to.plusDays(1)))
            .query { rs, _ ->
                Cohort(
                    from = from,
                    to = to,
                    accounts = rs.getInt("accounts"),
                    returned = rs.getInt("returned"),
                    complete = collectedSince != null && !collectedSince.isAfter(from.plusDays(RETURN_FIRST_DAY.toLong())),
                )
            }
            .single()
    }

    /** The first day of the period of [days] days that ends with [date]. */
    private fun firstDay(date: LocalDate, days: Int): LocalDate = date.minusDays(days - 1L)

    private fun startOf(day: LocalDate) = day.atStartOfDay().atOffset(ZoneOffset.UTC)

    companion object {
        /** Periods of the active users, in days. */
        val ACTIVE_PERIODS = listOf(1, 7, 28)

        /** Periods of the rest, in days. */
        val PERIODS = listOf(7, 28)

        /** Weekly cohorts of new accounts. */
        const val COHORTS = 4

        /** An account came back in its first week with a day of activity from this day after the day it was created… */
        const val RETURN_FIRST_DAY = 7

        /** …to this one. */
        const val RETURN_LAST_DAY = 13
    }
}
