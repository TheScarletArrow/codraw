package io.github.thescarletarrow.codraw.issue

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.validation.annotation.Validated

/**
 * Issues of a tracker linked to elements and threads of boards (docs/adr/0009-issue-tracker.md). The tracker is GitHub:
 * github.com, or GitHub Enterprise Server of the installation.
 */
@Validated
@ConfigurationProperties("codraw.issues")
data class IssueProperties(
    val github: GitHub = GitHub(),
) {
    data class GitHub(
        /**
         * The REST API of GitHub, e.g. `https://api.github.com`, or `https://github.example.com/api/v3` of GitHub
         * Enterprise Server; the backend sends the tokens of users only there. Empty turns issues off.
         */
        val apiUrl: String = "https://api.github.com",
        /**
         * The secret of the webhook of issues that an administrator of a repository or an organization of GitHub creates
         * to bring changes of issues at once; empty turns the webhook off, and links are brought up to date only when
         * they are shown.
         */
        val webhookSecret: String = "",
    )
}
