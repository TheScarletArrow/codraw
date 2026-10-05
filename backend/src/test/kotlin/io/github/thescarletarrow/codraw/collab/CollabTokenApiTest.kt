package io.github.thescarletarrow.codraw.collab

import com.nimbusds.jose.crypto.RSASSAVerifier
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jwt.SignedJWT
import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@IntegrationTest
class CollabTokenApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
) {

    private val json = JsonMapper()
    private lateinit var alice: User
    private lateinit var bob: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
    }

    @Test
    fun `issues a token for an own board, signed with a key from the JWKS`() {
        val board = createBoard(alice)

        val token = SignedJWT.parse(issueToken(alice, board).token)

        val key = JWKSet.parse(jwks()).getKeyByKeyId(token.header.keyID).toRSAKey()
        assertTrue(token.verify(RSASSAVerifier(key)))
        assertEquals("RS256", token.header.algorithm.name)
    }

    @Test
    fun `puts the user, the board and the audience into the token`() {
        val board = createBoard(alice)

        val claims = SignedJWT.parse(issueToken(alice, board).token).jwtClaimsSet

        assertEquals(alice.id.toString(), claims.subject)
        assertEquals(board, claims.getStringClaim("board"))
        assertEquals("Alice", claims.getStringClaim("name"))
        assertEquals("https://avatars.example.com/Alice.png", claims.getStringClaim("avatar"))
        assertEquals(listOf("codraw-collab"), claims.audience)
    }

    @Test
    fun `the token expires 5 minutes after it is issued`() {
        val board = createBoard(alice)
        clock.advance(Duration.ofMillis(1_500))
        val now = clock.instant().truncatedTo(ChronoUnit.SECONDS)

        val response = issueToken(alice, board)

        val claims = SignedJWT.parse(response.token).jwtClaimsSet
        assertEquals(now, claims.issueTime.toInstant())
        assertEquals(now + Duration.ofMinutes(5), claims.expirationTime.toInstant())
        assertEquals(claims.expirationTime.toInstant(), response.expiresAt)
    }

    @Test
    fun `issues a token for a board of another user opened by its link`() {
        val board = createBoard(alice)

        val claims = SignedJWT.parse(issueToken(bob, board).token).jwtClaimsSet

        assertEquals(bob.id.toString(), claims.subject)
        assertEquals(board, claims.getStringClaim("board"))
    }

    @Test
    fun `issues tokens to users of a link for viewing only, which collab makes read-only`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "view")

        val claims = SignedJWT.parse(issueToken(bob, board).token).jwtClaimsSet

        assertEquals(bob.id.toString(), claims.subject)
        // What the user may do is not in the token: collab asks for it when they connect.
        assertNull(claims.getClaim("access"))
    }

    @Test
    fun `answers 403 to other users when the link is closed`() {
        val board = createBoard(alice)
        changeLinkAccess(board, "none")

        mockMvc.post("/api/boards/$board/collab-token") {
            with(bob.session())
            with(csrf())
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.token") { doesNotExist() }
        }
        issueToken(alice, board)
    }

    @ParameterizedTest
    @ValueSource(strings = ["0199a000-0000-7000-8000-000000000000", "not-a-uuid"])
    fun `answers 404 for an unknown board`(board: String) {
        mockMvc.post("/api/boards/$board/collab-token") {
            with(alice.session())
            with(csrf())
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.token") { doesNotExist() }
        }
    }

    @Test
    fun `requires a session and a CSRF token`() {
        val board = createBoard(alice)

        mockMvc.post("/api/boards/$board/collab-token") { with(csrf()) }.andExpect { status { isUnauthorized() } }
        mockMvc.post("/api/boards/$board/collab-token") { with(alice.session()) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `publishes only public keys, without a session`() {
        val keys = JWKSet.parse(jwks()).keys

        assertTrue(keys.isNotEmpty())
        keys.forEach { assertFalse(it.isPrivate) }
    }

    private fun jwks(): String = mockMvc.get("/.well-known/jwks.json").andExpect {
        status { isOk() }
        content { contentType(MediaType.APPLICATION_JSON) }
    }.andReturn().response.contentAsString

    private fun issueToken(user: User, board: String): CollabToken {
        val body = mockMvc.post("/api/boards/$board/collab-token") {
            with(user.session())
            with(csrf())
        }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val node = json.readTree(body)
        return CollabToken(node["token"].asString(), Instant.parse(node["expiresAt"].asString()))
    }

    private fun changeLinkAccess(board: String, access: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$access"}"""
        }.andExpect { status { isOk() } }
    }

    private fun createBoard(owner: User): String {
        val response = mockMvc.post("/api/boards") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Доска"}"""
        }.andExpect { status { isCreated() } }.andReturn().response

        return response.getHeader("Location")!!.substringAfterLast('/')
    }
}
