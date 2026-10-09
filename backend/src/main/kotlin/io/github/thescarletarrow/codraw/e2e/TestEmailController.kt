package io.github.thescarletarrow.codraw.e2e

import io.github.thescarletarrow.codraw.notification.Email
import io.github.thescarletarrow.codraw.notification.EmailTransport
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Primary
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.concurrent.CopyOnWriteArrayList

/** Keeps letters in memory instead of sending them, for tests that read what CoDraw would have sent. */
class RecordingEmailTransport : EmailTransport {

    private val letters = CopyOnWriteArrayList<Email>()

    override val available = true

    override fun send(email: Email) {
        letters += email
    }

    /** The letters to [to], oldest first. */
    fun lettersTo(to: String): List<Email> = letters.filter { it.to.equals(to, ignoreCase = true) }

    fun clear() = letters.clear()
}

/** Letters in memory in place of an SMTP server for end-to-end tests. Exists only in the `e2e` profile. */
@Profile("e2e")
@Configuration(proxyBeanMethods = false)
class TestEmailConfiguration {

    @Bean
    @Primary
    fun recordingEmailTransport() = RecordingEmailTransport()
}

/** What CoDraw would have sent to an address, for end-to-end tests. Exists only in the `e2e` profile. */
@Profile("e2e")
@RestController
class TestEmailController(private val letters: RecordingEmailTransport) {

    /** The letters to the address [to], oldest first. */
    @GetMapping(PATH)
    fun letters(@RequestParam to: String): List<Email> = letters.lettersTo(to)

    companion object {
        const val PATH = "/api/e2e/emails"
    }
}
