package io.github.thescarletarrow.codraw.security

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * Sign-in through providers of OpenID Connect that the operator of the installation chose, e.g. Keycloak, Entra ID or
 * Okta, by their ids: `codraw.auth.oidc.corp.issuer-uri` or `CODRAW_AUTH_OIDC_CORP_ISSUER_URI`. See docs/deploy.md.
 */
@ConfigurationProperties("codraw.auth")
data class OidcProperties(
    val oidc: Map<String, OidcProvider> = emptyMap(),
) {
    init {
        oidc.keys.forEach { id ->
            require(ID.matches(id) && id !in RESERVED_IDS) {
                "codraw.auth.oidc.$id: the id of a provider takes lowercase Latin letters and digits and is not one of $RESERVED_IDS"
            }
        }
    }

    /** The providers that the operator set up; one without an issuer or a client id is off. */
    val enabled: Map<String, OidcProvider>
        get() = oidc.filterValues { it.issuerUri.isNotBlank() && it.clientId.isNotBlank() }

    companion object {
        private val ID = Regex("[a-z0-9]+")
        private val RESERVED_IDS = setOf("github", "google", "guest")
    }
}

data class OidcProvider(
    /** The issuer whose metadata live at `<issuer>/.well-known/openid-configuration`; it must be stable, see docs/deploy.md. */
    val issuerUri: String = "",
    val clientId: String = "",
    val clientSecret: String = "",
    /** The name on the button «Войти через …» and in the privacy policy; the id when empty. */
    val name: String = "",
    /** `openid` is added when missing: without it the ID token would not be checked. */
    val scopes: List<String> = listOf("openid", "profile", "email"),
    /** Only users with a verified address of these domains sign in; empty lets in everybody of the provider. */
    val allowedEmailDomains: List<String> = emptyList(),
    /** Only users in one of these groups sign in; empty lets in everybody of the provider. */
    val allowedGroups: List<String> = emptyList(),
    /** The claim that lists the groups of the user. */
    val groupsClaim: String = "groups",
    /** Signing out of CoDraw signs out at the provider too (RP-initiated logout). */
    val logout: Boolean = false,
)
