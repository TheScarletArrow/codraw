package io.github.thescarletarrow.codraw.password

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.admin.AdminProperties
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserBlockedException
import io.github.thescarletarrow.codraw.user.signInToSession
import io.github.thescarletarrow.codraw.user.userId
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import java.time.Duration

data class PasswordSignUpRequest(val login: String = "", val password: String = "")

data class PasswordSignInRequest(val login: String = "", val password: String = "")

data class PasswordChangeRequest(val currentPassword: String = "", val newPassword: String = "")

/**
 * Registration, sign-in and the change of the password of accounts with a login and a password. Refusals carry a
 * `reason` that the login page and the page of the account tell.
 */
@RestController
class PasswordController(
    private val passwords: PasswordService,
    private val offered: PasswordSignIn,
    private val admins: AdminProperties,
    private val limiter: PasswordLimiter,
    private val metrics: CodrawMetrics,
    @param:Value("\${server.servlet.session.timeout:30m}") private val sessionTimeout: Duration,
) {

    /** Open without a sign-in: creates the account and signs in to it; a guest passes what they had. */
    @PostMapping(SIGN_UP_PATH)
    fun signUp(
        @RequestBody body: PasswordSignUpRequest,
        authentication: Authentication?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): ResponseEntity<*> {
        if (!offered.signUp) return refused(HttpStatus.FORBIDDEN, "sign-up-off")
        (PasswordRules.loginProblem(body.login) ?: PasswordRules.passwordProblem(body.login, body.password))
            ?.let { return refused(HttpStatus.BAD_REQUEST, it.reason) }
        if (passwords.reserved(body.login)) return refused(HttpStatus.FORBIDDEN, "login-reserved")
        // Taken logins count too: registration tells which logins exist, and the limit keeps it from listing them.
        limiter.acquireSignUp(request.remoteAddr)?.let { wait -> return tooMany(Limit.SIGN_UPS, wait) }
        val user = passwords.signUp(body.login, body.password, authentication.previousUserId())
            ?: return refused(HttpStatus.CONFLICT, "login-taken")
        startSession(user, request, response)
        return ResponseEntity.noContent().build<Void>()
    }

    /**
     * Open without a sign-in: signs in to the account of the login and the password; an unknown login and a wrong
     * password get the same 401. Only failed attempts count against the limits.
     */
    @PostMapping(SIGN_IN_PATH)
    fun signIn(
        @RequestBody body: PasswordSignInRequest,
        authentication: Authentication?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): ResponseEntity<*> {
        if (!offered.signIn) return refused(HttpStatus.FORBIDDEN, "password-off")
        val login = PasswordRules.normalize(body.login)
        limiter.waitBeforeAttempt(request.remoteAddr, login)?.let { wait -> return tooMany(Limit.PASSWORD_FAILURES, wait) }
        val user = try {
            passwords.signIn(body.login, body.password, authentication.previousUserId())
        } catch (_: UserBlockedException) {
            return refused(HttpStatus.FORBIDDEN, "blocked")
        }
        if (user == null) {
            limiter.failed(request.remoteAddr, login)
            return refused(HttpStatus.UNAUTHORIZED, "invalid-credentials")
        }
        startSession(user, request, response)
        return ResponseEntity.noContent().build<Void>()
    }

    /** Changes the password of the user, who signed in with it, and ends their other sessions. */
    @PutMapping(CHANGE_PATH)
    fun change(
        @AuthenticationPrincipal principal: OAuth2User,
        @RequestBody body: PasswordChangeRequest,
        request: HttpServletRequest,
    ): ResponseEntity<*> {
        val login = passwords.login(principal.userId) ?: return refused(HttpStatus.FORBIDDEN, "no-password")
        // The next start would bring the password of the settings back.
        if (login == admins.configuredLogin) return refused(HttpStatus.FORBIDDEN, "password-from-settings")
        limiter.waitBeforeAttempt(request.remoteAddr, login)?.let { wait -> return tooMany(Limit.PASSWORD_FAILURES, wait) }
        PasswordRules.passwordProblem(login, body.newPassword)?.let { return refused(HttpStatus.BAD_REQUEST, it.reason) }
        return when (passwords.change(principal.userId, body.currentPassword, body.newPassword, request.session.id)) {
            PasswordChange.CHANGED -> ResponseEntity.noContent().build<Void>()
            PasswordChange.NO_PASSWORD -> refused(HttpStatus.FORBIDDEN, "no-password")
            PasswordChange.WRONG_PASSWORD -> {
                limiter.failed(request.remoteAddr, login)
                refused(HttpStatus.BAD_REQUEST, "wrong-password")
            }
        }
    }

    /** Like after a sign-in through a provider: a new id of the session, and the usual lifetime even after a guest's. */
    private fun startSession(user: User, request: HttpServletRequest, response: HttpServletResponse) {
        signInToSession(user, ProviderProfile.PASSWORD, request, response)
        request.getSession(false)?.maxInactiveInterval = sessionTimeout.toSeconds().toInt()
    }

    private fun Authentication?.previousUserId() = (this?.principal as? OAuth2User)?.userId

    private fun refused(status: HttpStatus, reason: String): ResponseEntity<ProblemDetail> =
        ResponseEntity.status(status).body(
            ProblemDetail.forStatusAndDetail(status, "The password was not accepted").apply { setProperty("reason", reason) },
        )

    private fun tooMany(limit: Limit, wait: Duration): ResponseEntity<ProblemDetail> {
        metrics.limitReached(limit)
        // Whole seconds, rounded up: the client must not come back before the window ends.
        val seconds = (wait.toMillis() + 999) / 1000
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .header(HttpHeaders.RETRY_AFTER, seconds.toString())
            .body(
                ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts")
                    .apply { setProperty("reason", limit.tag) },
            )
    }

    companion object {
        const val SIGN_UP_PATH = "/api/auth/password/sign-up"
        const val SIGN_IN_PATH = "/api/auth/password/sign-in"
        const val CHANGE_PATH = "/api/me/password"
    }
}
