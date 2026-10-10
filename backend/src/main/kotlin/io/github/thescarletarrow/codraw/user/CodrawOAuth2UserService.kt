package io.github.thescarletarrow.codraw.user

import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.user.OAuth2User

/** Loads the profile from the provider on sign-in, creates or updates the user and signs in as that user. */
class CodrawOAuth2UserService(
    private val users: UserService,
    private val providerUsers: OAuth2UserService<OAuth2UserRequest, OAuth2User> = DefaultOAuth2UserService(),
) : OAuth2UserService<OAuth2UserRequest, OAuth2User> {

    override fun loadUser(request: OAuth2UserRequest): OAuth2User {
        val attributes = checkNotNull(providerUsers.loadUser(request)) { "The provider returned no user" }.attributes
        // The session still belongs to whoever was signed in before, e.g. a guest whose boards pass to the user.
        val previousUser = (SecurityContextHolder.getContext().authentication?.principal as? OAuth2User)?.userId
        val profile = ProviderProfile.of(request.clientRegistration.registrationId, attributes)
        val user = try {
            users.signIn(profile, previousUser)
        } catch (exception: UserBlockedException) {
            throw OAuth2AuthenticationException(OAuth2Error(BLOCKED), exception.message, exception)
        }
        return user.toPrincipal()
    }

    companion object {
        /** The error of a sign-in of a user whom an administrator blocked; the login page tells them so. */
        const val BLOCKED = "account_blocked"
    }
}
