package io.github.thescarletarrow.codraw.admin

import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserRepository
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpStatus
import org.springframework.security.authorization.AuthorizationDecision
import org.springframework.security.authorization.AuthorizationManager
import org.springframework.security.authorization.AuthorizationResult
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.security.web.access.intercept.RequestAuthorizationContext
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException
import java.util.UUID
import java.util.function.Supplier

/**
 * Who administers the installation: the configuration names their accounts, and the user is read on every check, so
 * that an account taken out of the configuration stops administering as soon as the backend restarts.
 */
@Component
class AdminAccess(private val properties: AdminProperties, private val users: UserRepository) {

    fun isAdmin(user: User): Boolean = isAdmin(user.provider, user.providerUserId)

    fun isAdmin(provider: String, providerUserId: String): Boolean = (provider to providerUserId) in properties.accounts

    fun isAdmin(userId: UUID): Boolean = users.findById(userId)?.let(::isAdmin) == true

    /** The signed-in administrator; 403 for anybody else. */
    fun require(principal: OAuth2User): User =
        users.findById(principal.userId)?.takeIf(::isAdmin)
            ?: throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only administrators of the installation")
}

/**
 * Lets only administrators through to the API of administration, before any controller: anybody without a session gets
 * 401 from the entry point, a signed-in user who is no administrator 403, also for addresses that do not exist.
 */
@Component
class AdminAuthorizationManager(private val access: AdminAccess) : AuthorizationManager<RequestAuthorizationContext> {

    override fun authorize(authentication: Supplier<out Authentication?>, context: RequestAuthorizationContext): AuthorizationResult {
        val principal = authentication.get()?.principal as? OAuth2User
        return AuthorizationDecision(principal != null && access.isAdmin(principal.userId))
    }
}
