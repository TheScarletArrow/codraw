package io.github.thescarletarrow.codraw.user

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.session.security.web.authentication.SpringSessionRememberMeServices
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Duration

@RestController
class GuestLoginController(private val users: UserService) {

    /** Continues without a provider as a new guest. A request that already has a session keeps it. */
    @PostMapping(PATH)
    fun login(authentication: Authentication?, request: HttpServletRequest, response: HttpServletResponse): ResponseEntity<Void> {
        if (authentication == null) {
            signInToSession(users.createGuest(), ProviderProfile.GUEST, request, response)
            request.getSession(false)!!.maxInactiveInterval = SESSION_TIMEOUT.toSeconds().toInt()
            // Spring Session makes the session cookie persistent, so that the guest comes back after closing the browser.
            request.setAttribute(SpringSessionRememberMeServices.REMEMBER_ME_LOGIN_ATTR, true)
        }
        return ResponseEntity.noContent().build()
    }

    companion object {
        const val PATH = "/api/guest"
        val SESSION_TIMEOUT: Duration = Duration.ofDays(30)
    }
}
