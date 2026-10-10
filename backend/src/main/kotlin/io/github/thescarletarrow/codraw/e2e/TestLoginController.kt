package io.github.thescarletarrow.codraw.e2e

import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.UserBlockedException
import io.github.thescarletarrow.codraw.user.UserService
import io.github.thescarletarrow.codraw.user.signInToSession
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

/**
 * Sign-in without an external provider for end-to-end tests, which cannot use GitHub or Google.
 * Exists only in the `e2e` profile.
 */
@Profile("e2e")
@RestController
class TestLoginController(private val users: UserService) {

    /** Signs in as the test user with this name, creating the user on the first sign-in; 403 for a blocked one. */
    @PostMapping(PATH)
    fun login(
        @Valid @RequestBody request: TestLoginRequest,
        httpRequest: HttpServletRequest,
        httpResponse: HttpServletResponse,
    ): ResponseEntity<Void> {
        val user = try {
            users.signIn(ProviderProfile(PROVIDER, request.name, request.name, null))
        } catch (_: UserBlockedException) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build()
        }
        signInToSession(user, PROVIDER, httpRequest, httpResponse)
        return ResponseEntity.noContent().build()
    }

    companion object {
        const val PATH = "/api/e2e/login"
        const val PROVIDER = "e2e"
    }
}

data class TestLoginRequest(
    @field:NotBlank
    @field:Size(max = 100)
    val name: String,
)

@Profile("e2e")
@Configuration(proxyBeanMethods = false)
class TestLoginSecurityConfiguration {

    @Bean
    @Order(0)
    fun testLoginSecurity(http: HttpSecurity): SecurityFilterChain {
        http {
            // The letters of the tests too: they are read without a sign-in, like the test login itself.
            securityMatcher(TestLoginController.PATH, TestEmailController.PATH)
            authorizeHttpRequests { authorize(anyRequest, permitAll) }
            csrf { disable() }
        }
        return http.build()
    }
}
