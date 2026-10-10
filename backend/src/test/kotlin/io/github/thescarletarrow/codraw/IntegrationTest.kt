package io.github.thescarletarrow.codraw

import io.github.thescarletarrow.codraw.issue.FakeGitHubConfiguration
import io.github.thescarletarrow.codraw.notification.RecordingEmailConfiguration
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import

/**
 * Full application context with MockMvc, a PostgreSQL container, a controllable clock, letters kept in memory and the API
 * of GitHub on this machine, shared by all integration tests; the GitHub user [ADMIN] administers the installation.
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@SpringBootTest(
    properties = [
        "codraw.internal-token=${IntegrationTest.INTERNAL_TOKEN}",
        // The GitHub user of `gitHubUser(IntegrationTest.ADMIN)` administers the installation.
        "codraw.admin.users=github:id-${IntegrationTest.ADMIN}",
    ],
)
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

        /** The name of the GitHub user who administers the installation in the tests. */
        const val ADMIN = "Admin"
    }
}
