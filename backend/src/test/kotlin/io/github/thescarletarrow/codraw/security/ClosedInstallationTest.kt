package io.github.thescarletarrow.codraw.security

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.legal.LegalController
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.test.context.TestPropertySource
import org.springframework.test.json.JsonCompareMode
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import kotlin.test.assertEquals

/**
 * An installation with the corporate sign-in only: no OAuth application of GitHub, Google turned off with an empty id,
 * no guests, and a provider of OpenID Connect whose issuer does not answer.
 */
@IntegrationTest
@TestPropertySource(
    properties = [
        "spring.security.oauth2.client.registration.github.client-id=not-configured",
        "spring.security.oauth2.client.registration.google.client-id=not-configured",
        "codraw.guests.enabled=false",
        "codraw.auth.oidc.corp.issuer-uri=http://127.0.0.1:9/realms/acme",
        "codraw.auth.oidc.corp.client-id=codraw",
        "codraw.auth.oidc.corp.client-secret=secret",
        "codraw.auth.oidc.corp.name=Keycloak компании",
        // Without an issuer the provider is off.
        "codraw.auth.oidc.partner.client-id=codraw",
    ],
)
class ClosedInstallationTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
) {

    @Test
    fun `offers the corporate sign-in only`() {
        mockMvc.get(SignInProvidersController.PATH).andExpect {
            status { isOk() }
            content {
                json("""{"providers": [{"id": "corp", "name": "Keycloak компании"}], "guests": false}""", JsonCompareMode.STRICT)
            }
        }
    }

    @Test
    fun `creates no guest`() {
        val guests = { jdbcClient.sql("SELECT count(*) FROM users WHERE provider = 'guest'").query(Int::class.java).single() }
        val before = guests()

        mockMvc.post("/api/guest").andExpect { status { isForbidden() } }

        assertEquals(before, guests())
    }

    @Test
    fun `sends a sign-in through a provider that is down or off back to the login page`() {
        for (provider in listOf("corp", "github", "partner", "unknown")) {
            mockMvc.get("/api/oauth2/authorization/$provider").andExpect {
                status { is3xxRedirection() }
                redirectedUrl("/login?error")
            }
        }
    }

    @Test
    fun `names the corporate provider for the privacy policy`() {
        mockMvc.get(LegalController.PATH).andExpect {
            jsonPath("$.signInProviders.length()") { value(1) }
            jsonPath("$.signInProviders[0].name") { value("Keycloak компании") }
            jsonPath("$.signInProviders[0].corporate") { value(true) }
            jsonPath("$.guests") { value(false) }
        }
    }
}
