package io.github.thescarletarrow.codraw.collab

import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.KeyUse
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.converter.RsaKeyConverters
import java.security.KeyFactory
import java.security.interfaces.RSAPrivateCrtKey
import java.security.interfaces.RSAPublicKey
import java.security.spec.RSAPublicKeySpec

@ConfigurationProperties("codraw.collab-token")
data class CollabTokenProperties(
    /** PEM-encoded PKCS#8 RSA private key that signs collab tokens. Generated at startup when not set. */
    val signingKey: String? = null,
    /** The previous signing key after a key rotation: its public part stays in the JWKS until its tokens expire. */
    val previousSigningKey: String? = null,
)

/** Keys of collab tokens: [current] signs new tokens, [jwks] lets collab verify them. */
class CollabSigningKeys(val current: RSAKey, previous: RSAKey? = null) {

    val jwks = JWKSet(listOfNotNull(current, previous))
}

@Configuration(proxyBeanMethods = false)
class CollabSigningKeysConfiguration {

    private val log = LoggerFactory.getLogger(javaClass)

    @Bean
    fun collabSigningKeys(properties: CollabTokenProperties): CollabSigningKeys {
        val current = properties.signingKey.ifSet()?.let(::parseRsaKey)
            ?: generateRsaKey().also {
                log.warn(
                    "codraw.collab-token.signing-key is not set: generated a signing key for this run. " +
                        "Set it in production, the same for every backend instance.",
                )
            }
        return CollabSigningKeys(current, properties.previousSigningKey.ifSet()?.let(::parseRsaKey))
    }

    private fun String?.ifSet() = this?.takeIf { it.isNotBlank() }
}

fun generateRsaKey(): RSAKey =
    RSAKeyGenerator(2048).keyUse(KeyUse.SIGNATURE).algorithm(JWSAlgorithm.RS256).keyIDFromThumbprint(true).generate()

/** Reads a PEM-encoded PKCS#8 RSA private key; the key id is its thumbprint, so every instance derives the same one. */
fun parseRsaKey(pem: String): RSAKey {
    val privateKey = RsaKeyConverters.pkcs8().convert(pem.trim().byteInputStream()) as RSAPrivateCrtKey
    val publicKey = KeyFactory.getInstance("RSA").generatePublic(RSAPublicKeySpec(privateKey.modulus, privateKey.publicExponent))
    return RSAKey.Builder(publicKey as RSAPublicKey)
        .privateKey(privateKey)
        .keyUse(KeyUse.SIGNATURE)
        .algorithm(JWSAlgorithm.RS256)
        .keyIDFromThumbprint()
        .build()
}
