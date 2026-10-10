package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.session.security.web.authentication.SpringSessionRememberMeServices
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Duration

@RestController
class GuestLoginController(
    private val users: UserService,
    private val limiter: NewGuestLimiter,
    private val metrics: CodrawMetrics,
) {

    /**
     * Continues without a provider as a new guest. A request that already has a session keeps it. An address that
     * created as many guests in the last hour as the limit allows gets 429.
     */
    @PostMapping(PATH)
    fun login(authentication: Authentication?, request: HttpServletRequest, response: HttpServletResponse): ResponseEntity<*> {
        if (authentication == null) {
            limiter.acquire(request.remoteAddr)?.let { wait -> return tooManyGuests(wait) }
            val language = Language.ofAcceptLanguage(request.getHeader(HttpHeaders.ACCEPT_LANGUAGE))
            signInToSession(users.createGuest(language), ProviderProfile.GUEST, request, response)
            request.getSession(false)!!.maxInactiveInterval = SESSION_TIMEOUT.toSeconds().toInt()
            // Spring Session makes the session cookie persistent, so that the guest comes back after closing the browser.
            request.setAttribute(SpringSessionRememberMeServices.REMEMBER_ME_LOGIN_ATTR, true)
        }
        return ResponseEntity.noContent().build<Void>()
    }

    private fun tooManyGuests(wait: Duration): ResponseEntity<ProblemDetail> {
        metrics.limitReached(Limit.GUESTS)
        val problem = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, "Too many new guests from this address")
        // Whole seconds, rounded up: the client must not come back before the window ends.
        val seconds = (wait.toMillis() + 999) / 1000
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .header(HttpHeaders.RETRY_AFTER, seconds.toString())
            .body(problem)
    }

    companion object {
        const val PATH = "/api/guest"
        val SESSION_TIMEOUT: Duration = Duration.ofDays(30)
    }
}
