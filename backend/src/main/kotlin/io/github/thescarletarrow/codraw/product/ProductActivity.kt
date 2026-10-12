package io.github.thescarletarrow.codraw.product

import io.github.thescarletarrow.codraw.user.userId
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Configuration
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.stereotype.Component
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import java.time.Clock
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** A count of a day that names nobody. Stored by its name. */
enum class DailyCount {
    /** A guest signed in with a provider in their session, and what they had passed to the account. */
    GUEST_CONVERSION,
}

/**
 * Remembers for the statistics of the installation on which days (UTC) users used CoDraw and boards were edited, and
 * counts of a day that name nobody. A user or a board is written at most once a day: the ids written today stay in
 * memory until the day ends, so that nearly every request touches no table.
 */
@Component
class ProductActivity(private val jdbc: JdbcClient, private val clock: Clock) {

    private val log = LoggerFactory.getLogger(javaClass)

    /** The ids written on [day]. */
    private class Written(val day: LocalDate) {
        val users: MutableSet<UUID> = ConcurrentHashMap.newKeySet()
        val editedBoards: MutableSet<UUID> = ConcurrentHashMap.newKeySet()
        val coEditedBoards: MutableSet<UUID> = ConcurrentHashMap.newKeySet()
    }

    @Volatile
    private var written = Written(LocalDate.now(clock))

    /**
     * The session of the user [userId] made a request to the API today. A failure is logged and does not fail the
     * request: the next request of the user writes the day again.
     */
    fun userActive(userId: UUID) {
        val today = today()
        if (!today.users.add(userId)) return
        try {
            // A user deleted meanwhile has no day: the row would refer to nobody.
            jdbc.sql(
                """
                INSERT INTO user_activity_days (user_id, day)
                SELECT id, :day FROM users WHERE id = :userId
                ON CONFLICT DO NOTHING
                """,
            )
                .param("userId", userId)
                .param("day", today.day)
                .update()
        } catch (exception: DataAccessException) {
            today.users.remove(userId)
            log.warn("Failed to record a day of activity of a user", exception)
        }
    }

    /**
     * Collab stored changes of users to the document of the board [boardId] today. A failure is logged and does not fail
     * the store: the next store of the board writes the day again.
     */
    fun boardEdited(boardId: UUID) {
        try {
            recordBoard(boardId, coEdited = false)
        } catch (exception: DataAccessException) {
            log.warn("Failed to record a day of changes of board {}", boardId, exception)
        }
    }

    /**
     * At least two users had connections that may edit the document of the board [boardId] at the same time today, a day
     * on which it changed. Returns `false` when there is no such board.
     */
    fun boardCoEdited(boardId: UUID): Boolean = recordBoard(boardId, coEdited = true)

    /** Adds one to the count [kind] of today; the caller's transaction, if any, takes it. */
    fun count(kind: DailyCount) {
        jdbc.sql(
            """
            INSERT INTO product_daily_counts (day, kind, count) VALUES (:day, :kind, 1)
            ON CONFLICT (day, kind) DO UPDATE SET count = product_daily_counts.count + 1
            """,
        )
            .param("day", LocalDate.now(clock))
            .param("kind", kind.name)
            .update()
    }

    /** Writes the day of the board unless it was written today; `false` when there is no such board. */
    private fun recordBoard(boardId: UUID, coEdited: Boolean): Boolean {
        val today = today()
        val seen = if (coEdited) today.coEditedBoards else today.editedBoards
        if (!seen.add(boardId)) return true
        val rows = try {
            jdbc.sql(
                """
                INSERT INTO board_activity_days (board_id, day, co_edited)
                SELECT id, :day, :coEdited FROM boards WHERE id = :boardId
                ON CONFLICT (board_id, day) DO UPDATE SET co_edited = board_activity_days.co_edited OR EXCLUDED.co_edited
                """,
            )
                .param("boardId", boardId)
                .param("day", today.day)
                .param("coEdited", coEdited)
                .update()
        } catch (exception: DataAccessException) {
            seen.remove(boardId)
            throw exception
        }
        if (rows == 0) {
            seen.remove(boardId)
            return false
        }
        // The day of a board edited together is the day of an edited board too.
        if (coEdited) today.editedBoards.add(boardId)
        return true
    }

    /** What was written today; a new day starts with nothing written. */
    private fun today(): Written {
        val day = LocalDate.now(clock)
        val current = written
        if (current.day == day) return current
        synchronized(this) {
            if (written.day != day) written = Written(day)
            return written
        }
    }
}

/** Writes the day of activity of the signed-in user on their requests to the API; most of them write nothing. */
class ActivityInterceptor(private val activity: ProductActivity) : HandlerInterceptor {

    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        // Requests without a session have an anonymous principal, which is no user of CoDraw.
        val principal = SecurityContextHolder.getContext().authentication?.principal as? OAuth2User
        if (principal != null) activity.userActive(principal.userId)
        return true
    }
}

@Configuration(proxyBeanMethods = false)
class ActivityConfiguration(private val activity: ProductActivity) : WebMvcConfigurer {

    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(ActivityInterceptor(activity)).addPathPatterns("/api/**")
    }
}
