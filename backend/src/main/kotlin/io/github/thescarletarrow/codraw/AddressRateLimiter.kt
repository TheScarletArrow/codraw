package io.github.thescarletarrow.codraw

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Counts the requests of each network address in fixed windows of [window] and lets [limit] of them through in a
 * window. The counts live in the memory of this instance of the backend.
 */
class AddressRateLimiter(private val window: Duration, private val limit: () -> Int, private val clock: Clock) {

    private val windows = ConcurrentHashMap<String, Window>()

    /**
     * Counts a request of [address]. Returns `null` when it may go through, or how long the address has to wait when
     * it made as many requests in the current window as the limit allows.
     */
    fun acquire(address: String): Duration? {
        val now = clock.instant()
        if (windows.size > SWEEP_SIZE) windows.values.removeIf { it.end <= now }
        var wait: Duration? = null
        windows.compute(address) { _, current ->
            val open = current?.takeIf { now < it.end } ?: Window(end = now + window, count = 0)
            if (open.count < limit()) {
                open.copy(count = open.count + 1)
            } else {
                wait = Duration.between(now, open.end)
                open
            }
        }
        return wait
    }

    private data class Window(val end: Instant, val count: Int)

    private companion object {
        /** Above this many addresses, expired windows are dropped, so that the map does not grow without bound. */
        const val SWEEP_SIZE = 10_000
    }
}
