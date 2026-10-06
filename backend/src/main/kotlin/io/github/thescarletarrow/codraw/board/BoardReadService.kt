package io.github.thescarletarrow.codraw.board

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/** What changed on a board since the previous visit of a user. */
data class ChangesSinceVisit(
    /** When the previous visit ended; `null` during the first visit. */
    val since: Instant?,
    /** Other participants whose changes the comparison with the [baseline] shows, in the order of their first change. */
    val authors: List<VersionAuthor>,
    /**
     * The version to compare the board with, about the board as the user left it; `null` when nothing changed or the
     * board has no version to compare with.
     */
    val baseline: VisitBaseline?,
)

/** The version that the changes since a visit start from. */
data class VisitBaseline(
    val id: UUID,
    val createdAt: Instant,
)

/**
 * Visits of users to boards: when they were on a board, and what changed since their previous visit. The caller checks
 * that the user has a role on the board; any role has visits.
 */
@Service
class BoardReadService(
    private val reads: BoardReads,
    private val versions: BoardVersions,
    private val documents: BoardDocumentRepository,
    private val clock: Clock,
) {

    /**
     * A page of the user [userId] opened the board [boardId]: their visit begins, or goes on while another page of theirs
     * is on the board. Returns what changed since their previous visit, by others than themselves.
     */
    @Transactional
    fun start(boardId: UUID, userId: UUID): ChangesSinceVisit {
        val now = now()
        val since = reads.start(userId, boardId, now, now - VISIT_TIMEOUT)
            ?: return ChangesSinceVisit(since = null, authors = emptyList(), baseline = null)
        val changes = changesSince(boardId, since)
        return ChangesSinceVisit(
            since = since,
            authors = versions.authors(changes.authorIds.filter { it != userId }),
            baseline = changes.baseline?.let { VisitBaseline(it.id, it.createdAt) },
        )
    }

    /** A page of the user [userId] is on the board [boardId] now. */
    fun see(boardId: UUID, userId: UUID) = reads.see(userId, boardId, now(), present = true)

    /** A page of the user [userId] left the board [boardId]: their visit ends now, unless another page of theirs is on it. */
    fun leave(boardId: UUID, userId: UUID) = reads.see(userId, boardId, now(), present = false)

    /**
     * The state of the version that the current visit of the user [userId] compares the board [boardId] with, and of no
     * other version; `null` when there is none, e.g. during their first visit or when nothing changed.
     */
    @Transactional(readOnly = true)
    fun baselineState(boardId: UUID, userId: UUID): ByteArray? {
        val since = reads.previousSeenAt(userId, boardId) ?: return null
        val baseline = changesSince(boardId, since).baseline ?: return null
        return versions.state(boardId, baseline.id)
    }

    private fun changesSince(boardId: UUID, since: Instant) =
        VisitChanges.of(since, versions.stamps(boardId), documents.stamp(boardId))

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    companion object {
        /**
         * How long a page that reported no more is still on the board: twice the time between its reports, so that a late
         * report does not end the visit.
         */
        val VISIT_TIMEOUT: Duration = Duration.ofMinutes(2)
    }
}
