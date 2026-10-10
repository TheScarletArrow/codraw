package io.github.thescarletarrow.codraw.security

import io.github.thescarletarrow.codraw.user.ProviderProfile
import org.slf4j.LoggerFactory
import org.springframework.security.oauth2.client.registration.ClientRegistration
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.registration.ClientRegistrations
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.ClientAuthenticationMethod
import java.util.concurrent.ConcurrentHashMap

/** A way to sign in that the login page offers. */
data class SignInProvider(
    val id: String,
    val name: String,
    /** A provider of OpenID Connect that the operator chose, not GitHub or Google. */
    val corporate: Boolean,
)

/**
 * The providers of this installation: GitHub and Google when their OAuth applications are set up, and the providers of
 * OpenID Connect of [OidcProperties]. The metadata of a provider of OpenID Connect are read on its first sign-in and
 * kept, so that a provider that is down does not keep the backend from starting; a failed read is tried again on the
 * next sign-in.
 */
class CodrawClientRegistrations(
    oauth2: Map<String, ClientRegistration>,
    oidc: OidcProperties,
    private val discover: (issuerUri: String) -> ClientRegistration.Builder = ClientRegistrations::fromIssuerLocation,
) : ClientRegistrationRepository {

    private val oauth2 = oauth2.filterValues { configured(it.clientId) }
    private val oidc = oidc.enabled
    private val discovered = ConcurrentHashMap<String, ClientRegistration>()

    /** GitHub and Google first, then the providers of OpenID Connect in the order of the settings. */
    val providers: List<SignInProvider> =
        listOf(ProviderProfile.GITHUB to "GitHub", ProviderProfile.GOOGLE to "Google")
            .filter { (id) -> id in this.oauth2 }
            .map { (id, name) -> SignInProvider(id, name, corporate = false) } +
            this.oidc.map { (id, provider) -> SignInProvider(id, provider.name.ifBlank { id }, corporate = true) }

    override fun findByRegistrationId(registrationId: String): ClientRegistration? =
        oauth2[registrationId] ?: oidc[registrationId]?.let { discovered(registrationId, it) }

    /** The settings of the provider of OpenID Connect with this registration id, `null` for GitHub, Google and others. */
    fun oidcProvider(registrationId: String): OidcProvider? = oidc[registrationId]

    private fun discovered(id: String, provider: OidcProvider): ClientRegistration? = try {
        discovered.computeIfAbsent(id) {
            discover(provider.issuerUri)
                .registrationId(id)
                .clientName(provider.name.ifBlank { id })
                .clientId(provider.clientId)
                .clientSecret(provider.clientSecret)
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/api/login/oauth2/code/{registrationId}")
                // Without `openid` Spring Security would treat the provider as plain OAuth2 and not check the ID token.
                .scope((listOf("openid") + provider.scopes).map(String::trim).filter(String::isNotEmpty).distinct())
                .userNameAttributeName("sub")
                .build()
        }
    } catch (e: RuntimeException) {
        log.warn("Cannot read the metadata of the sign-in provider {} at {}: {}", id, provider.issuerUri, e.toString())
        null
    }

    companion object {
        private val log = LoggerFactory.getLogger(CodrawClientRegistrations::class.java)

        /** `not-configured` stands in for the client id of an OAuth application that the deployment did not set up. */
        private fun configured(clientId: String?) = !clientId.isNullOrBlank() && clientId != "not-configured"
    }
}
