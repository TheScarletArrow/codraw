package io.github.thescarletarrow.codraw.password

import io.github.thescarletarrow.codraw.admin.AdminProperties
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.DelegatingPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.temporal.ChronoUnit
import java.util.UUID

/** How a change of a password ended. */
enum class PasswordChange { CHANGED, WRONG_PASSWORD, NO_PASSWORD }

/**
 * Accounts with a login and a password (docs/adr/0015-password-sign-in.md): the user is `password` + the login in lower
 * case, the password only a bcrypt hash with the id of its algorithm, so that a later algorithm or cost replaces it at
 * the next sign-in.
 */
@Service
class PasswordService(
    private val users: UserService,
    private val credentials: PasswordCredentials,
    private val admins: AdminProperties,
    private val clock: Clock,
) {

    private val encoder: PasswordEncoder = DelegatingPasswordEncoder(BCRYPT, mapOf(BCRYPT to BCryptPasswordEncoder()))

    /** Checked for a login that nobody has, so that the answer takes as long as for a wrong password. */
    private val unknownLoginHash: String = checkNotNull(encoder.encode(UUID.randomUUID().toString()))

    /**
     * Whether `CODRAW_ADMINS` names the [login]: nobody registers it, so that a stranger does not take it before the
     * administrator registers it themselves and becomes the administrator.
     */
    fun reserved(login: String): Boolean = (ProviderProfile.PASSWORD to PasswordRules.normalize(login)) in admins.accounts

    /**
     * Creates the user [login] with the [password], both checked by [PasswordRules], in a session where the user
     * [previousUserId] was signed in; a guest passes what they had. `null` when the login is taken.
     */
    @Transactional
    fun signUp(login: String, password: String, previousUserId: UUID?): User? {
        val profile = ProviderProfile(ProviderProfile.PASSWORD, PasswordRules.normalize(login), login, null)
        val user = users.signUp(profile, previousUserId) ?: return null
        credentials.insert(user.id, checkNotNull(encoder.encode(password)), now())
        return user
    }

    /**
     * Signs in the user with the [login] and the [password] in a session where the user [previousUserId] was signed in;
     * `null` for an unknown login and a wrong password alike. Throws `UserBlockedException` for a blocked user with the
     * right password only, so that the block does not tell that the login exists.
     */
    fun signIn(login: String, password: String, previousUserId: UUID?): User? {
        val user = users.find(ProviderProfile.PASSWORD, PasswordRules.normalize(login))
        val hash = user?.let { credentials.hashOf(it.id) }
        if (user == null || !matches(password, hash)) return null
        if (encoder.upgradeEncoding(hash)) credentials.update(user.id, checkNotNull(encoder.encode(password)), now())
        return users.signInExisting(user.id, previousUserId)
    }

    /**
     * Changes the password of the user [userId] from [current] to [new], checked by [PasswordRules], and ends their other
     * sessions than [keptSessionId]: whoever signed in with the old password is out.
     */
    @Transactional
    fun change(userId: UUID, current: String, new: String, keptSessionId: String): PasswordChange {
        val hash = credentials.hashOf(userId) ?: return PasswordChange.NO_PASSWORD
        if (!matches(current, hash)) return PasswordChange.WRONG_PASSWORD
        credentials.update(userId, checkNotNull(encoder.encode(new)), now())
        credentials.endOtherSessions(userId, keptSessionId)
        return PasswordChange.CHANGED
    }

    /** The login of the user [userId] in lower case, `null` when they do not sign in with a password. */
    fun login(userId: UUID): String? =
        users.find(userId)?.takeIf { it.provider == ProviderProfile.PASSWORD }?.providerUserId

    private fun matches(password: String, hash: String?): Boolean {
        // bcrypt reads no more than 72 bytes: a longer password is nobody's, but the answer takes as long.
        if (hash == null || PasswordRules.tooLong(password)) {
            encoder.matches(UNKNOWN_LOGIN_PASSWORD, unknownLoginHash)
            return false
        }
        return encoder.matches(password, hash)
    }

    private fun now() = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private companion object {
        const val BCRYPT = "bcrypt"
        const val UNKNOWN_LOGIN_PASSWORD = "not the password of anybody"
    }
}
