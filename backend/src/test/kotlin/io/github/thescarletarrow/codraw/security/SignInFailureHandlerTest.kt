package io.github.thescarletarrow.codraw.security

import io.github.thescarletarrow.codraw.user.CodrawOAuth2UserService
import io.github.thescarletarrow.codraw.user.CodrawOidcUserService
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.core.AuthenticationException
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import kotlin.test.assertEquals

class SignInFailureHandlerTest {

    @Test
    fun `tells a blocked user so on the login page`() {
        assertEquals("/login?blocked", redirectAfter(OAuth2AuthenticationException(OAuth2Error(CodrawOAuth2UserService.BLOCKED))))
    }

    @Test
    fun `tells a user whom a corporate provider does not admit so on the login page`() {
        assertEquals("/login?error=denied", redirectAfter(OAuth2AuthenticationException(OAuth2Error(CodrawOidcUserService.ACCESS_DENIED))))
    }

    @Test
    fun `sends any other failure to the login page with an error`() {
        assertEquals("/login?error", redirectAfter(OAuth2AuthenticationException(OAuth2Error("invalid_token_response"))))
        assertEquals("/login?error", redirectAfter(BadCredentialsException("no")))
    }

    private fun redirectAfter(exception: AuthenticationException): String? {
        val response = MockHttpServletResponse()
        SignInFailureHandler().onAuthenticationFailure(MockHttpServletRequest(), response, exception)
        return response.redirectedUrl
    }
}
