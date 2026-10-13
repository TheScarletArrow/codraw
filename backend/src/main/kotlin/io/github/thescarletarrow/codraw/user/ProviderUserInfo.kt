package io.github.thescarletarrow.codraw.user

import org.springframework.core.convert.converter.Converter
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.RequestEntity
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequestEntityConverter
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.util.LinkedMultiValueMap
import org.springframework.web.util.UriComponentsBuilder
import java.net.URI

/**
 * Reads the profile of the user at the user info endpoint of the provider. GitHub and Google answer as OAuth2 has it;
 * Яндекс ID takes the token in its own scheme `OAuth`, and VK ID takes it in a form with the client id and wraps the
 * profile in `user` (docs/adr/0015-yandex-vk-sign-in.md).
 */
fun providerUserInfo(): OAuth2UserService<OAuth2UserRequest, OAuth2User> = DefaultOAuth2UserService().apply {
    val standard = OAuth2UserRequestEntityConverter()
    setRequestEntityConverter { request ->
        when (request.clientRegistration.registrationId) {
            ProviderProfile.YANDEX -> RequestEntity.get(userInfoUri(request))
                .accept(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.AUTHORIZATION, "OAuth ${request.accessToken.tokenValue}")
                .build()
            ProviderProfile.VK -> RequestEntity.post(userInfoUri(request))
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(
                    LinkedMultiValueMap<String, String>().apply {
                        add(OAuth2ParameterNames.CLIENT_ID, request.clientRegistration.clientId)
                        add(OAuth2ParameterNames.ACCESS_TOKEN, request.accessToken.tokenValue)
                    },
                )
            else -> standard.convert(request)
        }
    }
    setAttributesConverter { request ->
        if (request.clientRegistration.registrationId == ProviderProfile.VK) Converter(::vkUser) else Converter { it }
    }
}

private fun userInfoUri(request: OAuth2UserRequest): URI {
    val uri = checkNotNull(request.clientRegistration.providerDetails.userInfoEndpoint.uri) { "No user info endpoint" }
    return UriComponentsBuilder.fromUriString(uri).build().toUri()
}

/** An answer of VK ID without a profile, e.g. an error, fails the sign-in like any other: back to the login page. */
private fun vkUser(response: Map<String, Any>): Map<String, Any> {
    @Suppress("UNCHECKED_CAST")
    return (response["user"] as? Map<String, Any>)?.takeIf { "user_id" in it }
        ?: throw OAuth2AuthenticationException(
            OAuth2Error("invalid_user_info_response", "VK ID returned no user: ${response["error"]}", null),
        )
}
