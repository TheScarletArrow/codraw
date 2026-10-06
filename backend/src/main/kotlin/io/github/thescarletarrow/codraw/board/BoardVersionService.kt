package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.LimitProperties
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class BoardVersionService(
    private val versions: BoardVersions,
    private val limits: LimitProperties,
    private val clock: Clock,
) {

    /** Versions of the board, most recent first. */
    fun list(boardId: UUID): List<BoardVersion> = versions.list(boardId)

    fun state(boardId: UUID, versionId: UUID): ByteArray? = versions.state(boardId, versionId)

    /**
     * Saves [state] as a version of the board that an editor of it asked for, with the [name] if any. Its authors are
     * those who changed the board since the latest version, as far as collab has stored their changes.
     */
    @Transactional
    fun save(boardId: UUID, state: ByteArray, reason: VersionReason, name: String? = null): BoardVersion =
        versions.add(boardId, state, reason, name, now()).also { prune(boardId) }

    /** Gives the version a [name], or takes it away with `null`; returns `null` when the board has no such version. */
    fun rename(boardId: UUID, versionId: UUID, name: String?): BoardVersion? = versions.rename(boardId, versionId, name)

    /**
     * Called before the document of the board is stored at [at]: keeps the stored document as a version when the board
     * has none from the last [INTERVAL]. So a version is the board before the first change after a pause, and one at
     * least every [INTERVAL] of work.
     */
    fun beforeStore(boardId: UUID, at: Instant) {
        if (versions.keepStoredDocument(boardId, at - INTERVAL, at)) prune(boardId)
    }

    /** Passes the changes of the guest [fromUserId] on all boards to the user [toUserId] who signs in. */
    fun transfer(fromUserId: UUID, toUserId: UUID) = versions.transfer(fromUserId, toUserId)

    private fun prune(boardId: UUID) = versions.prune(boardId, LIMIT, limits.versionsSizePerBoard.toBytes())

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    companion object {
        /** The longest time of work on a board without a new version. */
        val INTERVAL: Duration = Duration.ofMinutes(10)

        /** The most versions a board keeps. */
        const val LIMIT = 100

        /** The most authors a version names: more participants than this hardly change one board between two versions. */
        const val AUTHORS_LIMIT = 100

        /** The longest name of a version. */
        const val NAME_MAX_LENGTH = 100
    }
}
