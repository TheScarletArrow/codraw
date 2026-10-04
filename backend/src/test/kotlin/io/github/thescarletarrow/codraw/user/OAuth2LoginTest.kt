package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.IntegrationTest
import org.hamcrest.Matchers.contains
import io.github.thescarletarrow.codraw.board.BoardService
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.core.authority.AuthorityUtils
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.core.OAuth2AccessToken
import org.springframework.security.oauth2.core.user.DefaultOAuth2User
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

/** Sign-in through the providers: the provider's user info endpoint is replaced by [providerAttributes]. */
@IntegrationTest
class OAuth2LoginTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val registrations: ClientRegistrationRepository,
    @Autowired private val boards: BoardService,
) {

    private var providerAttributes: Map<String, Any> = emptyMap()
    private val userService = CodrawOAuth2UserService(users) { request ->
        val nameAttribute = request.clientRegistration.providerDetails.userInfoEndpoint.userNameAttributeName!!
        DefaultOAuth2User(AuthorityUtils.createAuthorityList("OAUTH2_USER"), providerAttributes, nameAttribute)
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
    fun `the first sign-in through GitHub creates the user`() {
        val principal = signIn("github", gitHubProfile(name = "Alice Liddell"))

        mockMvc.get("/api/me") { with(oauth2Login().oauth2User(principal)) }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(principal.name) }
            jsonPath("$.name") { value("Alice Liddell") }
            jsonPath("$.avatarUrl") { value("https://avatars.githubusercontent.com/u/1001") }
        }
        assertEquals(1, userCount())
    }

    @Test
    fun `a repeated sign-in finds the same user, updates the name and the avatar and keeps the boards`() {
        val first = signIn("github", gitHubProfile(name = "Alice"))
        val boardId = mockMvc.post("/api/boards") {
            with(oauth2Login().oauth2User(first))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Прежняя доска"}"""
        }.andReturn().response.getHeader("Location")!!.substringAfterLast('/')

        val again = signIn("github", gitHubProfile(name = "Alice Liddell", avatar = "https://avatars.githubusercontent.com/u/2002"))

        assertEquals(first.name, again.name)
        assertEquals(1, userCount())
        mockMvc.get("/api/me") { with(oauth2Login().oauth2User(again)) }.andExpect {
            jsonPath("$.name") { value("Alice Liddell") }
            jsonPath("$.avatarUrl") { value("https://avatars.githubusercontent.com/u/2002") }
        }
        mockMvc.get("/api/boards") { with(oauth2Login().oauth2User(again)) }.andExpect {
            jsonPath("$[*].id") { value(contains(boardId)) }
        }
    }

    @Test
    fun `uses the GitHub login when the profile has no name`() {
        val principal = signIn("github", gitHubProfile(name = null))

        mockMvc.get("/api/me") { with(oauth2Login().oauth2User(principal)) }.andExpect {
            jsonPath("$.name") { value("alice") }
        }
    }

    @Test
    fun `signs in through Google with the name and picture of the profile`() {
        providerAttributes = mapOf("sub" to "1001", "name" to "Alice G", "picture" to "https://lh3.googleusercontent.com/a/1")
        val google = loadUser("google")

        mockMvc.get("/api/me") { with(oauth2Login().oauth2User(google)) }.andExpect {
            jsonPath("$.name") { value("Alice G") }
            jsonPath("$.avatarUrl") { value("https://lh3.googleusercontent.com/a/1") }
        }
        // The same provider user id at another provider is another user.
        assertNotEquals(google.name, signIn("github", gitHubProfile(name = "Alice")).name)
        assertEquals(2, userCount())
    }

    @Test
    fun `boards of a guest pass to the user who signs in from the guest session`() {
        val guest = users.createGuest()
        val board = boards.create("Доска гостя", guest.id)
        signedInAs(guest.toPrincipal())

        val user = signIn("github", gitHubProfile(name = "Alice"))

        assertEquals(user.userId, boards.find(board.id!!, user.userId)?.ownerId)
        assertEquals(emptyList(), boards.list(guest.id))
    }

    @Test
    fun `boards stay with a user who was signed in before through a provider`() {
        val google = run {
            providerAttributes = mapOf("sub" to "1001", "name" to "Alice G")
            loadUser("google")
        }
        val board = boards.create("Доска Google", google.userId)
        signedInAs(google)

        val gitHub = signIn("github", gitHubProfile(name = "Alice"))

        assertEquals(google.userId, boards.find(board.id!!, google.userId)?.ownerId)
        assertEquals(emptyList(), boards.list(gitHub.userId))
    }

    private fun signedInAs(principal: OAuth2User) {
        SecurityContextHolder.getContext().authentication = OAuth2AuthenticationToken(principal, principal.authorities, "test")
    }

    private fun gitHubProfile(name: String?, avatar: String = "https://avatars.githubusercontent.com/u/1001") =
        listOfNotNull("id" to 1001, "login" to "alice", name?.let { "name" to it }, "avatar_url" to avatar).toMap()

    private fun signIn(registrationId: String, attributes: Map<String, Any>): OAuth2User {
        providerAttributes = attributes
        return loadUser(registrationId)
    }

    private fun loadUser(registrationId: String): OAuth2User {
        val registration = registrations.findByRegistrationId(registrationId)!!
        val accessToken = OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "token", Instant.now(), Instant.now().plusSeconds(60))
        return userService.loadUser(OAuth2UserRequest(registration, accessToken))
    }

    private fun userCount() = jdbcClient.sql("SELECT count(*) FROM users").query(Int::class.java).single()
}
