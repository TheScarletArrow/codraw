package io.github.thescarletarrow.codraw.security

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.security.oauth2.client.registration.ClientRegistration
import org.springframework.security.oauth2.core.AuthorizationGrantType
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class CodrawClientRegistrationsTest {

    private val gitHub = registration("github", "test-github-client")
    private val google = registration("google", "not-configured")

    @Test
    fun `offers GitHub and Google only with their OAuth applications, then the providers of OpenID Connect that are set up`() {
        val oidc = OidcProperties(
            mapOf(
                "corp" to OidcProvider(issuerUri = "https://sso.example.com/realms/acme", clientId = "codraw", name = "Keycloak компании"),
                "okta" to OidcProvider(issuerUri = "https://acme.okta.com", clientId = "codraw"),
                "partner" to OidcProvider(clientId = "codraw"),
            ),
        )

        val registrations = CodrawClientRegistrations(mapOf("github" to gitHub, "google" to google), oidc) { error("not read") }

        assertEquals(
            listOf(
                SignInProvider("github", "GitHub", corporate = false),
                SignInProvider("corp", "Keycloak компании", corporate = true),
                SignInProvider("okta", "okta", corporate = true),
            ),
            registrations.providers,
        )
        assertEquals(gitHub, registrations.findByRegistrationId("github"))
        assertNull(registrations.findByRegistrationId("google"))
        assertNull(registrations.oidcProvider("partner"))
    }

    @Test
    fun `reads the metadata of a provider on its first sign-in, keeps them, and tries again after a failure`() {
        var reads = 0
        var up = false
        val oidc = OidcProperties(
            mapOf("corp" to OidcProvider(issuerUri = ISSUER, clientId = "codraw", clientSecret = "secret", scopes = listOf("profile"))),
        )
        val registrations = CodrawClientRegistrations(emptyMap(), oidc) { issuer ->
            reads++
            check(up) { "The provider is down" }
            ClientRegistration.withRegistrationId("discovered")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .authorizationUri("$issuer/auth")
                .tokenUri("$issuer/token")
                .jwkSetUri("$issuer/certs")
                .issuerUri(issuer)
        }

        assertNull(registrations.findByRegistrationId("corp"))
        up = true
        val registration = assertNotNull(registrations.findByRegistrationId("corp"))
        registrations.findByRegistrationId("corp")

        assertEquals(2, reads)
        assertEquals("corp", registration.registrationId)
        assertEquals("codraw", registration.clientId)
        assertEquals(setOf("openid", "profile"), registration.scopes)
        assertEquals("{baseUrl}/api/login/oauth2/code/{registrationId}", registration.redirectUri)
    }

    @Test
    fun `rejects ids of providers that clash with others or do not fit into the environment`() {
        for (id in listOf("github", "guest", "my-corp", "Corp", "")) {
            assertThrows<IllegalArgumentException> { OidcProperties(mapOf(id to OidcProvider())) }
        }
    }

    private fun registration(id: String, clientId: String) = ClientRegistration.withRegistrationId(id)
        .clientId(clientId)
        .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
        .redirectUri("{baseUrl}/api/login/oauth2/code/{registrationId}")
        .authorizationUri("https://$id.example.com/auth")
        .tokenUri("https://$id.example.com/token")
        .build()

    companion object {
        private const val ISSUER = "https://sso.example.com/realms/acme"
    }
}
