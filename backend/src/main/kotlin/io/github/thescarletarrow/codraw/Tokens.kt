package io.github.thescarletarrow.codraw

import java.security.SecureRandom
import java.util.Base64

/** Secrets in addresses, e.g. of a live image or an invitation: 128 random bits, 22 characters of base64url. */
object Tokens {

    private val random = SecureRandom()

    /** A new token that cannot be guessed. */
    fun next(): String = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(16).also(random::nextBytes))
}
