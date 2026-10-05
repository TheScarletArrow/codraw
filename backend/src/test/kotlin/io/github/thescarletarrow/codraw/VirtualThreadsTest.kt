package io.github.thescarletarrow.codraw

import org.apache.tomcat.util.threads.VirtualThreadExecutor
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment
import org.springframework.boot.tomcat.TomcatWebServer
import org.springframework.boot.web.server.servlet.context.ServletWebServerApplicationContext
import org.springframework.context.annotation.Import
import kotlin.test.assertIs

/** Requests are handled on virtual threads, so waiting on the database does not hold a thread of a bounded pool. */
@SpringBootTest(
    webEnvironment = WebEnvironment.RANDOM_PORT,
    properties = ["codraw.internal-token=${IntegrationTest.INTERNAL_TOKEN}"],
)
@Import(TestcontainersConfiguration::class)
class VirtualThreadsTest(@Autowired private val context: ServletWebServerApplicationContext) {

    @Test
    fun `Tomcat handles requests on virtual threads`() {
        val tomcat = assertIs<TomcatWebServer>(context.webServer).tomcat
        assertIs<VirtualThreadExecutor>(tomcat.connector.protocolHandler.executor)
    }
}
