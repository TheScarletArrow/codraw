package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.e2e.RecordingEmailTransport
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.context.annotation.Profile

/**
 * Tests never reach an SMTP server: letters stay in memory, where the tests read them. The `e2e` profile keeps them in
 * memory itself.
 */
@Profile("!e2e")
@TestConfiguration(proxyBeanMethods = false)
class RecordingEmailConfiguration {

    @Bean
    @Primary
    fun recordingEmailTransport() = RecordingEmailTransport()
}
