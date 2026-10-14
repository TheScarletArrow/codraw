package io.github.thescarletarrow.codraw.admin

import io.github.thescarletarrow.codraw.e2e.TestLoginController
import io.github.thescarletarrow.codraw.password.PasswordRules
import io.github.thescarletarrow.codraw.user.ProviderProfile
import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration
import java.util.Locale

/**
 * The administrators of the installation and how long what they do is kept. Only the deployment names administrators:
 * nothing in the app makes or unmakes one, so that nobody raises their own rights.
 */
@ConfigurationProperties("codraw.admin")
data class AdminProperties(
    /**
     * Accounts of administrators as `<provider>:<id at the provider>`, e.g. `github:583231` (`CODRAW_ADMINS`), of a
     * corporate provider as `oidc:<issuer>:<sub>`, and of a user with a password as `password:<login>` in any case. A guest
     * is never one: nothing outside CoDraw tells who a guest is.
     */
    val users: List<String> = emptyList(),
    /** Entries of the journal, closed reports and closed feedback are deleted once they are this old. */
    val retention: Duration = Duration.ofDays(365),
    /**
     * The login of the administrator whom the settings make with a password (`CODRAW_ADMIN_LOGIN`): the backend creates
     * the account at start and keeps its password the [password]; empty for none.
     */
    val login: String = "",
    /** The password of the administrator of [login] (`CODRAW_ADMIN_PASSWORD`); only this setting changes it. */
    val password: String = "",
) {
    /** The login of the administrator of the settings in lower case, `null` without one. */
    val configuredLogin: String? = login.trim().takeIf { it.isNotEmpty() }?.let(PasswordRules::normalize)

    init {
        require(login.isBlank() == password.isEmpty()) {
            if (login.isBlank()) "codraw.admin.login is not set, and codraw.admin.password is"
            else "codraw.admin.password is not set"
        }
        if (configuredLogin != null) {
            require(PasswordRules.loginProblem(login.trim()) == null) {
                "codraw.admin.login: \"$login\" is not 3 to 32 Latin letters, digits, dots, \"_\" and \"-\", " +
                    "a letter or a digit first"
            }
            // Never the password itself in a message.
            val problem = PasswordRules.passwordProblem(login.trim(), password)
            require(problem == null) { "codraw.admin.password does not fit the rules of passwords: ${problem?.reason}" }
        }
    }

    /** The accounts of administrators as pairs of the provider and the id at the provider. */
    val accounts: Set<Pair<String, String>> =
        users.map(String::trim).filter(String::isNotEmpty).map(::account).toSet() +
            listOfNotNull(configuredLogin?.let { ProviderProfile.PASSWORD to it })

    /** Without the password, which would otherwise reach messages about binding the settings. */
    override fun toString(): String {
        val hidden = if (password.isEmpty()) "" else "******"
        return "AdminProperties(users=$users, retention=$retention, login=$login, password=$hidden)"
    }

    private fun account(entry: String): Pair<String, String> {
        if (entry.startsWith(ProviderProfile.OIDC_PREFIX)) {
            // The issuer is an address with colons of its own; the subject has none.
            val issuerAndSubject = entry.removePrefix(ProviderProfile.OIDC_PREFIX)
            val issuer = issuerAndSubject.substringBeforeLast(':', "")
            val subject = issuerAndSubject.substringAfterLast(':', "")
            require(issuer.isNotBlank() && subject.isNotBlank()) { "codraw.admin.users: \"$entry\" is not oidc:<issuer>:<sub>" }
            return ProviderProfile.OIDC_PREFIX + issuer to subject
        }
        val provider = entry.substringBefore(':', "")
        val id = entry.substringAfter(':', "")
        require(provider in PROVIDERS && id.isNotBlank()) {
            "codraw.admin.users: \"$entry\" is not <provider>:<id> with a provider of ${PROVIDERS.joinToString()}, " +
                "nor oidc:<issuer>:<sub>"
        }
        // A login is one whatever its case, as the account keeps it.
        return provider to if (provider == ProviderProfile.PASSWORD) id.lowercase(Locale.ROOT) else id
    }

    private companion object {
        /** The providers whose accounts may administer; the test login exists only in end-to-end tests. */
        val PROVIDERS =
            setOf(ProviderProfile.GITHUB, ProviderProfile.GOOGLE, ProviderProfile.PASSWORD, TestLoginController.PROVIDER)
    }
}
