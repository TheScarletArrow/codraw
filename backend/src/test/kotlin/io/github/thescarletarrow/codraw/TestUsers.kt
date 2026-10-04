package io.github.thescarletarrow.codraw

import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.github.thescarletarrow.codraw.user.toPrincipal
import jakarta.servlet.http.Cookie
import org.springframework.security.core.context.SecurityContextImpl
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.session.Session
import org.springframework.session.SessionRepository
import org.springframework.test.web.servlet.request.RequestPostProcessor
import java.util.Base64

/** Creates or updates a GitHub user with this name, as if they signed in. */
fun UserService.gitHubUser(name: String): User =
    signIn(ProviderProfile(ProviderProfile.GITHUB, "id-$name", name, "https://avatars.example.com/$name.png"))

/** Makes the request as the signed-in [User], without a stored session. */
fun User.session(): RequestPostProcessor = oauth2Login().oauth2User(toPrincipal())

/** Stores a session of the signed-in [user] in the session repository and returns the session cookie. */
fun SessionRepository<*>.signedIn(user: User): Cookie {
    @Suppress("UNCHECKED_CAST")
    val sessions = this as SessionRepository<Session>
    val session = sessions.createSession()
    val principal = user.toPrincipal()
    session.setAttribute(
        HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
        SecurityContextImpl(OAuth2AuthenticationToken(principal, principal.authorities, ProviderProfile.GITHUB)),
    )
    sessions.save(session)
    // Spring Session sends the session id Base64-encoded.
    return Cookie(SESSION_COOKIE, Base64.getEncoder().encodeToString(session.id.toByteArray()))
}

const val SESSION_COOKIE = "SESSION"
