package io.github.thescarletarrow.codraw.security

import io.github.thescarletarrow.codraw.admin.AdminAuthorizationManager
import io.github.thescarletarrow.codraw.admin.AdminController
import io.github.thescarletarrow.codraw.admin.BoardReportController
import io.github.thescarletarrow.codraw.board.PublicBoardController
import io.github.thescarletarrow.codraw.clienterror.ClientErrorController
import io.github.thescarletarrow.codraw.collab.JwksController
import io.github.thescarletarrow.codraw.embed.EmbedController
import io.github.thescarletarrow.codraw.image.BoardImageController
import io.github.thescarletarrow.codraw.issue.GitHubWebhookController
import io.github.thescarletarrow.codraw.legal.LegalController
import io.github.thescarletarrow.codraw.user.CodrawOAuth2UserService
import io.github.thescarletarrow.codraw.user.CodrawOidcUserService
import io.github.thescarletarrow.codraw.user.GuestLoginController
import io.github.thescarletarrow.codraw.user.UserService
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.security.oauth2.client.autoconfigure.OAuth2ClientProperties
import org.springframework.boot.security.oauth2.client.autoconfigure.OAuth2ClientPropertiesMapper
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.csrf.CookieCsrfTokenRepository
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler
import org.springframework.security.web.savedrequest.NullRequestCache
import java.time.Duration

@Configuration(proxyBeanMethods = false)
// Spring Boot binds the registrations of GitHub and Google only for its own repository, which ours replaces.
@EnableConfigurationProperties(OAuth2ClientProperties::class)
class SecurityConfiguration {

    @Bean
    fun oauth2UserService(users: UserService) = CodrawOAuth2UserService(users)

    /** GitHub and Google of the settings of Spring Boot and the providers of OpenID Connect of `codraw.auth.oidc`. */
    @Bean
    fun clientRegistrations(oauth2: OAuth2ClientProperties, oidc: OidcProperties) =
        CodrawClientRegistrations(OAuth2ClientPropertiesMapper(oauth2).asClientRegistrations(), oidc)

    @Bean
    fun oidcUserService(users: UserService, registrations: CodrawClientRegistrations) =
        CodrawOidcUserService(users, registrations::oidcProvider)

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
        adminAuthorization: AdminAuthorizationManager,
        oidcUserService: CodrawOidcUserService,
        registrations: CodrawClientRegistrations,
        @Value("\${server.servlet.session.timeout:30m}") sessionTimeout: Duration,
    ): SecurityFilterChain {
        http {
            authorizeHttpRequests {
                authorize("/actuator/health/**", permitAll)
                authorize("/actuator/prometheus", permitAll)
                authorize(JwksController.PATH, permitAll)
                authorize(HttpMethod.POST, GuestLoginController.PATH, permitAll)
                authorize(HttpMethod.GET, SignInProvidersController.PATH, permitAll)
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
                // Their readers report such boards to the administrators of the installation, without a sign-in too.
                authorize(HttpMethod.POST, BoardReportController.PATH, permitAll)
                // Only administrators of the installation, whom the configuration names, before any controller.
                authorize("${AdminController.PATH}/**", adminAuthorization)
                // GitHub posts events of issues without a session; they carry the signature of the secret of the webhook.
                authorize(HttpMethod.POST, GitHubWebhookController.PATH, permitAll)
                authorize("/error", permitAll)
                authorize(anyRequest, authenticated)
            }
            // Sign-in endpoints live under /api, so that the frontend origin proxies them like the rest of the API.
            oauth2Login {
                loginPage = "/login"
                clientRegistrationRepository = registrations
                authorizationEndpoint { baseUri = SignInProviderFailureFilter.AUTHORIZATION_BASE_URI }
                redirectionEndpoint { baseUri = "/api/login/oauth2/code/*" }
                userInfoEndpoint {
                    userService = oauth2UserService
                    this.oidcUserService = oidcUserService
                }
                authenticationSuccessHandler = ProviderSignInSuccessHandler(sessionTimeout)
                // A blocked user and a user whom the provider does not admit are told so on the login page.
                authenticationFailureHandler = SignInFailureHandler()
            }
            addFilterBefore<OAuth2AuthorizationRequestRedirectFilter>(SignInProviderFailureFilter(registrations))
            logout {
                logoutUrl = "/api/logout"
                logoutSuccessHandler = ProviderLogoutSuccessHandler(registrations)
            }
            csrf {
                // Events of GitHub come from GitHub, not from a browser with a session to misuse.
                ignoringRequestMatchers(GitHubWebhookController.PATH)
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
