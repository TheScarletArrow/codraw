package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.AddressRateLimiter
import io.github.thescarletarrow.codraw.LimitProperties
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Duration

/**
 * Counts the guests created from each network (AddressRateLimiter.networkOf) in windows of an hour. The counts live in
 * the memory of this instance of the backend.
 */
@Component
class NewGuestLimiter(limits: LimitProperties, clock: Clock) {

    private val limiter = AddressRateLimiter(Duration.ofHours(1), { limits.guestsPerAddressPerHour }, clock)

    /**
     * Counts a new guest from [address]. Returns `null` when the guest may be created, or how long the address has to
     * wait when its network created as many guests in the current window as the limit allows.
     */
    fun acquire(address: String): Duration? = limiter.acquire(AddressRateLimiter.networkOf(address))
}
