package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.security.OidcProvider
import org.springframework.security.core.authority.AuthorityUtils
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.oidc.OidcIdToken
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.security.oauth2.core.user.OAuth2User

/**
 * Signs in through a provider of OpenID Connect: checks that the provider lets the user into this installation, creates
 * or updates the user of the issuer and the subject of the ID token and signs in as that user. The principal keeps the
 * ID token, for signing out at the provider, with the id of the user as its name.
 */
class CodrawOidcUserService(
    private val users: UserService,
    private val providers: (registrationId: String) -> OidcProvider?,
    private val providerUsers: OAuth2UserService<OidcUserRequest, OidcUser> = OidcUserService(),
) : OAuth2UserService<OidcUserRequest, OidcUser> {

    override fun loadUser(request: OidcUserRequest): OidcUser {
        val providerUser = checkNotNull(providerUsers.loadUser(request)) { "The provider returned no user" }
        val registrationId = request.clientRegistration.registrationId
        val provider = checkNotNull(providers(registrationId)) { "Not a provider of OpenID Connect: $registrationId" }
        if (!admits(provider, providerUser.claims)) {
            throw OAuth2AuthenticationException(OAuth2Error(ACCESS_DENIED, "The provider $registrationId does not admit the user", null))
        }
        // The session still belongs to whoever was signed in before, e.g. a guest whose boards pass to the user.
        val previousUser = (SecurityContextHolder.getContext().authentication?.principal as? OAuth2User)?.userId
        val user = users.signIn(profileOf(request.idToken, providerUser.claims), previousUser)
        val idToken = request.idToken
        return DefaultOidcUser(
            AuthorityUtils.createAuthorityList("ROLE_USER"),
            OidcIdToken(idToken.tokenValue, idToken.issuedAt, idToken.expiresAt, idToken.claims + (USER_ID to user.id.toString())),
            USER_ID,
        )
    }

    companion object {
        /** The error of a sign-in that the restrictions of the provider turned away; the login page names it. */
        const val ACCESS_DENIED = "codraw_access_denied"
        private const val USER_ID = "userId"

        /**
         * The user of the issuer and the subject of the checked ID token: neither the address of email nor the id of the
         * provider in the settings, which may change. Other claims may come from the user info endpoint too.
         */
        fun profileOf(idToken: OidcIdToken, claims: Map<String, Any?>): ProviderProfile {
            // Spring Security has checked both: an ID token without them is rejected.
            val issuer = checkNotNull(idToken.issuer) { "The ID token has no issuer" }
            val subject = checkNotNull(idToken.subject) { "The ID token has no subject" }
            return ProviderProfile(
                provider = ProviderProfile.OIDC_PREFIX + issuer,
                providerUserId = subject,
                name = claims.text("name") ?: claims.text("preferred_username") ?: claims.text("email") ?: subject,
                avatarUrl = claims.text("picture")?.takeIf { it.startsWith("https://") || it.startsWith("http://") },
            )
        }

        /** Whether the restrictions of [provider] by domains of email and by groups let the user with [claims] in. */
        fun admits(provider: OidcProvider, claims: Map<String, Any?>): Boolean {
            val domains = provider.allowedEmailDomains.map { it.trim().lowercase() }.filter(String::isNotEmpty)
            if (domains.isNotEmpty()) {
                val email = claims.text("email") ?: return false
                // Entra ID sends no `email_verified`: its administrators set the addresses.
                if (claims["email_verified"] == false || claims["email_verified"] == "false") return false
                if (email.substringAfterLast('@', "").lowercase() !in domains) return false
            }
            val groups = provider.allowedGroups.map(String::trim).filter(String::isNotEmpty)
            if (groups.isNotEmpty()) {
                val userGroups = when (val claim = claims[provider.groupsClaim]) {
                    is Collection<*> -> claim.map { it.toString() }
                    is String -> listOf(claim)
                    else -> emptyList()
                }
                if (userGroups.none { it in groups }) return false
            }
            return true
        }

        private fun Map<String, Any?>.text(key: String): String? = (this[key] as? String)?.takeIf { it.isNotBlank() }
    }
}
