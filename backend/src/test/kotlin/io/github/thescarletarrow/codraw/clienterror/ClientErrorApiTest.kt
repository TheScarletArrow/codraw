package io.github.thescarletarrow.codraw.clienterror

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import java.time.Duration
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.assertEquals

@IntegrationTest
@TestPropertySource(properties = ["codraw.limits.client-errors-per-address-per-minute=3"])
class ClientErrorApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val users: UserService,
    @Autowired private val registry: MeterRegistry,
    @Autowired private val clock: MutableClock,
) {

    private val logged = ListAppender<ILoggingEvent>()
    private val logger = LoggerFactory.getLogger(ClientErrorController::class.java) as Logger

    /** Every test reports from an address of its own, so that the limit counts only its reports. */
    private val address = "203.0.113.${ADDRESSES.incrementAndGet()}"

    @BeforeEach
    fun captureLog() {
        logged.start()
        logger.addAppender(logged)
    }

    @AfterEach
    fun releaseLog() {
        logger.detachAppender(logged)
    }

    private fun report(json: String, setup: MockHttpServletRequestDsl.() -> Unit = { with(csrf()) }) =
        mockMvc.post(ClientErrorController.PATH) {
            setup()
            with { request -> request.apply { remoteAddr = address } }
            contentType = MediaType.APPLICATION_JSON
            header("User-Agent", "Mozilla/5.0 Test")
            content = json
        }

    private fun count(kind: String) = registry.get("codraw.client.errors").tag("kind", kind).counter().count()

    private fun pairs(event: ILoggingEvent) = event.keyValuePairs.orEmpty().associate { it.key to it.value }

    @Test
    fun `takes a report without a sign-in, logs it with its fields and counts it`() {
        val before = count("error")

        report("""{"kind": "error", "message": "TypeError: x is undefined", "stack": "at draw (index.js:1:2)", "path": "/boards/42"}""")
            .andExpect { status { isNoContent() } }

        assertEquals(before + 1, count("error"))
        val event = logged.list.single()
        assertEquals("WARN", event.level.toString())
        assertEquals(
            mapOf(
                "client.error.kind" to "error",
                "error.message" to "TypeError: x is undefined",
                "error.stack_trace" to "at draw (index.js:1:2)",
                "url.path" to "/boards/42",
                "user_agent.original" to "Mozilla/5.0 Test",
            ),
            pairs(event),
        )
    }

    @Test
    fun `logs the user of a session`() {
        val alice = users.gitHubUser("Alice")

        report("""{"kind": "render", "message": "Cannot read properties of null"}""") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        assertEquals(alice.id.toString(), pairs(logged.list.single())["user.id"])
    }

    @Test
    fun `refuses a report of an unknown kind, without a message or with too long fields`() {
        report("""{"kind": "warning", "message": "x"}""").andExpect { status { isBadRequest() } }
        report("""{"kind": "error"}""").andExpect { status { isBadRequest() } }
        report("""{"kind": "error", "message": "${"x".repeat(1001)}"}""").andExpect { status { isBadRequest() } }
        report("""{"kind": "error", "message": "x", "stack": "${"x".repeat(8001)}"}""").andExpect { status { isBadRequest() } }

        assertEquals(0, logged.list.size)
    }

    @Test
    fun `refuses a report without the CSRF token`() {
        report("""{"kind": "error", "message": "x"}""") {}.andExpect { status { isForbidden() } }

        assertEquals(0, logged.list.size)
    }

    @Test
    fun `takes as many reports from an address in a minute as the limit allows`() {
        val reached = registry.get("codraw.limits.reached").tag("limit", "client-errors").counter().count()
        repeat(3) { report("""{"kind": "unhandledrejection", "message": "x"}""").andExpect { status { isNoContent() } } }
        clock.advance(Duration.ofSeconds(20))

        report("""{"kind": "unhandledrejection", "message": "x"}""").andExpect {
            status { isTooManyRequests() }
            header { string("Retry-After", "40") }
        }

        assertEquals(3, logged.list.size)
        assertEquals(reached + 1, registry.get("codraw.limits.reached").tag("limit", "client-errors").counter().count())
        clock.advance(Duration.ofSeconds(40))
        report("""{"kind": "unhandledrejection", "message": "x"}""").andExpect { status { isNoContent() } }
        assertEquals(4, logged.list.size)
    }

    private companion object {
        val ADDRESSES = AtomicInteger()
    }
}
