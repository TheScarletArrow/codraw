package io.github.thescarletarrow.codraw.security

import io.github.thescarletarrow.codraw.user.ProviderProfile
import org.springframework.security.crypto.keygen.Base64StringKeyGenerator
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest
import org.springframework.security.oauth2.client.endpoint.RestClientAuthorizationCodeTokenResponseClient
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames
import org.springframework.util.LinkedMultiValueMap
import org.springframework.web.context.request.RequestContextHolder
import org.springframework.web.context.request.ServletRequestAttributes
import java.util.Base64

/** VK ID names the device of the user in its callback and wants it back in the exchange of the code. */
private const val VK_DEVICE_ID = "device_id"

/** 32 random bytes in Base64 URL without the padding `=`. */
private val STATE = Base64StringKeyGenerator(Base64.getUrlEncoder().withoutPadding())

/**
 * The authorization requests of the providers under [baseUri]. Their `state` has no padding: Spring Security ends it
 * with `=`, which VK ID refuses, as it takes only letters, digits, `_` and `-`. The other providers take any `state`.
 */
fun signInAuthorizationRequestResolver(
    registrations: ClientRegistrationRepository,
    baseUri: String,
): OAuth2AuthorizationRequestResolver =
    DefaultOAuth2AuthorizationRequestResolver(registrations, baseUri).apply {
        setAuthorizationRequestCustomizer { it.state(STATE.generateKey()) }
    }

/**
 * Exchanges the code of a sign-in for the token. VK ID wants the `device_id` of its callback and the `state` of the
 * authorization request with the code, as its own SDK sends them; the exchange runs in the request of the callback.
 */
fun signInTokenResponseClient(): OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> =
    RestClientAuthorizationCodeTokenResponseClient().apply {
        addParametersConverter { grantRequest ->
            LinkedMultiValueMap<String, String>().apply {
                if (grantRequest.clientRegistration.registrationId == ProviderProfile.VK) {
                    callbackParameter(VK_DEVICE_ID)?.let { add(VK_DEVICE_ID, it) }
                    grantRequest.authorizationExchange.authorizationRequest.state?.let { add(OAuth2ParameterNames.STATE, it) }
                }
            }
        }
    }

private fun callbackParameter(name: String): String? =
    (RequestContextHolder.getRequestAttributes() as? ServletRequestAttributes)?.request?.getParameter(name)
