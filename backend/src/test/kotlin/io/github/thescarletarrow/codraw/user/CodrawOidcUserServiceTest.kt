package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.security.OidcProvider
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest
import org.springframework.security.oauth2.client.registration.ClientRegistration
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.OAuth2AccessToken
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.oidc.OidcIdToken
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

/**
 * Sign-in through providers of OpenID Connect with the claims of their ID tokens given by the test; `OidcLoginTest` goes
 * through a real Keycloak.
 */
@IntegrationTest
class CodrawOidcUserServiceTest(
    @Autowired private val users: UserService,
    @Autowired private val boards: BoardService,
    @Autowired private val jdbcClient: JdbcClient,
) {

    private var providers = mapOf(
        "corp" to OidcProvider(issuerUri = CORP, clientId = "codraw"),
        "partner" to OidcProvider(issuerUri = PARTNER, clientId = "codraw"),
    )
    private val service = CodrawOidcUserService(users, { providers[it] }) { request ->
        DefaultOidcUser(emptyList(), request.idToken, "sub")
    }

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM users").update()
    }

    @AfterEach
    fun signOut() {
        SecurityContextHolder.clearContext()
    }

    @Test
    fun `the first sign-in creates the user with the name and the picture of the claims`() {
        val principal = signIn("corp", CORP, "a1", "name" to "Alice Liddell", "picture" to "https://sso.example.com/a1.png")

        val user = users.find(principal.userId)!!
        assertEquals("oidc:$CORP", user.provider)
        assertEquals("a1", user.providerUserId)
        assertEquals("Alice Liddell", user.name)
        assertEquals("https://sso.example.com/a1.png", user.avatarUrl)
        // The principal keeps the ID token for signing out at the provider.
        assertEquals("a1", principal.idToken.subject)
    }

    @Test
    fun `a repeated sign-in finds the same user although the address of email and the name changed`() {
        val first = signIn("corp", CORP, "a1", "name" to "Alice", "email" to "alice@example.com")
        val board = boards.create("Доска Алисы", first.userId)

        val again = signIn("corp", CORP, "a1", "name" to "Alice Liddell", "email" to "a.liddell@example.org")

        assertEquals(first.userId, again.userId)
        assertEquals("Alice Liddell", users.find(again.userId)!!.name)
        assertEquals(listOf(board.id), boards.list(again.userId).map { it.id })
        assertEquals(1, userCount())
    }

    @Test
    fun `the same subject at another issuer is another user, also when the id of the provider changes`() {
        val corp = signIn("corp", CORP, "same-sub", "name" to "Alice")
        val partner = signIn("partner", PARTNER, "same-sub", "name" to "Alice")
        assertNotEquals(corp.userId, partner.userId)

        // The operator renamed the provider: the issuer is what counts.
        providers = mapOf("acme" to OidcProvider(issuerUri = CORP, clientId = "codraw"))
        assertEquals(corp.userId, signIn("acme", CORP, "same-sub", "name" to "Alice").userId)
        assertEquals(2, userCount())
    }

    @Test
    fun `names the user by the login, the address of email or the subject when the claims have no name`() {
        assertEquals("alice", nameOf(signIn("corp", CORP, "a1", "preferred_username" to "alice", "email" to "a@example.com")))
        assertEquals("b@example.com", nameOf(signIn("corp", CORP, "b1", "email" to "b@example.com")))
        assertEquals("c1", nameOf(signIn("corp", CORP, "c1")))
    }

    @Test
    fun `boards of a guest pass to the user who signs in from the guest session`() {
        val guest = users.createGuest()
        val board = boards.create("Доска гостя", guest.id)
        val principal = guest.toPrincipal()
        SecurityContextHolder.getContext().authentication = OAuth2AuthenticationToken(principal, principal.authorities, "guest")

        val user = signIn("corp", CORP, "a1", "name" to "Alice")

        assertEquals(user.userId, boards.find(board.id!!)?.ownerId)
    }

    @Test
    fun `admits only verified addresses of the allowed domains, without creating others`() {
        providers = mapOf("corp" to OidcProvider(issuerUri = CORP, clientId = "codraw", allowedEmailDomains = listOf("Example.com")))

        signIn("corp", CORP, "a1", "email" to "alice@EXAMPLE.com", "email_verified" to true)
        denied("corp", CORP, "e1", "email" to "eve@sub.example.com")
        denied("corp", CORP, "b1", "email" to "bob@other.org")
        denied("corp", CORP, "c1", "email" to "carol@example.com", "email_verified" to false)
        denied("corp", CORP, "d1", "name" to "No email")

        assertEquals(1, userCount())
    }

    @Test
    fun `admits only members of the allowed groups`() {
        providers = mapOf("corp" to OidcProvider(issuerUri = CORP, clientId = "codraw", allowedGroups = listOf("codraw-users")))
        signIn("corp", CORP, "a1", "groups" to listOf("staff", "codraw-users"))
        denied("corp", CORP, "b1", "groups" to listOf("staff"))
        denied("corp", CORP, "c1")

        providers = mapOf(
            "corp" to OidcProvider(issuerUri = CORP, clientId = "codraw", allowedGroups = listOf("codraw"), groupsClaim = "roles"),
        )
        signIn("corp", CORP, "d1", "roles" to "codraw")

        assertEquals(2, userCount())
    }

    private fun denied(registrationId: String, issuer: String, subject: String, vararg claims: Pair<String, Any>) {
        val e = assertThrows<OAuth2AuthenticationException> { signIn(registrationId, issuer, subject, *claims) }
        assertEquals(CodrawOidcUserService.ACCESS_DENIED, e.error.errorCode)
    }

    private fun signIn(registrationId: String, issuer: String, subject: String, vararg claims: Pair<String, Any>): OidcUser {
        val registration = ClientRegistration.withRegistrationId(registrationId)
            .clientId("codraw")
            .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
            .redirectUri("{baseUrl}/api/login/oauth2/code/{registrationId}")
            .scope("openid")
            .authorizationUri("$issuer/auth")
            .tokenUri("$issuer/token")
            .jwkSetUri("$issuer/certs")
            .issuerUri(issuer)
            .userNameAttributeName("sub")
            .build()
        val now = Instant.now()
        val idToken = OidcIdToken("id-token", now, now.plusSeconds(60), mapOf("iss" to issuer, "sub" to subject, "aud" to listOf("codraw")) + claims)
        val accessToken = OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "token", now, now.plusSeconds(60))
        return service.loadUser(OidcUserRequest(registration, accessToken, idToken))
    }

    private fun nameOf(principal: OidcUser) = users.find(principal.userId)!!.name

    private fun userCount() = jdbcClient.sql("SELECT count(*) FROM users").query(Int::class.java).single()

    companion object {
        const val CORP = "https://sso.example.com/realms/acme"
        const val PARTNER = "https://login.partner.example/tenant/v2.0"
    }
}
