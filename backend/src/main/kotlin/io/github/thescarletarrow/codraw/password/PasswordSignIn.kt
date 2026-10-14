package io.github.thescarletarrow.codraw.password

import io.github.thescarletarrow.codraw.admin.AdminProperties
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

/**
 * What the installation offers of signing in with a password: the sign-in when it is on or when the settings make an
 * administrator with a password, who signs in with it; the registration only when the sign-in with a password is on.
 */
@Component
class PasswordSignIn(private val properties: PasswordProperties, private val admins: AdminProperties) {

    val signIn: Boolean
        get() = properties.enabled || admins.configuredLogin != null

    val signUp: Boolean
        get() = properties.enabled && properties.signUp

    /** Whether the settings keep the password of the [user], the administrator of `CODRAW_ADMIN_LOGIN`. */
    fun fromSettings(user: User): Boolean =
        user.provider == ProviderProfile.PASSWORD && user.providerUserId == admins.configuredLogin
}

/**
 * The administrator of `CODRAW_ADMIN_LOGIN` and `CODRAW_ADMIN_PASSWORD`, made at every start once the migrations ran: the
 * account is there, its password is the one of the settings, and it is not blocked.
 */
@Component
class ConfiguredAdmin(private val admins: AdminProperties, private val passwords: PasswordService) {

    @EventListener(ApplicationReadyEvent::class)
    fun ensure() {
        val login = admins.login.trim().takeIf { admins.configuredLogin != null } ?: return
        passwords.ensureAccount(login, admins.password)
    }
}
