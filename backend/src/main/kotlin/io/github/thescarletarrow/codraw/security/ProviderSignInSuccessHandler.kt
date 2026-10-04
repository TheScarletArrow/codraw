package io.github.thescarletarrow.codraw.security

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.core.Authentication
import org.springframework.security.web.authentication.AuthenticationSuccessHandler
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler
import java.time.Duration

/**
 * Opens the app after a sign-in through a provider. A guest who signs in keeps the session, but not the long
 * lifetime of guest sessions: the session gets the usual [sessionTimeout].
 */
class ProviderSignInSuccessHandler(private val sessionTimeout: Duration) : AuthenticationSuccessHandler {

    private val openApp = SimpleUrlAuthenticationSuccessHandler("/").apply { setAlwaysUseDefaultTargetUrl(true) }

    override fun onAuthenticationSuccess(request: HttpServletRequest, response: HttpServletResponse, authentication: Authentication) {
        request.getSession(false)?.maxInactiveInterval = sessionTimeout.toSeconds().toInt()
        openApp.onAuthenticationSuccess(request, response, authentication)
    }
}
