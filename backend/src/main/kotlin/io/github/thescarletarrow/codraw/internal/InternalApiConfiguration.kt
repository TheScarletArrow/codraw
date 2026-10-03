package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.CodrawProperties
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import java.security.MessageDigest

/** Restricts the internal API (paths under `/internal/`) to callers that present the shared internal token. */
@Configuration(proxyBeanMethods = false)
class InternalApiConfiguration(private val properties: CodrawProperties) : WebMvcConfigurer {

    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(InternalTokenInterceptor(properties.internalToken)).addPathPatterns("/internal/**")
    }
}

class InternalTokenInterceptor(token: String) : HandlerInterceptor {

    private val expected = token.toByteArray()

    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        val provided = request.getHeader(HEADER)?.toByteArray() ?: ByteArray(0)
        if (MessageDigest.isEqual(expected, provided)) {
            return true
        }
        response.sendError(HttpServletResponse.SC_UNAUTHORIZED)
        return false
    }

    companion object {
        const val HEADER = "X-Internal-Token"
    }
}
