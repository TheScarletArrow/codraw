package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.LimitProperties
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Counts the guests created from each network address in windows of an hour. The counts live in the memory of this
 * instance of the backend.
 */
@Component
class NewGuestLimiter(private val limits: LimitProperties, private val clock: Clock) {

    private val windows = ConcurrentHashMap<String, Window>()

    /**
     * Counts a new guest from [address]. Returns `null` when the guest may be created, or how long the address has to
     * wait when it created as many guests in the current window as the limit allows.
     */
    fun acquire(address: String): Duration? {
        val now = clock.instant()
        if (windows.size > SWEEP_SIZE) windows.values.removeIf { it.end <= now }
        var wait: Duration? = null
        windows.compute(address) { _, window ->
            val current = window?.takeIf { now < it.end } ?: Window(end = now + WINDOW, count = 0)
            if (current.count < limits.guestsPerAddressPerHour) {
                current.copy(count = current.count + 1)
            } else {
                wait = Duration.between(now, current.end)
                current
            }
        }
        return wait
    }

    private data class Window(val end: Instant, val count: Int)

    private companion object {
        val WINDOW: Duration = Duration.ofHours(1)

        /** Above this many addresses, expired windows are dropped, so that the map does not grow without bound. */
        const val SWEEP_SIZE = 10_000
    }
}
