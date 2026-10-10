package io.github.thescarletarrow.codraw.security

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.filter.OncePerRequestFilter

/**
 * Sends a sign-in through a provider that is off, or of OpenID Connect whose metadata cannot be read, back to the login
 * page with an error. Without it the redirect filter of Spring Security answers 500.
 */
class SignInProviderFailureFilter(private val registrations: CodrawClientRegistrations) : OncePerRequestFilter() {

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val registrationId = request.requestURI.removePrefix(request.contextPath).removePrefix(AUTHORIZATION_PATH)
        if (registrations.findByRegistrationId(registrationId) == null) {
            response.sendRedirect("/login?error")
            return
        }
        chain.doFilter(request, response)
    }

    override fun shouldNotFilter(request: HttpServletRequest): Boolean =
        !request.requestURI.removePrefix(request.contextPath).startsWith(AUTHORIZATION_PATH)

    companion object {
        const val AUTHORIZATION_BASE_URI = "/api/oauth2/authorization"
        private const val AUTHORIZATION_PATH = "$AUTHORIZATION_BASE_URI/"
    }
}
