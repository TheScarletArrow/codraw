package io.github.thescarletarrow.codraw.user

/** Profile of a user as reported by a sign-in provider. */
data class ProviderProfile(
    val provider: String,
    val providerUserId: String,
    val name: String,
    val avatarUrl: String?,
) {
    companion object {
        const val GITHUB = "github"
        const val GOOGLE = "google"
        const val GUEST = "guest"

        /** Reads the profile from the user info [attributes] of the provider with the registration id [provider]. */
        fun of(provider: String, attributes: Map<String, Any?>): ProviderProfile = when (provider) {
            GITHUB -> ProviderProfile(
                provider = provider,
                providerUserId = attributes.getValue("id").toString(),
                // GitHub users may leave the display name empty; the login is always there.
                name = attributes.text("name") ?: attributes.getValue("login").toString(),
                avatarUrl = attributes.text("avatar_url"),
            )
            GOOGLE -> ProviderProfile(
                provider = provider,
                providerUserId = attributes.getValue("sub").toString(),
                name = attributes.text("name") ?: attributes.getValue("sub").toString(),
                avatarUrl = attributes.text("picture"),
            )
            else -> throw IllegalArgumentException("Unsupported sign-in provider: $provider")
        }

        private fun Map<String, Any?>.text(key: String): String? = (this[key] as? String)?.takeIf { it.isNotBlank() }
    }
}
