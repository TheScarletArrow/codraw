package io.github.thescarletarrow.codraw.collab

import com.nimbusds.jose.jwk.RSAKey
import org.junit.jupiter.api.Test
import java.security.KeyPairGenerator
import java.util.Base64
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class CollabSigningKeysTest {

    private val configuration = CollabSigningKeysConfiguration()

    @Test
    fun `reads the signing key from PEM and names it by its thumbprint`() {
        val pem = rsaPrivateKeyPem()

        val keys = configuration.collabSigningKeys(CollabTokenProperties(signingKey = pem))

        assertNotNull(keys.current.toRSAPrivateKey())
        assertEquals(keys.current.computeThumbprint().toString(), keys.current.keyID)
        // Every backend instance with the same key publishes the same key id.
        assertEquals(keys.current.keyID, configuration.collabSigningKeys(CollabTokenProperties(signingKey = pem)).current.keyID)
    }

    @Test
    fun `generates a signing key when none is set`() {
        val keys = configuration.collabSigningKeys(CollabTokenProperties(signingKey = " "))

        assertNotNull(keys.current.toRSAPrivateKey())
        assertEquals(listOf(keys.current.keyID), keys.jwks.keys.map { it.keyID })
    }

    @Test
    fun `publishes the previous key next to the current one`() {
        val previous = parseRsaKey(rsaPrivateKeyPem())

        val keys = configuration.collabSigningKeys(
            CollabTokenProperties(signingKey = rsaPrivateKeyPem(), previousSigningKey = rsaPrivateKeyPem(previous)),
        )

        assertEquals(listOf(keys.current.keyID, previous.keyID), keys.jwks.keys.map { it.keyID })
        assertNull(keys.jwks.toPublicJWKSet().keys[1].toRSAKey().privateExponent)
    }

    private fun rsaPrivateKeyPem(key: RSAKey? = null): String {
        val encoded = key?.toRSAPrivateKey()?.encoded
            ?: KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair().private.encoded
        val body = Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(encoded)
        return "-----BEGIN PRIVATE KEY-----\n$body\n-----END PRIVATE KEY-----\n"
    }
}
