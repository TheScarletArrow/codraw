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

/** Issues short-lived tokens that let a user connect to the shared document of one board in collab. */
@Service
class CollabTokenService(keys: CollabSigningKeys, private val clock: Clock) {

    private val encoder = NimbusJwtEncoder(ImmutableJWKSet(JWKSet(keys.current)))

    /**
     * Issues a token for [user] to the document of the board [boardId]. The caller checks access to the board. The token
     * tells who the user is, not what they may do: the owner may change the link while the token is valid, so collab asks
     * for the access when the user connects.
     */
    fun issue(user: User, boardId: UUID): CollabToken {
        // JWT times have a precision of seconds.
        val issuedAt = clock.instant().truncatedTo(ChronoUnit.SECONDS)
        val claims = JwtClaimsSet.builder()
            .subject(user.id.toString())
            .audience(listOf(AUDIENCE))
            .issuedAt(issuedAt)
            .expiresAt(issuedAt + TTL)
            .claim("board", boardId.toString())
            .claim("name", user.name)
            .apply { user.avatarUrl?.let { claim("avatar", it) } }
            .build()
        val jwt = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).build(), claims))
        return CollabToken(token = jwt.tokenValue, expiresAt = checkNotNull(jwt.expiresAt))
    }

    companion object {
        const val AUDIENCE = "codraw-collab"
        val TTL: Duration = Duration.ofMinutes(5)
    }
}

data class CollabToken(
    val token: String,
    val expiresAt: Instant,
)
