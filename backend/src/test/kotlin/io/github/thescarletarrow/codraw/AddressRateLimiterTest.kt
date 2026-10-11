package io.github.thescarletarrow.codraw

import org.junit.jupiter.api.Test
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class AddressRateLimiterTest {

    private val clock = MutableClock()

    @Test
    fun `lets as many requests of a key through in a window as the limit, then the next window`() {
        val limiter = AddressRateLimiter(Duration.ofHours(1), { 2 }, clock)

        assertNull(limiter.acquire("203.0.113.5"))
        assertNull(limiter.acquire("203.0.113.5"))
        assertEquals(Duration.ofHours(1), limiter.acquire("203.0.113.5"))
        assertNull(limiter.acquire("203.0.113.6"))

        clock.advance(Duration.ofMinutes(45))
        assertEquals(Duration.ofMinutes(15), limiter.acquire("203.0.113.5"))
        clock.advance(Duration.ofMinutes(15))
        assertNull(limiter.acquire("203.0.113.5"))
    }

    @Test
    fun `counts an IPv6 address by its network of 64 bits, and an IPv4 address by itself`() {
        assertEquals("2001:db8:1:2:0:0:0:0/64", AddressRateLimiter.networkOf("2001:db8:1:2:aaaa:bbbb:cccc:dddd"))
        assertEquals("2001:db8:1:2:0:0:0:0/64", AddressRateLimiter.networkOf("2001:db8:1:2::1"))
        assertEquals("2001:db8:1:3:0:0:0:0/64", AddressRateLimiter.networkOf("2001:db8:1:3::1"))
        assertEquals("203.0.113.5", AddressRateLimiter.networkOf("203.0.113.5"))
        assertEquals("203.0.113.5", AddressRateLimiter.networkOf("::ffff:203.0.113.5"))
        assertEquals("not an address", AddressRateLimiter.networkOf("not an address"))

        val limiter = AddressRateLimiter(Duration.ofHours(1), { 1 }, clock)
        assertNull(limiter.acquire(AddressRateLimiter.networkOf("2001:db8::1")))
        assertNotNull(limiter.acquire(AddressRateLimiter.networkOf("2001:db8::2")))
    }

    @Test
    fun `holds at most as many keys as it can, and takes new ones again once their windows end`() {
        val limiter = AddressRateLimiter(Duration.ofMinutes(1), { 1 }, clock)
        repeat(AddressRateLimiter.MAX_KEYS) { assertNull(limiter.acquire("key-$it")) }

        // A full limiter keeps counting the keys it holds and refuses new ones.
        assertEquals(Duration.ofMinutes(1), limiter.acquire("key-new"))
        assertEquals(Duration.ofMinutes(1), limiter.acquire("key-0"))

        clock.advance(Duration.ofMinutes(1))
        assertNull(limiter.acquire("key-new"))
        assertNull(limiter.acquire("key-0"))
    }
}
