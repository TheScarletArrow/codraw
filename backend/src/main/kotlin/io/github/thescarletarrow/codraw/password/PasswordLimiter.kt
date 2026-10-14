package io.github.thescarletarrow.codraw.password

import io.github.thescarletarrow.codraw.AddressRateLimiter
import io.github.thescarletarrow.codraw.LimitProperties
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Duration

/**
 * Counts failed attempts to sign in with a password, from each network (AddressRateLimiter.networkOf) and at each login
 * from any address, and registrations from each network, in windows of an hour. Successful sign-ins are not counted: an
 * office behind one address signs in all at once in the morning. The counts live in the memory of this instance of the
 * backend.
 */
@Component
class PasswordLimiter(limits: LimitProperties, clock: Clock) {

    private val failuresByNetwork =
        AddressRateLimiter(Duration.ofHours(1), { limits.passwordFailuresPerAddressPerHour }, clock)
    private val failuresByLogin = AddressRateLimiter(Duration.ofHours(1), { limits.passwordFailuresPerLoginPerHour }, clock)
    private val signUps = AddressRateLimiter(Duration.ofHours(1), { limits.signUpsPerAddressPerHour }, clock)

    /**
     * How long an attempt from [address] at the [login] (normalized) has to wait, because the network or the login failed
     * as many times in the current window as the limit allows; `null` when it may try.
     */
    fun waitBeforeAttempt(address: String, login: String): Duration? =
        listOfNotNull(failuresByNetwork.waitFor(AddressRateLimiter.networkOf(address)), failuresByLogin.waitFor(login))
            .maxOrNull()

    /** Counts a failed attempt from [address] at the [login] (normalized). */
    fun failed(address: String, login: String) {
        failuresByNetwork.acquire(AddressRateLimiter.networkOf(address))
        failuresByLogin.acquire(login)
    }

    /**
     * Counts a registration from [address]. Returns `null` when it may go on, or how long the address has to wait when its
     * network registered as many accounts in the current window as the limit allows.
     */
    fun acquireSignUp(address: String): Duration? = signUps.acquire(AddressRateLimiter.networkOf(address))
}
