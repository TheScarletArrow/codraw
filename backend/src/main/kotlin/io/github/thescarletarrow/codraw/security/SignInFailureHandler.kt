package io.github.thescarletarrow.codraw.security

import io.github.thescarletarrow.codraw.user.CodrawOAuth2UserService
import io.github.thescarletarrow.codraw.user.CodrawOidcUserService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.core.AuthenticationException
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.web.authentication.AuthenticationFailureHandler
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler

/**
 * Opens the login page after a failed sign-in through a provider: with `?blocked` for a user whom an administrator
 * blocked, with `?error=denied` for a user whom a corporate provider does not admit, with `?error` for anything else.
 */
class SignInFailureHandler : AuthenticationFailureHandler {

    private val blocked = SimpleUrlAuthenticationFailureHandler("/login?blocked")
    private val denied = SimpleUrlAuthenticationFailureHandler("/login?error=denied")
    private val failed = SimpleUrlAuthenticationFailureHandler("/login?error")

    override fun onAuthenticationFailure(request: HttpServletRequest, response: HttpServletResponse, exception: AuthenticationException) {
        val handler = when ((exception as? OAuth2AuthenticationException)?.error?.errorCode) {
            CodrawOAuth2UserService.BLOCKED -> blocked
            CodrawOidcUserService.ACCESS_DENIED -> denied
            else -> failed
        }
        handler.onAuthenticationFailure(request, response, exception)
    }
}
