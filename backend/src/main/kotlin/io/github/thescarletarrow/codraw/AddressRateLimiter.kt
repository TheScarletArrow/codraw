package io.github.thescarletarrow.codraw

import java.net.Inet6Address
import java.net.InetAddress
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Counts the requests of each network address, or of another key such as a user, in fixed windows of [window] and lets
 * [limit] of them through in a window. The counts live in the memory of this instance of the backend, for at most
 * [MAX_KEYS] keys at once.
 */
class AddressRateLimiter(private val window: Duration, private val limit: () -> Int, private val clock: Clock) {

    private val windows = ConcurrentHashMap<String, Window>()

    @Volatile
    private var nextSweep = Instant.MIN

    /**
     * Counts a request of [address]. Returns `null` when it may go through, or how long the address has to wait when
     * it made as many requests in the current window as the limit allows, or when the limiter already counts as many
     * other keys as it can hold.
     */
    fun acquire(address: String): Duration? {
        val now = clock.instant()
        // Expired windows go at most once a second: a scan of the whole map on every request would make a flood of new
        // keys quadratic.
        if (windows.size > SWEEP_SIZE && now >= nextSweep) {
            nextSweep = now + SWEEP_INTERVAL
            windows.values.removeIf { it.end <= now }
        }
        // A full map takes no new keys rather than forgetting counted ones, which would reset their windows.
        if (windows.size >= MAX_KEYS && !windows.containsKey(address)) return window
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

    companion object {
        /** Above this many keys, expired windows are dropped. */
        private const val SWEEP_SIZE = 10_000
        private val SWEEP_INTERVAL: Duration = Duration.ofSeconds(1)

        /** The most keys that a limiter counts at once. */
        const val MAX_KEYS = 100_000

        /**
         * The network that a limit by address counts [address] in: an IPv4 address by itself, an IPv6 address by its
         * /64, which one subscriber usually gets whole; anything else as it is.
         */
        fun networkOf(address: String): String {
            if (':' !in address) return address
            val parsed = runCatching { InetAddress.ofLiteral(address) }.getOrNull() ?: return address
            if (parsed !is Inet6Address) return parsed.hostAddress
            val bytes = parsed.address.also { it.fill(0, 8, 16) }
            return InetAddress.getByAddress(bytes).hostAddress + "/64"
        }
    }
}
