package io.github.thescarletarrow.codraw.issue

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.BoardRole
import io.github.thescarletarrow.codraw.comment.Comments
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.net.URLEncoder
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Issues of the tracker linked to elements and threads of boards. Whoever may open a board sees its links. A user who
 * connected the tracker links issues that their token reaches, and creates issues with a link back to the board: to
 * elements when they edit the board, to threads whenever they may open it, as they may comment. Linking an issue of a
 * private repository shows its number, title and state to everybody who may open the board: the user who links it
 * chooses so. The token of that user, and nobody else's, keeps the link up to date; another user takes a link over
 * only on purpose. Statuses go one way: from the tracker to CoDraw. The caller checks that the user has a role on the
 * board.
 */
@Service
class IssueLinkService(
    private val links: IssueLinks,
    private val creations: IssueCreations,
    private val tracker: IssueTrackerService,
    private val connections: TrackerConnections,
    private val gitHub: GitHubClient,
    private val comments: Comments,
    private val transactions: TransactionTemplate,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    /** All links of the board, oldest first. */
    fun links(board: Board): List<IssueLink> = links.links(board.boardId).map { it.view() }

    /** Links the issue [number] of the [repository] to the [target] for the user; the second value tells whether it is new. */
    fun link(board: Board, role: BoardRole, userId: UUID, target: IssueTarget, repository: String, number: Int): Pair<IssueLink, Boolean> {
        checkTarget(board, role, target)
        val found = tracker.issue(userId, repository, number)
        val (linkId, created) = save(board, target, found.issue, found.private, userId, createdHere = false)
        return view(board, linkId) to created
    }

    /**
     * Creates an issue in the [repository] for the user, with the [description] and a link back to the [target] at
     * [backLink], and links it to the target. A repeated [requestId] of the user creates nothing: it gets the link of its
     * first request, or [CreationInProgressException] while that one is creating the issue.
     */
    fun create(
        board: Board,
        role: BoardRole,
        userId: UUID,
        target: IssueTarget,
        requestId: UUID,
        repository: String,
        title: String,
        description: String,
        backLink: BackLink,
    ): Pair<IssueLink, Boolean> {
        checkTarget(board, role, target)
        tracker.requireAccount(userId)
        tracker.requireAvailable()
        val connection = connections.find(userId, Tracker.GITHUB) ?: throw NotConnectedException()
        if (!connection.working) throw TokenRejectedException()
        val now = now()
        creations.forget(userId, now - REQUEST_MEMORY)
        when (val reservation = creations.reserve(userId, requestId, now, now - ABANDONED_AFTER)) {
            is Reservation.Done -> {
                val link = links.link(board.boardId, reservation.linkId) ?: throw IssueLinkNotFoundException()
                return link.view() to false
            }
            Reservation.InProgress -> throw CreationInProgressException()
            Reservation.Reserved -> Unit
        }
        try {
            // Checked before the issue is created, so that the tracker does not get an issue that the board cannot link.
            if (links.countOnBoard(board.boardId) >= limits.issueLinksPerBoard) throw limitReached()
            val body = issueBody(description, backLink)
            val issue = tracker.withToken(connection) { gitHub.create(it, repository, title, body) }
            val private = try {
                tracker.withToken(connection) { gitHub.repository(it, issue.repository) }.private
            } catch (_: TrackerException) {
                // The issue is there already: link it, taking the repository for private, as is safer.
                true
            }
            val linkId = transactions.execute {
                val (linkId, _) = links.save(board.boardId, target, Tracker.GITHUB, issue, private, userId, true, now())
                creations.finish(userId, requestId, linkId)
                linkId
            }!!
            return view(board, linkId) to true
        } catch (exception: RuntimeException) {
            creations.release(userId, requestId)
            throw exception
        }
    }

    /**
     * Asks the tracker about the links [linkIds] of the board with the tokens of the users who linked them, unless it
     * was asked less than a minute ago, and returns them. A link that nobody keeps up to date, or whose issue was deleted,
     * stays as it is.
     */
    fun refresh(board: Board, linkIds: Collection<UUID>): List<IssueLink> {
        val due = now() - MIN_REFRESH_INTERVAL
        val stale = links.links(board.boardId, linkIds)
            .filter { it.syncedAt < due && it.syncStatus != LinkSync.DELETED && it.linkerConnected && it.linkedBy != null }
        // A slow tracker holds up only its own answer: each link is asked on a thread of its own.
        Executors.newVirtualThreadPerTaskExecutor().use { executor ->
            stale.forEach { link -> executor.submit { refresh(link) } }
        }
        return links.links(board.boardId, linkIds).map { it.view() }
    }

    /**
     * Makes the link [linkId] the user's own: their token, which has to reach the issue, keeps it up to date since, e.g.
     * after the user who linked it left the team.
     */
    fun takeOver(board: Board, role: BoardRole, userId: UUID, linkId: UUID): IssueLink {
        val link = links.link(board.boardId, linkId) ?: throw IssueLinkNotFoundException()
        checkTarget(board, role, link.target)
        val found = tracker.issue(userId, link.repository, link.number)
        if (!links.update(linkId, found.issue, found.private, userId, now())) {
            // The issue was transferred to an issue that the target has already.
            links.delete(board.boardId, linkId)
            throw IssueLinkNotFoundException()
        }
        return view(board, linkId)
    }

    /**
     * Deletes the link; the issue stays in the tracker. A link of an element is deleted by whoever edits the board, a
     * link of a thread also by the user who linked it.
     */
    fun unlink(board: Board, role: BoardRole, userId: UUID, linkId: UUID) {
        val link = links.link(board.boardId, linkId) ?: throw IssueLinkNotFoundException()
        if (!role.edits && (link.target.element || link.linkedBy?.id != userId)) throw IssueLinkForbiddenException()
        links.delete(board.boardId, linkId)
    }

    private fun refresh(link: StoredIssueLink) {
        try {
            val connection = tracker.workingConnection(link.linkedBy!!.id) ?: return
            val issue = try {
                tracker.withToken(connection) { gitHub.issue(it, link.repository, link.number) }
            } catch (_: TrackerNotFoundException) {
                links.synced(link.id, LinkSync.NO_ACCESS, now())
                return
            } catch (_: TrackerForbiddenException) {
                links.synced(link.id, LinkSync.NO_ACCESS, now())
                return
            } catch (_: NotAnIssueException) {
                links.synced(link.id, LinkSync.NO_ACCESS, now())
                return
            } catch (_: IssueGoneException) {
                links.synced(link.id, LinkSync.DELETED, now())
                return
            }
            if (!links.update(link.id, issue, null, null, now())) links.delete(link.boardId, link.id)
        } catch (exception: TrackerException) {
            // The tracker refused the token, which is remembered, or did not answer: the link stays as it was.
            log.debug("Issue link {} was not refreshed: {}", link.id, exception.message)
        } catch (exception: RuntimeException) {
            log.warn("Issue link {} was not refreshed", link.id, exception)
        }
    }

    /** Links within the limit of the board; linking an issue linked to the target already only brings it up to date. */
    private fun save(board: Board, target: IssueTarget, issue: TrackerIssue, private: Boolean, userId: UUID, createdHere: Boolean): Pair<UUID, Boolean> =
        transactions.execute {
            links.lockBoard(board.boardId)
            val linked = links.exists(board.boardId, target, Tracker.GITHUB, issue.externalId)
            if (!linked && links.countOnBoard(board.boardId) >= limits.issueLinksPerBoard) throw limitReached()
            links.save(board.boardId, target, Tracker.GITHUB, issue, private, userId, createdHere, now())
        }!!

    /** Whether the user may link issues to the [target]: an element when they edit the board, a thread of the board. */
    private fun checkTarget(board: Board, role: BoardRole, target: IssueTarget) {
        val threadId = target.threadId
        if (threadId == null) {
            if (!role.edits) throw IssueLinkForbiddenException()
        } else if (!comments.threadExists(board.boardId, threadId)) {
            throw ThreadNotFoundException()
        }
    }

    private fun limitReached(): IssueLinkLimitReachedException {
        metrics.limitReached(Limit.ISSUE_LINKS)
        return IssueLinkLimitReachedException(limits.issueLinksPerBoard)
    }

    private fun view(board: Board, linkId: UUID): IssueLink =
        (links.link(board.boardId, linkId) ?: throw IssueLinkNotFoundException()).view()

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private val Board.boardId: UUID
        get() = checkNotNull(id) { "Persisted board must have an id" }

    companion object {
        private val log = LoggerFactory.getLogger(IssueLinkService::class.java)

        /** A link asked about less than this ago is not asked about again. */
        val MIN_REFRESH_INTERVAL: Duration = Duration.ofMinutes(1)

        /** A request that is still creating its issue after this long is taken as lost. */
        val ABANDONED_AFTER: Duration = Duration.ofMinutes(2)

        /** How long a repeated request to create an issue gets the link of the first one. */
        val REQUEST_MEMORY: Duration = Duration.ofDays(1)

        /** The text of an issue created from CoDraw: the [description], then the link back to the board. */
        fun issueBody(description: String, backLink: BackLink): String = buildString {
            val text = description.trim()
            if (text.isNotEmpty()) append(text).append("\n\n---\n")
            append("Создано в CoDraw: [").append(markdownText(backLink.text)).append("](").append(backLink.url).append(')')
        }

        /**
         * Text of users in Markdown of GitHub that reads as written: no links, emphasis or HTML of its own, and no
         * mentions of people or references to issues that GitHub would notify or link.
         */
        fun markdownText(text: String): String = buildString {
            for (character in text.replace(Regex("\\s+"), " ").trim()) {
                when (character) {
                    '\\', '[', ']', '(', ')', '*', '_', '`', '~', '<', '>', '!', '|' -> append('\\').append(character)
                    // Breaks @mentions and #references without changing how the text reads.
                    '@', '#' -> append(character).append(ZERO_WIDTH_SPACE)
                    else -> append(character)
                }
            }
        }

        private const val ZERO_WIDTH_SPACE = '​'
    }
}

/** Where an issue created from CoDraw links back to: the element or the thread on the board. */
data class BackLink(
    /** What the link says, e.g. «элемент «API» на доске «Платежи»». */
    val text: String,
    val url: String,
) {
    companion object {
        /** The link to the [target] of the [board] in the app at [appUrl]. */
        fun of(appUrl: String, board: Board, target: IssueTarget, elementLabel: String?): BackLink {
            val boardPath = "${appUrl.trimEnd('/')}/boards/${board.id}"
            val title = board.title
            val threadId = target.threadId
            return if (threadId != null) {
                BackLink("обсуждение на доске «$title»", "$boardPath?thread=$threadId")
            } else {
                val label = elementLabel?.trim()?.takeIf { it.isNotEmpty() }
                val what = if (label != null) "элемент «$label»" else "элемент"
                BackLink("$what на доске «$title»", "$boardPath?page=${encode(target.pageId!!)}&cell=${encode(target.cellId!!)}")
            }
        }

        private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8)
    }
}

/** The board has no such link. */
class IssueLinkNotFoundException : RuntimeException("Issue link not found")

/** The board has no such thread. */
class ThreadNotFoundException : RuntimeException("Thread not found")

/** The role of the user does not let them change this link. */
class IssueLinkForbiddenException : RuntimeException("Only the owner and editors link issues to elements")

/** The earlier request with the same id is creating its issue now. */
class CreationInProgressException : RuntimeException("The issue of this request is being created")

/** The board has as many links as the [limit] allows. */
class IssueLinkLimitReachedException(val limit: Int) : RuntimeException("The board has $limit linked issues, the most allowed")
