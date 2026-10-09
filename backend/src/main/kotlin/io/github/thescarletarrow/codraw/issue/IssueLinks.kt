package io.github.thescarletarrow.codraw.issue

import com.fasterxml.jackson.annotation.JsonValue
import io.github.thescarletarrow.codraw.comment.Person
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** An issue tracker. Stored by its name. */
enum class Tracker(@get:JsonValue val value: String) {
    GITHUB("github"),
}

/** A connection of a user to the tracker, with its token: never give it to anybody but the backend itself. */
data class TrackerConnection(
    val userId: UUID,
    val tracker: Tracker,
    val token: String,
    /** The account of the tracker that the token belongs to. */
    val login: String,
    val createdAt: Instant,
    /** When the tracker refused the token; it is not used since. */
    val rejectedAt: Instant?,
) {
    /** Whether the token may be used. */
    val working: Boolean
        get() = rejectedAt == null
}

/** What CoDraw knows of whether a linked issue is up to date. */
enum class LinkSync(@get:JsonValue val value: String) {
    /** The issue is there, as CoDraw shows it. */
    OK("ok"),

    /** The token of the user who linked it no longer reaches the issue: it is gone, or so is their access. */
    NO_ACCESS("no-access"),

    /** The issue was deleted in the tracker. */
    DELETED("deleted"),

    /**
     * Nobody keeps the link up to date: the user who linked it disconnected, the tracker refused their token, or they
     * are deleted. Never stored: it follows from the connection.
     */
    DISCONNECTED("disconnected"),
}

/** What an issue is linked to: an element of a page, or a thread of comments of the board. */
data class IssueTarget(
    val pageId: String?,
    val cellId: String?,
    val threadId: UUID?,
) {
    init {
        require((threadId == null) == (pageId != null && cellId != null) && (pageId == null) == (cellId == null)) {
            "An issue is linked to an element or to a thread"
        }
    }

    val element: Boolean
        get() = threadId == null

    companion object {
        fun element(pageId: String, cellId: String) = IssueTarget(pageId, cellId, null)

        fun thread(threadId: UUID) = IssueTarget(null, null, threadId)
    }
}

/** A stored link with what the backend needs to keep it up to date. */
data class StoredIssueLink(
    val id: UUID,
    val boardId: UUID,
    val target: IssueTarget,
    val tracker: Tracker,
    val externalId: Long,
    val repository: String,
    val number: Int,
    val title: String,
    val state: IssueState,
    val stateReason: IssueStateReason?,
    val url: String,
    val private: Boolean,
    val issueUpdatedAt: Instant,
    /** What CoDraw learned when it last asked, never [LinkSync.DISCONNECTED]. */
    val syncStatus: LinkSync,
    val syncedAt: Instant,
    /** Whose token keeps the link up to date; `null` once they are deleted. */
    val linkedBy: Person?,
    /** Whether the user who linked the issue has a connection that the tracker did not refuse. */
    val linkerConnected: Boolean,
    val createdHere: Boolean,
    val createdAt: Instant,
) {
    /** What the participants of the board see of the link. */
    fun view() = IssueLink(
        id = id,
        pageId = target.pageId,
        cellId = target.cellId,
        threadId = target.threadId,
        tracker = tracker,
        repository = repository,
        number = number,
        title = title,
        state = state,
        stateReason = stateReason,
        url = url,
        private = private,
        sync = if (syncStatus == LinkSync.OK && !linkerConnected) LinkSync.DISCONNECTED else syncStatus,
        syncedAt = syncedAt,
        linkedBy = linkedBy,
        createdHere = createdHere,
        createdAt = createdAt,
    )
}

/**
 * An issue linked to an element or a thread of a board, as CoDraw last saw it: everybody who may open the board sees it.
 * Exactly one of [cellId] (with [pageId]) and [threadId] is set.
 */
data class IssueLink(
    val id: UUID,
    val pageId: String?,
    val cellId: String?,
    val threadId: UUID?,
    val tracker: Tracker,
    /** `owner/name` of the repository. */
    val repository: String,
    val number: Int,
    val title: String,
    val state: IssueState,
    val stateReason: IssueStateReason?,
    /** The page of the issue in the tracker. */
    val url: String,
    /** The repository is private: the user who linked the issue chose to show it to the participants of the board. */
    val private: Boolean,
    val sync: LinkSync,
    /** When CoDraw last learned of the issue from the tracker. */
    val syncedAt: Instant,
    /** Whose connection keeps the link up to date; `null` once they are deleted. */
    val linkedBy: Person?,
    /** The issue was created from CoDraw. */
    val createdHere: Boolean,
    val createdAt: Instant,
)

/** Connections of users to the tracker. Every method works on the connection of one user. */
@Repository
class TrackerConnections(private val jdbc: JdbcClient) {

    fun find(userId: UUID, tracker: Tracker): TrackerConnection? =
        jdbc.sql("SELECT * FROM issue_tracker_connections WHERE user_id = :userId AND tracker = :tracker")
            .param("userId", userId)
            .param("tracker", tracker.name)
            .query { rs, _ -> rs.toConnection() }
            .optional()
            .orElse(null)

    /** Gives the user the connection with the [token] of the account [login] in place of any earlier one. */
    fun save(userId: UUID, tracker: Tracker, token: String, login: String, at: Instant): TrackerConnection = jdbc.sql(
        """
        INSERT INTO issue_tracker_connections (user_id, tracker, token, login, created_at)
        VALUES (:userId, :tracker, :token, :login, :at)
        ON CONFLICT (user_id, tracker) DO UPDATE SET
            token = EXCLUDED.token, login = EXCLUDED.login, created_at = EXCLUDED.created_at, rejected_at = NULL
        RETURNING *
        """,
    )
        .param("userId", userId)
        .param("tracker", tracker.name)
        .param("token", token)
        .param("login", login)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> rs.toConnection() }
        .single()

    /** Deletes the connection; `false` when the user has none. */
    fun delete(userId: UUID, tracker: Tracker): Boolean =
        jdbc.sql("DELETE FROM issue_tracker_connections WHERE user_id = :userId AND tracker = :tracker")
            .param("userId", userId)
            .param("tracker", tracker.name)
            .update() > 0

    /** The tracker refused the [token] of the user at [at]; a token that the user replaced meanwhile stays. */
    fun rejected(userId: UUID, tracker: Tracker, token: String, at: Instant) {
        jdbc.sql(
            """
            UPDATE issue_tracker_connections SET rejected_at = :at
            WHERE user_id = :userId AND tracker = :tracker AND token = :token AND rejected_at IS NULL
            """,
        )
            .param("userId", userId)
            .param("tracker", tracker.name)
            .param("token", token)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    private fun ResultSet.toConnection() = TrackerConnection(
        userId = getObject("user_id", UUID::class.java),
        tracker = Tracker.valueOf(getString("tracker")),
        token = getString("token"),
        login = getString("login"),
        createdAt = instant("created_at")!!,
        rejectedAt = instant("rejected_at"),
    )
}

/** Whether a request to create an issue may go to the tracker, see [IssueCreations.reserve]. */
sealed interface Reservation {
    /** The request is the first one, or the earlier one with its id was abandoned: the caller creates the issue. */
    data object Reserved : Reservation

    /** The earlier request with the id created the issue of the link [linkId]. */
    data class Done(val linkId: UUID) : Reservation

    /** The earlier request with the id is creating the issue now. */
    data object InProgress : Reservation
}

/** Requests of users to create issues, by the ids that their clients chose, so that a repeated one creates nothing. */
@Repository
class IssueCreations(private val jdbc: JdbcClient) {

    /**
     * Reserves the request [requestId] of the user [userId] at [at]. A request that is still creating its issue since
     * before [abandonedBefore] is taken as lost, e.g. with an instance of the backend that stopped.
     */
    fun reserve(userId: UUID, requestId: UUID, at: Instant, abandonedBefore: Instant): Reservation {
        val reserved = jdbc.sql(
            """
            INSERT INTO issue_creations (user_id, request_id, created_at) VALUES (:userId, :requestId, :at)
            ON CONFLICT (user_id, request_id) DO UPDATE SET created_at = EXCLUDED.created_at
                WHERE issue_creations.link_id IS NULL AND issue_creations.created_at < :abandonedBefore
            RETURNING request_id
            """,
        )
            .param("userId", userId)
            .param("requestId", requestId)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .param("abandonedBefore", abandonedBefore.atOffset(ZoneOffset.UTC))
            .query(UUID::class.java)
            .optional()
            .isPresent
        if (reserved) return Reservation.Reserved
        val linkId = jdbc.sql("SELECT link_id FROM issue_creations WHERE user_id = :userId AND request_id = :requestId")
            .param("userId", userId)
            .param("requestId", requestId)
            .query { rs, _ -> rs.getObject("link_id", UUID::class.java) }
            .optional()
            .orElse(null)
        return linkId?.let(Reservation::Done) ?: Reservation.InProgress
    }

    /** The request created the issue of the link [linkId]. */
    fun finish(userId: UUID, requestId: UUID, linkId: UUID) {
        jdbc.sql("UPDATE issue_creations SET link_id = :linkId WHERE user_id = :userId AND request_id = :requestId")
            .param("userId", userId)
            .param("requestId", requestId)
            .param("linkId", linkId)
            .update()
    }

    /** The request created nothing: a repeated one may try again. */
    fun release(userId: UUID, requestId: UUID) {
        jdbc.sql("DELETE FROM issue_creations WHERE user_id = :userId AND request_id = :requestId AND link_id IS NULL")
            .param("userId", userId)
            .param("requestId", requestId)
            .update()
    }

    /** Forgets the requests of the user made before [before]: nobody repeats them so late. */
    fun forget(userId: UUID, before: Instant) {
        jdbc.sql("DELETE FROM issue_creations WHERE user_id = :userId AND created_at < :before")
            .param("userId", userId)
            .param("before", before.atOffset(ZoneOffset.UTC))
            .update()
    }
}

/** Issues linked to elements and threads of boards. */
@Repository
class IssueLinks(private val jdbc: JdbcClient) {

    /** All links of the board, oldest first. */
    fun links(boardId: UUID): List<StoredIssueLink> = load("l.board_id = :boardId") { param("boardId", boardId) }

    fun link(boardId: UUID, linkId: UUID): StoredIssueLink? =
        load("l.board_id = :boardId AND l.id = :linkId") { param("boardId", boardId).param("linkId", linkId) }.singleOrNull()

    /** The links [linkIds] of the board; ids of other boards are left out. */
    fun links(boardId: UUID, linkIds: Collection<UUID>): List<StoredIssueLink> =
        if (linkIds.isEmpty()) {
            emptyList()
        } else {
            load("l.board_id = :boardId AND l.id IN (:linkIds)") { param("boardId", boardId).param("linkIds", linkIds) }
        }

    /** Locks the board till the end of the transaction, so that links counted per board do not race. */
    fun lockBoard(boardId: UUID) {
        jdbc.sql("SELECT id FROM boards WHERE id = :boardId FOR NO KEY UPDATE").param("boardId", boardId).query().listOfRows()
    }

    fun countOnBoard(boardId: UUID): Int = jdbc.sql("SELECT count(*) FROM issue_links WHERE board_id = :boardId")
        .param("boardId", boardId)
        .query(Int::class.java)
        .single()

    /** Whether the [issue] is linked to the [target] of the board already. */
    fun exists(boardId: UUID, target: IssueTarget, tracker: Tracker, externalId: Long): Boolean = jdbc.sql(
        """
        SELECT EXISTS (
            SELECT 1 FROM issue_links
            WHERE board_id = :boardId AND page_id IS NOT DISTINCT FROM :pageId AND cell_id IS NOT DISTINCT FROM :cellId
              AND thread_id IS NOT DISTINCT FROM :threadId AND tracker = :tracker AND external_id = :externalId
        )
        """,
    )
        .param("boardId", boardId)
        .target(target)
        .param("tracker", tracker.name)
        .param("externalId", externalId)
        .query(Boolean::class.java)
        .single()

    /**
     * Links the [issue] to the [target] of the board for the user [userId], or, when it is linked there already, brings
     * that link up to date and makes it theirs. Returns the id of the link and whether it is new.
     */
    fun save(
        boardId: UUID,
        target: IssueTarget,
        tracker: Tracker,
        issue: TrackerIssue,
        private: Boolean,
        userId: UUID,
        createdHere: Boolean,
        at: Instant,
    ): Pair<UUID, Boolean> = jdbc.sql(
        """
        INSERT INTO issue_links (board_id, page_id, cell_id, thread_id, tracker, external_id, repository, number, title,
                                 state, state_reason, url, private, issue_updated_at, sync_status, synced_at, linked_by,
                                 created_here, created_at)
        VALUES (:boardId, :pageId, :cellId, :threadId, :tracker, :externalId, :repository, :number, :title, :state,
                :stateReason, :url, :private, :issueUpdatedAt, 'OK', :at, :userId, :createdHere, :at)
        ON CONFLICT ON CONSTRAINT issue_links_target_issue_key DO UPDATE SET
            repository = EXCLUDED.repository, number = EXCLUDED.number, title = EXCLUDED.title, state = EXCLUDED.state,
            state_reason = EXCLUDED.state_reason, url = EXCLUDED.url, private = EXCLUDED.private,
            issue_updated_at = EXCLUDED.issue_updated_at, sync_status = 'OK', synced_at = EXCLUDED.synced_at,
            linked_by = EXCLUDED.linked_by
        RETURNING id, xmax = 0 AS inserted
        """,
    )
        .param("boardId", boardId)
        .target(target)
        .param("tracker", tracker.name)
        .issue(issue)
        .param("private", private)
        .param("userId", userId)
        .param("createdHere", createdHere)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> rs.getObject("id", UUID::class.java) to rs.getBoolean("inserted") }
        .single()

    /**
     * Brings the link [linkId] up to date with the [issue] as the tracker showed it at [at], made the link of the user
     * [userId] when given, or of the same user. `false` when the issue is linked to the same target under another link
     * already, e.g. after it was transferred: the caller deletes this one.
     */
    fun update(linkId: UUID, issue: TrackerIssue, private: Boolean?, userId: UUID?, at: Instant): Boolean = jdbc.sql(
        """
        UPDATE issue_links l SET
            external_id = :externalId, repository = :repository, number = :number, title = :title, state = :state,
            state_reason = :stateReason, url = :url, private = coalesce(:private, l.private),
            issue_updated_at = :issueUpdatedAt, sync_status = 'OK', synced_at = :at,
            linked_by = coalesce(:userId, l.linked_by)
        WHERE l.id = :linkId AND NOT EXISTS (
            SELECT 1 FROM issue_links o
            WHERE o.id <> l.id AND o.board_id = l.board_id AND o.page_id IS NOT DISTINCT FROM l.page_id
              AND o.cell_id IS NOT DISTINCT FROM l.cell_id AND o.thread_id IS NOT DISTINCT FROM l.thread_id
              AND o.tracker = l.tracker AND o.external_id = :externalId
        )
        """,
    )
        .param("linkId", linkId)
        .issue(issue)
        .param("private", private)
        .param("userId", userId)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .update() > 0

    /** The tracker told at [at] that the issue of the link is [status]: gone for the token, or deleted. */
    fun synced(linkId: UUID, status: LinkSync, at: Instant) {
        require(status == LinkSync.NO_ACCESS || status == LinkSync.DELETED) { "Only a failed sync is stored this way" }
        jdbc.sql("UPDATE issue_links SET sync_status = :status, synced_at = :at WHERE id = :linkId")
            .param("linkId", linkId)
            .param("status", status.name)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** Deletes the link; `false` when the board has no such link. The issue stays in the tracker. */
    fun delete(boardId: UUID, linkId: UUID): Boolean =
        jdbc.sql("DELETE FROM issue_links WHERE board_id = :boardId AND id = :linkId")
            .param("boardId", boardId)
            .param("linkId", linkId)
            .update() > 0

    /**
     * An event of the webhook of the tracker: the issue [externalId] is now [issue] and its repository [private]. Links
     * that learned of a later change of the issue keep it, so a repeated or late event changes nothing. Returns how many
     * links changed.
     */
    fun changed(tracker: Tracker, externalId: Long, issue: TrackerIssue, private: Boolean, at: Instant): Int = jdbc.sql(
        """
        UPDATE issue_links l SET
            external_id = :externalId, repository = :repository, number = :number, title = :title, state = :state,
            state_reason = :stateReason, url = :url, private = :private, issue_updated_at = :issueUpdatedAt,
            synced_at = :at
        WHERE l.tracker = :tracker AND l.external_id = :previousId AND l.issue_updated_at <= :issueUpdatedAt
          AND NOT EXISTS (
            SELECT 1 FROM issue_links o
            WHERE o.id <> l.id AND o.board_id = l.board_id AND o.page_id IS NOT DISTINCT FROM l.page_id
              AND o.cell_id IS NOT DISTINCT FROM l.cell_id AND o.thread_id IS NOT DISTINCT FROM l.thread_id
              AND o.tracker = l.tracker AND o.external_id = :externalId
          )
        """,
    )
        .param("tracker", tracker.name)
        .param("previousId", externalId)
        .issue(issue)
        .param("private", private)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .update()

    /** An event of the webhook of the tracker: the issue [externalId] was deleted. Returns how many links changed. */
    fun deleted(tracker: Tracker, externalId: Long, at: Instant): Int = jdbc.sql(
        """
        UPDATE issue_links SET sync_status = 'DELETED', synced_at = :at
        WHERE tracker = :tracker AND external_id = :externalId AND sync_status <> 'DELETED'
        """,
    )
        .param("tracker", tracker.name)
        .param("externalId", externalId)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .update()

    private fun load(condition: String, bind: JdbcClient.StatementSpec.() -> JdbcClient.StatementSpec): List<StoredIssueLink> =
        jdbc.sql(
            """
            SELECT l.*, u.id AS linker_id, u.name AS linker_name, u.avatar_url AS linker_avatar_url,
                   (c.user_id IS NOT NULL AND c.rejected_at IS NULL) AS linker_connected
            FROM issue_links l
            LEFT JOIN users u ON u.id = l.linked_by
            LEFT JOIN issue_tracker_connections c ON c.user_id = l.linked_by AND c.tracker = l.tracker
            WHERE $condition
            ORDER BY l.created_at, l.id
            """,
        )
            .bind()
            .query { rs, _ -> rs.toLink() }
            .list()

    private fun JdbcClient.StatementSpec.target(target: IssueTarget): JdbcClient.StatementSpec = this
        .param("pageId", target.pageId)
        .param("cellId", target.cellId)
        .param("threadId", target.threadId)

    private fun JdbcClient.StatementSpec.issue(issue: TrackerIssue): JdbcClient.StatementSpec = this
        .param("externalId", issue.externalId)
        .param("repository", issue.repository)
        .param("number", issue.number)
        .param("title", issue.title)
        .param("state", issue.state.name)
        .param("stateReason", issue.stateReason?.name)
        .param("url", issue.url)
        .param("issueUpdatedAt", issue.updatedAt.atOffset(ZoneOffset.UTC))

    private fun ResultSet.toLink() = StoredIssueLink(
        id = getObject("id", UUID::class.java),
        boardId = getObject("board_id", UUID::class.java),
        target = IssueTarget(getString("page_id"), getString("cell_id"), getObject("thread_id", UUID::class.java)),
        tracker = Tracker.valueOf(getString("tracker")),
        externalId = getLong("external_id"),
        repository = getString("repository"),
        number = getInt("number"),
        title = getString("title"),
        state = IssueState.valueOf(getString("state")),
        stateReason = getString("state_reason")?.let(IssueStateReason::valueOf),
        url = getString("url"),
        private = getBoolean("private"),
        issueUpdatedAt = instant("issue_updated_at")!!,
        syncStatus = LinkSync.valueOf(getString("sync_status")),
        syncedAt = instant("synced_at")!!,
        linkedBy = getObject("linker_id", UUID::class.java)?.let { Person(it, getString("linker_name"), getString("linker_avatar_url")) },
        linkerConnected = getBoolean("linker_connected"),
        createdHere = getBoolean("created_here"),
        createdAt = instant("created_at")!!,
    )
}

private fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()
