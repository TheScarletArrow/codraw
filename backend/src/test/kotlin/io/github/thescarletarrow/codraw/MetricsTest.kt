package io.github.thescarletarrow.codraw

import io.github.thescarletarrow.codraw.internal.InternalTokenInterceptor
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import kotlin.test.assertEquals

@IntegrationTest
class MetricsTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val registry: MeterRegistry,
    @Autowired private val users: UserService,
) {

    @Test
    fun `gives the metrics in the Prometheus format without a session`() {
        mockMvc.get("/api/me").andExpect { status { isUnauthorized() } }

        mockMvc.get("/actuator/prometheus").andExpect {
            status { isOk() }
            content { string(containsString("http_server_requests_seconds_count")) }
            content { string(containsString("codraw_board_creations_total{application=\"codraw-backend\"}")) }
            content { string(containsString("codraw_limits_reached_total{application=\"codraw-backend\",limit=\"boards\"}")) }
        }
    }

    @Test
    fun `counts created boards and guests`() {
        val boards = count("codraw.board.creations")
        val guests = count("codraw.guest.creations")

        createBoard()
        mockMvc.post("/api/guest") { with(csrf()) }.andExpect { status { isNoContent() } }

        assertEquals(boards + 1, count("codraw.board.creations"))
        assertEquals(guests + 1, count("codraw.guest.creations"))
    }

    @Test
    fun `records the sizes of stored documents`() {
        val board = createBoard()
        val stored = registry.get("codraw.documents.stored").summary()
        val (count, total) = stored.count() to stored.totalAmount()

        mockMvc.put("/internal/boards/$board/document") {
            header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = ByteArray(300)
        }.andExpect { status { isNoContent() } }

        assertEquals(count + 1, stored.count())
        assertEquals(total + 300, stored.totalAmount())
    }

    private fun count(name: String) = registry.get(name).counter().count()

    private fun createBoard(): String {
        val alice = users.gitHubUser("Alice")
        val response = mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Метрики"}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return Regex("\"id\":\"([^\"]+)\"").find(response)!!.groupValues[1]
    }
}
