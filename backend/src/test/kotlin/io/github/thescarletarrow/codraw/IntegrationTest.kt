package io.github.thescarletarrow.codraw

import io.github.thescarletarrow.codraw.issue.FakeGitHubConfiguration
import io.github.thescarletarrow.codraw.notification.RecordingEmailConfiguration
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import

/**
 * Full application context with MockMvc, a PostgreSQL container, a controllable clock, letters kept in memory and the API
 * of GitHub on this machine, shared by all integration tests.
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@SpringBootTest(properties = ["codraw.internal-token=${IntegrationTest.INTERNAL_TOKEN}"])
@AutoConfigureMockMvc
@Import(
    TestcontainersConfiguration::class,
    TestClockConfiguration::class,
    RecordingEmailConfiguration::class,
    FakeGitHubConfiguration::class,
)
annotation class IntegrationTest {
    companion object {
        const val INTERNAL_TOKEN = "test-internal-token"
    }
}
