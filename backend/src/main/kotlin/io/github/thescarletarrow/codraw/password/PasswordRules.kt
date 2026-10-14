package io.github.thescarletarrow.codraw.password

import org.springframework.boot.context.properties.ConfigurationProperties
import java.util.Locale

/** Signing in with a login and a password (docs/deploy.md, «Вход по логину и паролю»). */
@ConfigurationProperties("codraw.passwords")
data class PasswordProperties(
    /** Off by default, so that a closed installation does not open itself with an update (`CODRAW_PASSWORDS_ENABLED`). */
    val enabled: Boolean = false,
    /** Visitors register themselves; off, only those who registered before sign in (`CODRAW_PASSWORDS_SIGN_UP`). */
    val signUp: Boolean = true,
)

/** Why a login or a password is refused; [reason] is what the API answers and the login page tells. */
enum class PasswordProblem(val reason: String) {
    LOGIN_INVALID("login-invalid"),
    PASSWORD_SHORT("password-short"),
    PASSWORD_LONG("password-long"),
    PASSWORD_LOGIN("password-login"),
}

/** What a login and a password must be. The frontend repeats them only for its hints. */
object PasswordRules {

    const val LOGIN_MIN_LENGTH = 3
    const val LOGIN_MAX_LENGTH = 32
    const val PASSWORD_MIN_LENGTH = 8

    /** bcrypt reads no more of a password: a longer one is refused rather than cut silently. */
    const val PASSWORD_MAX_BYTES = 72

    /**
     * Latin letters, digits, dots, underscores and hyphens, a letter or a digit first: Cyrillic and Latin letters side by
     * side make logins that look the same, «а» and «a».
     */
    private val LOGIN = Regex("[A-Za-z0-9][A-Za-z0-9._-]{${LOGIN_MIN_LENGTH - 1},${LOGIN_MAX_LENGTH - 1}}")

    /** The login as the account keeps it: one account for `Alice` and `alice`. */
    fun normalize(login: String): String = login.lowercase(Locale.ROOT)

    fun loginProblem(login: String): PasswordProblem? = if (LOGIN.matches(login)) null else PasswordProblem.LOGIN_INVALID

    /** In characters as people count them, an emoji one; in bytes of UTF-8 as bcrypt counts them. */
    fun passwordProblem(login: String, password: String): PasswordProblem? = when {
        password.codePointCount(0, password.length) < PASSWORD_MIN_LENGTH -> PasswordProblem.PASSWORD_SHORT
        tooLong(password) -> PasswordProblem.PASSWORD_LONG
        password.equals(login, ignoreCase = true) -> PasswordProblem.PASSWORD_LOGIN
        else -> null
    }

    fun tooLong(password: String): Boolean = password.toByteArray(Charsets.UTF_8).size > PASSWORD_MAX_BYTES
}
