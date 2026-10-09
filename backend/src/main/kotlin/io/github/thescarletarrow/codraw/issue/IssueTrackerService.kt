package io.github.thescarletarrow.codraw.issue

import io.github.thescarletarrow.codraw.user.UserRepository
import io.github.thescarletarrow.codraw.user.guest
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * The connection of the signed-in user to the tracker, and what they find in it with their own token: their
 * repositories and issues. Only users of GitHub and Google have one: a guest has no lasting account to keep a token
 * for. The token never leaves the backend; nobody but its user makes the backend use it.
 */
@Service
class IssueTrackerService(
    private val connections: TrackerConnections,
    private val users: UserRepository,
    private val gitHub: GitHubClient,
    private val clock: Clock,
) {

    /** Whether the installation links issues at all. */
    val available: Boolean
        get() = gitHub.available

    fun settings(userId: UUID): TrackerSettings {
        requireAccount(userId)
        return TrackerSettings(
            available = available,
            tracker = Tracker.GITHUB,
            webUrl = gitHub.webUrl,
            connection = connections.find(userId, Tracker.GITHUB)?.let(::view),
        )
    }

    /**
     * Connects the user with the [token], which the tracker has to take: the login of its account is kept with it.
     * Throws [InvalidTokenException] for a token that the tracker refuses.
     */
    fun connect(userId: UUID, token: String): TrackerConnectionView {
        requireAccount(userId)
        requireAvailable()
        val trimmed = token.trim()
        if (trimmed.length !in 1..MAX_TOKEN_LENGTH || trimmed.any { it.isWhitespace() || it.isISOControl() }) {
            throw InvalidTokenException()
        }
        val login = try {
            gitHub.login(trimmed)
        } catch (_: TokenRejectedException) {
            throw InvalidTokenException()
        }
        return view(connections.save(userId, Tracker.GITHUB, trimmed, login.take(MAX_LOGIN_LENGTH), now()))
    }

    /** Forgets the token of the user; their links stay, but nobody keeps them up to date until somebody takes them over. */
    fun disconnect(userId: UUID) {
        requireAccount(userId)
        connections.delete(userId, Tracker.GITHUB)
    }

    /** The repositories that the token of the user reaches, recently changed first. */
    fun repositories(userId: UUID): List<TrackerRepository> = withToken(userId) { gitHub.repositories(it) }

    /** The issue [number] of the [repository], as the user would link it, with whether the repository is private. */
    fun issue(userId: UUID, repository: String, number: Int): FoundIssue = withToken(userId) { token ->
        val issue = gitHub.issue(token, repository, number)
        FoundIssue(issue, gitHub.repository(token, issue.repository).private)
    }

    /** Issues of the [repository] whose text has the words of [text]. */
    fun search(userId: UUID, repository: String, text: String): List<TrackerIssue> =
        withToken(userId) { gitHub.search(it, repository, text) }

    /**
     * Runs [call] with the token of the user: throws [NotConnectedException] without one, and remembers that the tracker
     * refused it, which throws [TokenRejectedException].
     */
    fun <T> withToken(userId: UUID, call: (String) -> T): T {
        requireAccount(userId)
        requireAvailable()
        val connection = connections.find(userId, Tracker.GITHUB) ?: throw NotConnectedException()
        if (!connection.working) throw TokenRejectedException()
        return withToken(connection, call)
    }

    /** Runs [call] with the token of the [connection], and remembers that the tracker refused it. */
    fun <T> withToken(connection: TrackerConnection, call: (String) -> T): T = try {
        call(connection.token)
    } catch (exception: TokenRejectedException) {
        connections.rejected(connection.userId, connection.tracker, connection.token, now())
        throw exception
    }

    /** The working connection of the user [userId], `null` when they have none or the tracker refused it. */
    fun workingConnection(userId: UUID): TrackerConnection? =
        connections.find(userId, Tracker.GITHUB)?.takeIf { it.working }

    fun requireAvailable() {
        if (!available) throw TrackerOffException()
    }

    fun requireAccount(userId: UUID) {
        val user = users.findById(userId) ?: throw GuestNotAllowedException()
        if (user.guest) throw GuestNotAllowedException()
    }

    private fun view(connection: TrackerConnection) = TrackerConnectionView(
        login = connection.login,
        connectedAt = connection.createdAt,
        working = connection.working,
        rejectedAt = connection.rejectedAt,
    )

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private companion object {
        const val MAX_TOKEN_LENGTH = 512
        const val MAX_LOGIN_LENGTH = 100
    }
}

/** What the settings of the tracker show. */
data class TrackerSettings(
    /** Whether the installation links issues. */
    val available: Boolean,
    val tracker: Tracker,
    /** The site of the tracker, where users create their tokens; `null` when the installation links no issues. */
    val webUrl: String?,
    val connection: TrackerConnectionView?,
)

/** The connection of a user as they see it: never the token itself. */
data class TrackerConnectionView(
    /** The account of the tracker that the token belongs to. */
    val login: String,
    val connectedAt: Instant,
    /** `false` once the tracker refused the token, e.g. it expired or was revoked. */
    val working: Boolean,
    val rejectedAt: Instant?,
)

/** An issue that the user may link, with whether its repository is private. */
data class FoundIssue(val issue: TrackerIssue, val private: Boolean)

/** Guests have no connections to the tracker. */
class GuestNotAllowedException : RuntimeException("The issue tracker needs a sign-in through GitHub or Google")

/** The installation links no issues. */
class TrackerOffException : RuntimeException("The installation links no issues")

/** The user has not connected the tracker. */
class NotConnectedException : RuntimeException("The user has not connected the issue tracker")

/** The tracker does not take the token that the user entered. */
class InvalidTokenException : RuntimeException("The tracker does not take the token")
