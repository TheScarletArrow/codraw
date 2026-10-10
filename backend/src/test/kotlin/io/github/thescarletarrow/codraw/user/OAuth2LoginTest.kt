package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import org.hamcrest.Matchers.contains
import io.github.thescarletarrow.codraw.board.AccessRequests
import io.github.thescarletarrow.codraw.board.BoardMembers
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.LinkAccess
import io.github.thescarletarrow.codraw.board.MemberRole
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
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.user.DefaultOAuth2User
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertNull

/** Sign-in through the providers: the provider's user info endpoint is replaced by [providerAttributes]. */
@IntegrationTest
class OAuth2LoginTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val registrations: ClientRegistrationRepository,
    @Autowired private val boards: BoardService,
    @Autowired private val clock: MutableClock,
    @Autowired private val members: BoardMembers,
    @Autowired private val requests: AccessRequests,
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

        assertEquals(user.userId, boards.find(board.id!!)?.ownerId)
        assertEquals(emptyList(), boards.list(guest.id))
    }

    @Test
    fun `boards a guest opened through links pass to the user who signs in from the guest session`() {
        val owner = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Owner", "Owner", null))
        val shared = boards.create("Чужая доска", owner.id)
        val guest = users.createGuest()
        boards.recordVisit(shared, guest.id)
        signedInAs(guest.toPrincipal())

        val user = signIn("github", gitHubProfile(name = "Alice"))

        assertEquals(listOf(shared.id), boards.sharedWith(user.userId).map { it.board.id })
        assertEquals(emptyList(), boards.sharedWith(guest.id))
    }

    @Test
    fun `a board the guest opened and the user opened as well keeps the later visit`() {
        val owner = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Owner", "Owner", null))
        val shared = boards.create("Чужая доска", owner.id)
        val alice = signIn("github", gitHubProfile(name = "Alice"))
        boards.recordVisit(shared, alice.userId)
        clock.advance(Duration.ofMinutes(1))
        val guest = users.createGuest()
        boards.recordVisit(shared, guest.id)
        signedInAs(guest.toPrincipal())

        signIn("github", gitHubProfile(name = "Alice"))

        val visits = boards.sharedWith(alice.userId)
        assertEquals(1, visits.size)
        assertEquals(clock.instant().truncatedTo(ChronoUnit.MICROS), visits.single().visitedAt)
    }

    @Test
    fun `memberships of a guest pass to the user who signs in, keeping the higher role, and none in own boards`() {
        val owner = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Owner", "Owner", null))
        val joined = boards.create("Только гость", owner.id)
        val both = boards.create("Оба", owner.id)
        val alice = signIn("github", gitHubProfile(name = "Alice"))
        val aliceBoard = boards.create("Доска Алисы", alice.userId)
        val guest = users.createGuest()
        val guestBoard = boards.create("Доска гостя", guest.id)
        members.put(joined.id!!, guest.id, MemberRole.VIEWER, clock.instant())
        members.put(both.id!!, guest.id, MemberRole.EDITOR, clock.instant())
        members.put(both.id!!, alice.userId, MemberRole.VIEWER, clock.instant())
        members.put(aliceBoard.id!!, guest.id, MemberRole.EDITOR, clock.instant())
        members.put(guestBoard.id!!, alice.userId, MemberRole.EDITOR, clock.instant())
        signedInAs(guest.toPrincipal())

        signIn("github", gitHubProfile(name = "Alice"))

        assertEquals(MemberRole.VIEWER, members.roleOf(joined.id!!, alice.userId))
        assertEquals(MemberRole.EDITOR, members.roleOf(both.id!!, alice.userId))
        // The owner is no member of their boards, also of those that just passed from the guest.
        assertNull(members.roleOf(aliceBoard.id!!, alice.userId))
        assertNull(members.roleOf(guestBoard.id!!, alice.userId))
        assertEquals(alice.userId, boards.find(guestBoard.id!!)?.ownerId)
        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM board_members WHERE user_id = :guest").param("guest", guest.id)
            .query(Int::class.java).single())
    }

    @Test
    fun `requests for access of a guest pass to the user who signs in, keeping the newer one, and none the user needs no more`() {
        val owner = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Owner", "Owner", null))
        val closed = { title: String, ownerId: UUID -> boards.changeLinkAccess(boards.create(title, ownerId), LinkAccess.NONE) }
        val both = closed("Оба, гость позже", owner.id)
        val older = closed("Оба, гость раньше", owner.id)
        val joined = closed("Только гость", owner.id)
        val given = closed("Уже участник", owner.id)
        val alice = signIn("github", gitHubProfile(name = "Alice"))
        val guest = users.createGuest()
        val guestBoard = closed("Доска гостя", guest.id)
        requests.put(both.id!!, alice.userId, MemberRole.VIEWER, null, clock.instant())
        requests.put(older.id!!, guest.id, MemberRole.VIEWER, "Раньше", clock.instant())
        requests.put(guestBoard.id!!, alice.userId, MemberRole.EDITOR, null, clock.instant())
        clock.advance(Duration.ofMinutes(1))
        requests.put(both.id!!, guest.id, MemberRole.EDITOR, "Позже", clock.instant())
        requests.put(older.id!!, alice.userId, MemberRole.EDITOR, null, clock.instant())
        requests.put(joined.id!!, guest.id, MemberRole.VIEWER, null, clock.instant())
        requests.put(given.id!!, guest.id, MemberRole.VIEWER, null, clock.instant())
        members.put(given.id!!, alice.userId, MemberRole.EDITOR, clock.instant())
        signedInAs(guest.toPrincipal())

        signIn("github", gitHubProfile(name = "Alice"))

        assertEquals(MemberRole.EDITOR to "Позже", requests.find(both.id!!, alice.userId)?.let { it.role to it.message })
        assertEquals(MemberRole.EDITOR to null, requests.find(older.id!!, alice.userId)?.let { it.role to it.message })
        assertEquals(MemberRole.VIEWER, requests.find(joined.id!!, alice.userId)?.role)
        // A member with editing and the owner ask for nothing.
        assertNull(requests.find(given.id!!, alice.userId))
        assertNull(requests.find(guestBoard.id!!, alice.userId))
        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM board_access_requests WHERE user_id = :guest").param("guest", guest.id)
            .query(Int::class.java).single())
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

        assertEquals(google.userId, boards.find(board.id!!)?.ownerId)
        assertEquals(emptyList(), boards.list(gitHub.userId))
    }

    @Test
    fun `a user whom an administrator blocked does not sign in, and nothing of them changes`() {
        val alice = signIn("github", gitHubProfile(name = "Alice"))
        jdbcClient.sql("UPDATE users SET blocked_at = now() WHERE id = :id").param("id", alice.userId).update()

        val failure = assertFailsWith<OAuth2AuthenticationException> { signIn("github", gitHubProfile(name = "Alice Liddell")) }

        assertEquals(CodrawOAuth2UserService.BLOCKED, failure.error.errorCode)
        assertEquals("Alice", users.find(alice.userId)?.name)
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
