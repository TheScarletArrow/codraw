package io.github.thescarletarrow.codraw.security

import io.github.thescarletarrow.codraw.user.CodrawOAuth2UserService
import io.github.thescarletarrow.codraw.user.CodrawOidcUserService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
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
            else -> failed.also {
                // The operator finds here why a provider turned the sign-in away, e.g. a callback address it does not know.
                log.info("A sign-in at {} failed: {}", request.requestURI, exception.message)
            }
        }
        handler.onAuthenticationFailure(request, response, exception)
    }

    private companion object {
        private val log = LoggerFactory.getLogger(SignInFailureHandler::class.java)
    }
}
