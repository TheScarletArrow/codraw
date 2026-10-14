package io.github.thescarletarrow.codraw.security

import io.github.thescarletarrow.codraw.password.PasswordSignIn
import io.github.thescarletarrow.codraw.user.GuestProperties
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

data class SignInProvidersResponse(
    val providers: List<SignInProviderResponse>,
    /** Whether «Продолжить без входа» creates guests. */
    val guests: Boolean,
    /** Signing in with a login and a password, `null` when the installation does not offer it. */
    val password: PasswordSignInOptions?,
)

/** Whether visitors register themselves, or only those who registered before sign in. */
data class PasswordSignInOptions(val signUp: Boolean)

data class SignInProviderResponse(val id: String, val name: String)

@RestController
class SignInProvidersController(
    private val registrations: CodrawClientRegistrations,
    private val guests: GuestProperties,
    private val passwords: PasswordSignIn,
) {

    /** Open without a sign-in: the login page offers the ways to sign in of this installation. */
    @GetMapping(PATH)
    fun providers() = SignInProvidersResponse(
        providers = registrations.providers.map { SignInProviderResponse(it.id, it.name) },
        guests = guests.enabled,
        password = PasswordSignInOptions(signUp = passwords.signUp).takeIf { passwords.signIn },
    )

    companion object {
        const val PATH = "/api/auth/providers"
    }
}
