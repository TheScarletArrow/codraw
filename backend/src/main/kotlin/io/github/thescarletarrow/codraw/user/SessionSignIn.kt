package io.github.thescarletarrow.codraw.user

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.core.context.SecurityContextImpl
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.web.context.HttpSessionSecurityContextRepository

private val securityContexts = HttpSessionSecurityContextRepository()

/** Signs [user] in to the session of the request without an external provider: as a guest or as an e2e test user. */
fun signInToSession(user: User, provider: String, request: HttpServletRequest, response: HttpServletResponse) {
    // Like after a provider sign-in, an existing session gets a new id against session fixation.
    request.getSession(false)?.let { request.changeSessionId() }
    val principal = user.toPrincipal()
    securityContexts.saveContext(
        SecurityContextImpl(OAuth2AuthenticationToken(principal, principal.authorities, provider)),
        request,
        response,
    )
}
