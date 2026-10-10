package io.github.thescarletarrow.codraw.security

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler
import org.springframework.web.servlet.support.ServletUriComponentsBuilder
import org.springframework.web.util.UriComponentsBuilder
import tools.jackson.databind.json.JsonMapper

/**
 * Answers a sign-out with 204, or, for a user of a provider of OpenID Connect that signs out at the provider too, with
 * the address of the page of the provider that ends its session and comes back to the login page (RP-initiated logout).
 * The SPA signs out with `fetch`, so it goes there itself: a redirect would not take the browser along.
 */
class ProviderLogoutSuccessHandler(private val registrations: CodrawClientRegistrations) : LogoutSuccessHandler {

    private val json = JsonMapper.builder().build()

    override fun onLogoutSuccess(request: HttpServletRequest, response: HttpServletResponse, authentication: Authentication?) {
        val logoutUrl = (authentication as? OAuth2AuthenticationToken)?.let { logoutUrl(request, it) }
        if (logoutUrl == null) {
            response.status = HttpStatus.NO_CONTENT.value()
            return
        }
        response.status = HttpStatus.OK.value()
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        json.writeValue(response.outputStream, mapOf("logoutUrl" to logoutUrl))
    }

    private fun logoutUrl(request: HttpServletRequest, authentication: OAuth2AuthenticationToken): String? {
        val registrationId = authentication.authorizedClientRegistrationId
        if (registrations.oidcProvider(registrationId)?.logout != true) return null
        val user = authentication.principal as? OidcUser ?: return null
        val registration = registrations.findByRegistrationId(registrationId) ?: return null
        val endSession = registration.providerDetails.configurationMetadata["end_session_endpoint"] as? String ?: return null
        val loginPage = ServletUriComponentsBuilder.fromContextPath(request).path("/login").build().toUriString()
        return UriComponentsBuilder.fromUriString(endSession)
            .queryParam("id_token_hint", user.idToken.tokenValue)
            .queryParam("client_id", registration.clientId)
            .queryParam("post_logout_redirect_uri", loginPage)
            .encode()
            .build()
            .toUriString()
    }
}
