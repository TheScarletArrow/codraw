package io.github.thescarletarrow.codraw.issue

import org.springframework.stereotype.Service
import tools.jackson.core.JacksonException
import tools.jackson.databind.json.JsonMapper
import java.security.MessageDigest
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.HexFormat
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Events of the webhook of issues of GitHub, which an administrator of a repository or an organization points at
 * CoDraw: the links of a changed issue learn of the change at once. GitHub signs every event with the secret of the
 * webhook, and an event without the signature changes nothing. An event only changes links that users made; issues
 * that nobody linked are not kept. GitHub repeats an event that got no answer and does not keep their order, so a
 * repeated or late event changes nothing: links keep the latest change of the issue they know of.
 */
@Service
class GitHubWebhookService(
    private val properties: IssueProperties,
    private val gitHub: GitHubClient,
    private val links: IssueLinks,
    private val json: JsonMapper,
    private val clock: Clock,
) {

    private val secret: ByteArray? = properties.github.webhookSecret.takeIf { it.isNotEmpty() }?.toByteArray()

    /** Whether the installation takes events: the tracker is on and the administrator set the secret. */
    val enabled: Boolean
        get() = gitHub.available && secret != null

    /** Whether the [signature] of `X-Hub-Signature-256` is the signature of the [body] with the secret of the webhook. */
    fun verify(body: ByteArray, signature: String?): Boolean {
        val key = secret ?: return false
        val expected = "sha256=" + Mac.getInstance(ALGORITHM).run {
            init(SecretKeySpec(key, ALGORITHM))
            HexFormat.of().formatHex(doFinal(body))
        }
        return signature != null && MessageDigest.isEqual(expected.toByteArray(), signature.trim().lowercase().toByteArray())
    }

    /**
     * Applies the [event] of GitHub, as `X-GitHub-Event` names it, with the [body] of its request; returns how many
     * links changed. Events other than of issues change nothing. Throws [InvalidEventException] for a body that is not
     * an event of an issue.
     */
    fun handle(event: String?, body: ByteArray): Int {
        if (event != ISSUES_EVENT) return 0
        val payload = try {
            json.readTree(body)
        } catch (_: JacksonException) {
            throw InvalidEventException()
        }
        val node = payload.path("issue")
        val id = node.path("id").takeIf { it.isIntegralNumber && it.canConvertToLong() }?.longValue() ?: throw InvalidEventException()
        val now = now()
        return when (payload.path("action").takeIf { it.isString }?.stringValue()) {
            "deleted" -> links.deleted(Tracker.GITHUB, id, now)
            "transferred" -> {
                val changes = payload.path("changes")
                val issue = gitHub.issueOf(changes.path("new_issue")) ?: throw InvalidEventException()
                val repository = gitHub.repositoryOf(changes.path("new_repository")) ?: throw InvalidEventException()
                links.changed(Tracker.GITHUB, id, issue, repository.private, now)
            }
            else -> {
                val issue = gitHub.issueOf(node) ?: throw InvalidEventException()
                val repository = gitHub.repositoryOf(payload.path("repository")) ?: throw InvalidEventException()
                links.changed(Tracker.GITHUB, id, issue, repository.private, now)
            }
        }
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private companion object {
        const val ALGORITHM = "HmacSHA256"
        const val ISSUES_EVENT = "issues"
    }
}

/** The body of the request is not an event of an issue of GitHub. */
class InvalidEventException : RuntimeException("Not an event of an issue")
