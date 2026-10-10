package io.github.thescarletarrow.codraw.admin

import io.github.thescarletarrow.codraw.e2e.TestLoginController
import io.github.thescarletarrow.codraw.user.ProviderProfile
import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

/**
 * The administrators of the installation and how long what they do is kept. Only the deployment names administrators:
 * nothing in the app makes or unmakes one, so that nobody raises their own rights.
 */
@ConfigurationProperties("codraw.admin")
data class AdminProperties(
    /**
     * Accounts of administrators as `<provider>:<id at the provider>`, e.g. `github:583231` (`CODRAW_ADMINS`). A guest
     * is never one: nothing outside CoDraw tells who a guest is.
     */
    val users: List<String> = emptyList(),
    /** Entries of the journal and closed reports are deleted once they are this old. */
    val retention: Duration = Duration.ofDays(365),
) {
    /** The accounts of administrators as pairs of the provider and the id at the provider. */
    val accounts: Set<Pair<String, String>> = users.map(String::trim).filter(String::isNotEmpty).map(::account).toSet()

    private fun account(entry: String): Pair<String, String> {
        val provider = entry.substringBefore(':', "")
        val id = entry.substringAfter(':', "")
        require(provider in PROVIDERS && id.isNotBlank()) {
            "codraw.admin.users: \"$entry\" is not <provider>:<id> with a provider of ${PROVIDERS.joinToString()}"
        }
        return provider to id
    }

    private companion object {
        /** The providers whose accounts may administer; the test login exists only in end-to-end tests. */
        val PROVIDERS = setOf(ProviderProfile.GITHUB, ProviderProfile.GOOGLE, TestLoginController.PROVIDER)
    }
}
