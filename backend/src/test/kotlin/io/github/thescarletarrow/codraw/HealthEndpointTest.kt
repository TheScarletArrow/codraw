package io.github.thescarletarrow.codraw

import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@IntegrationTest
class HealthEndpointTest(@Autowired private val mockMvc: MockMvc) {

    @ParameterizedTest
    @ValueSource(strings = ["/actuator/health", "/actuator/health/liveness", "/actuator/health/readiness"])
    fun `health endpoints report UP`(path: String) {
        mockMvc.get(path).andExpect {
            status { isOk() }
            jsonPath("$.status") { value("UP") }
        }
    }
}
