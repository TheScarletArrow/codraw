package io.github.thescarletarrow.codraw.password

import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.MutableClock
import org.junit.jupiter.api.Test
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PasswordLimiterTest {

    private val clock = MutableClock()
    private val limiter = PasswordLimiter(
        LimitProperties(passwordFailuresPerAddressPerHour = 3, passwordFailuresPerLoginPerHour = 2, signUpsPerAddressPerHour = 2),
        clock,
    )

    @Test
    fun `stops attempts at a login that failed as many times as the limit, from any address`() {
        limiter.failed("203.0.113.1", "alice")
        assertNull(limiter.waitBeforeAttempt("203.0.113.2", "alice"))
        limiter.failed("203.0.113.2", "alice")

        assertEquals(Duration.ofHours(1), limiter.waitBeforeAttempt("203.0.113.3", "alice"))
        assertNull(limiter.waitBeforeAttempt("203.0.113.3", "bob"))

        clock.advance(Duration.ofHours(1))
        assertNull(limiter.waitBeforeAttempt("203.0.113.3", "alice"))
    }

    @Test
    fun `stops attempts from a network that failed as many times as the limit, at any login`() {
        limiter.failed("2001:db8::1", "alice")
        limiter.failed("2001:db8::2", "bob")
        clock.advance(Duration.ofMinutes(20))
        limiter.failed("2001:db8::3", "carol")

        assertEquals(Duration.ofMinutes(40), limiter.waitBeforeAttempt("2001:db8::4", "dave"))
        assertNull(limiter.waitBeforeAttempt("2001:db9::1", "dave"))
    }

    @Test
    fun `does not count checks, only failures`() {
        repeat(10) { assertNull(limiter.waitBeforeAttempt("203.0.113.1", "alice")) }
    }

    @Test
    fun `counts registrations from a network`() {
        assertNull(limiter.acquireSignUp("203.0.113.1"))
        assertNull(limiter.acquireSignUp("203.0.113.1"))
        assertEquals(Duration.ofHours(1), limiter.acquireSignUp("203.0.113.1"))
        assertNull(limiter.acquireSignUp("203.0.113.2"))
    }
}
