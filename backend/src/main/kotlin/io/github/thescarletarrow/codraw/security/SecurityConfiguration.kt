package io.github.thescarletarrow.codraw.security

import io.github.thescarletarrow.codraw.board.PublicBoardController
import io.github.thescarletarrow.codraw.clienterror.ClientErrorController
import io.github.thescarletarrow.codraw.collab.JwksController
import io.github.thescarletarrow.codraw.embed.EmbedController
import io.github.thescarletarrow.codraw.image.BoardImageController
import io.github.thescarletarrow.codraw.legal.LegalController
import io.github.thescarletarrow.codraw.user.CodrawOAuth2UserService
import io.github.thescarletarrow.codraw.user.GuestLoginController
import io.github.thescarletarrow.codraw.user.UserService
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler
import org.springframework.security.web.csrf.CookieCsrfTokenRepository
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler
import org.springframework.security.web.savedrequest.NullRequestCache
import java.time.Duration

@Configuration(proxyBeanMethods = false)
class SecurityConfiguration {

    @Bean
    fun oauth2UserService(users: UserService) = CodrawOAuth2UserService(users)

    /** The internal API for collab is guarded by the internal token (see `InternalApiConfiguration`), not by a session. */
    @Bean
    @Order(1)
    fun internalApiSecurity(http: HttpSecurity): SecurityFilterChain {
        http {
            securityMatcher("/internal/**")
            authorizeHttpRequests { authorize(anyRequest, permitAll) }
            csrf { disable() }
            sessionManagement { sessionCreationPolicy = SessionCreationPolicy.STATELESS }
        }
        return http.build()
    }

    @Bean
    @Order(2)
    fun appSecurity(
        http: HttpSecurity,
        oauth2UserService: CodrawOAuth2UserService,
        @Value("\${server.servlet.session.timeout:30m}") sessionTimeout: Duration,
    ): SecurityFilterChain {
        http {
            authorizeHttpRequests {
                authorize("/actuator/health/**", permitAll)
                authorize("/actuator/prometheus", permitAll)
                authorize(JwksController.PATH, permitAll)
                authorize(HttpMethod.POST, GuestLoginController.PATH, permitAll)
                // The login page breaks too: its errors are reported without a sign-in.
                authorize(HttpMethod.POST, ClientErrorController.PATH, permitAll)
                // The privacy policy and the terms of use are read before signing in.
                authorize(HttpMethod.GET, LegalController.PATH, permitAll)
                // Live images of boards are embedded into documents that their readers open without a sign-in.
                authorize(HttpMethod.GET, "${EmbedController.PATH}/**", permitAll)
                // Boards that their links show without a sign-in are read in README files, wikis and frames of other
                // sites, with their images; the controllers check the link of the board, and the images the session too.
                authorize(HttpMethod.GET, "${PublicBoardController.PATH}/**", permitAll)
                authorize(HttpMethod.GET, BoardImageController.IMAGE_PATH, permitAll)
                authorize("/error", permitAll)
                authorize(anyRequest, authenticated)
            }
            // Sign-in endpoints live under /api, so that the frontend origin proxies them like the rest of the API.
            oauth2Login {
                loginPage = "/login"
                authorizationEndpoint { baseUri = "/api/oauth2/authorization" }
                redirectionEndpoint { baseUri = "/api/login/oauth2/code/*" }
                userInfoEndpoint { userService = oauth2UserService }
                authenticationSuccessHandler = ProviderSignInSuccessHandler(sessionTimeout)
                failureUrl = "/login?error"
            }
            logout {
                logoutUrl = "/api/logout"
                logoutSuccessHandler = HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)
            }
            csrf {
                // The SPA reads the XSRF-TOKEN cookie and sends it back in the X-XSRF-TOKEN header.
                csrfTokenRepository = CookieCsrfTokenRepository.withHttpOnlyFalse()
                // Load the token on every request, so that the cookie is there before the first change.
                csrfTokenRequestHandler = CsrfTokenRequestAttributeHandler().apply { setCsrfRequestAttributeName(null) }
            }
            // The SPA shows its login page itself: answer 401 instead of redirecting, and do not keep rejected requests.
            exceptionHandling { authenticationEntryPoint = HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED) }
            requestCache { requestCache = NullRequestCache() }
        }
        return http.build()
    }
}
