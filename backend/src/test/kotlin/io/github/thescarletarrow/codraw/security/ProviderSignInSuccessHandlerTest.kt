package io.github.thescarletarrow.codraw.security

import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.authentication.TestingAuthenticationToken
import java.time.Duration
import kotlin.test.assertEquals

class ProviderSignInSuccessHandlerTest {

    @Test
    fun `opens the app with the usual session lifetime, also for a guest who signs in`() {
        val request = MockHttpServletRequest()
        request.getSession(true)!!.maxInactiveInterval = Duration.ofDays(30).toSeconds().toInt()
        val response = MockHttpServletResponse()

        ProviderSignInSuccessHandler(Duration.ofMinutes(30))
            .onAuthenticationSuccess(request, response, TestingAuthenticationToken("user", null))

        assertEquals(Duration.ofMinutes(30).toSeconds().toInt(), request.getSession(false)!!.maxInactiveInterval)
        assertEquals("/", response.redirectedUrl)
    }
}
