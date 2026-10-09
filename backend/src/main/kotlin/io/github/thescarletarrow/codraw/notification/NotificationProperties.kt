package io.github.thescarletarrow.codraw.notification

import jakarta.validation.constraints.Positive
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.validation.annotation.Validated
import java.time.Duration

@Validated
@ConfigurationProperties("codraw.notifications")
data class NotificationProperties(
    /** A notification is deleted once it is this old, read or not. */
    val retention: Duration = Duration.ofDays(90),
    /** The owner of a board gets at most one notification about a request to review an element within this time. */
    val reviewRequestInterval: Duration = Duration.ofMinutes(10),
    /**
     * The address of the app that users open, e.g. `https://codraw.example.com`: the links of letters and of messages
     * in chats lead there. Empty turns both channels off, as there is nothing to link to.
     */
    val appUrl: String = "",
    val email: Email = Email(),
    val webhook: Webhook = Webhook(),
    val delivery: Delivery = Delivery(),
) {
    /** Letters through the SMTP server of the installation, which `spring.mail.*` sets. */
    data class Email(
        /** The sender of letters, e.g. `CoDraw <codraw@example.com>`; empty turns letters off. */
        val from: String = "",
        /** How long the link of a letter that confirms an address works. */
        val confirmationTtl: Duration = Duration.ofDays(1),
    )

    /** Messages to incoming webhooks of team chats, e.g. of Slack or Mattermost. */
    data class Webhook(
        /**
         * Host names of webhooks that users may enter, e.g. `hooks.slack.com`, `chat.example.com`; the backend sends
         * requests to them for users. Empty turns chats off.
         */
        val allowedHosts: List<String> = listOf("hooks.slack.com"),
        /** Lets webhooks use `http`, which sends their secret addresses in the open; for tests only. */
        val allowHttp: Boolean = false,
    )

    /** The queue of messages of notifications to channels. */
    data class Delivery(
        /**
         * How long a message waits before its first attempt: a notification read in the app or undone meanwhile is not
         * sent.
         */
        val delay: Duration = Duration.ofMinutes(1),
        /** The most attempts to send a message before it fails. */
        @field:Positive
        val maxAttempts: Int = 5,
    )
}
