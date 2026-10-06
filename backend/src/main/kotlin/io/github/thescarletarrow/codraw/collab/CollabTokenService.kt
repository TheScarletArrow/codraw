package io.github.thescarletarrow.codraw.collab

import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.source.ImmutableJWKSet
import io.github.thescarletarrow.codraw.user.User
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm
import org.springframework.security.oauth2.jwt.JwsHeader
import org.springframework.security.oauth2.jwt.JwtClaimsSet
import org.springframework.security.oauth2.jwt.JwtEncoderParameters
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Issues short-lived tokens that let a user connect to one shared document in collab: the document of a board, or the
 * draft of a proposal of changes.
 */
@Service
class CollabTokenService(keys: CollabSigningKeys, private val clock: Clock) {

    private val encoder = NimbusJwtEncoder(ImmutableJWKSet(JWKSet(keys.current)))

    /**
     * Issues a token for [user] to the document of the board [boardId]. The caller checks access to the board. The token
     * tells who the user is, not what they may do: the owner may change the link while the token is valid, so collab asks
     * for the access when the user connects.
     */
    fun issue(user: User, boardId: UUID): CollabToken = issue(user, BOARD_CLAIM, boardId)

    /**
     * Issues a token for [user] to the draft of the proposal [proposalId]; the caller checks that they may see it. It names
     * the proposal instead of a board, so that it opens no board, and a token of a board opens no draft.
     */
    fun issueForProposal(user: User, proposalId: UUID): CollabToken = issue(user, PROPOSAL_CLAIM, proposalId)

    private fun issue(user: User, documentClaim: String, documentId: UUID): CollabToken {
        // JWT times have a precision of seconds.
        val issuedAt = clock.instant().truncatedTo(ChronoUnit.SECONDS)
        val claims = JwtClaimsSet.builder()
            .subject(user.id.toString())
            .audience(listOf(AUDIENCE))
            .issuedAt(issuedAt)
            .expiresAt(issuedAt + TTL)
            .claim(documentClaim, documentId.toString())
            .claim("name", user.name)
            .apply { user.avatarUrl?.let { claim("avatar", it) } }
            .build()
        val jwt = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).build(), claims))
        return CollabToken(token = jwt.tokenValue, expiresAt = checkNotNull(jwt.expiresAt))
    }

    companion object {
        const val AUDIENCE = "codraw-collab"
        val TTL: Duration = Duration.ofMinutes(5)

        /** The claim of the board whose document a token opens. */
        private const val BOARD_CLAIM = "board"

        /** The claim of the proposal whose draft a token opens. */
        private const val PROPOSAL_CLAIM = "proposal"
    }
}

data class CollabToken(
    val token: String,
    val expiresAt: Instant,
)
