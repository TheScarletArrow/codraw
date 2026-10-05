package io.github.thescarletarrow.codraw.board

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class BoardVersionService(private val versions: BoardVersions, private val clock: Clock) {

    /** Versions of the board, most recent first. */
    fun list(boardId: UUID): List<BoardVersion> = versions.list(boardId)

    fun state(boardId: UUID, versionId: UUID): ByteArray? = versions.state(boardId, versionId)

    /** Saves [state] as a version of the board that its owner asked for. */
    @Transactional
    fun save(boardId: UUID, state: ByteArray, reason: VersionReason): BoardVersion =
        versions.add(boardId, state, reason, now()).also { versions.prune(boardId, LIMIT) }

    /**
     * Called before the document of the board is stored at [at]: keeps the stored document as a version when the board
     * has none from the last [INTERVAL]. So a version is the board before the first change after a pause, and one at
     * least every [INTERVAL] of work.
     */
    fun beforeStore(boardId: UUID, at: Instant) {
        if (versions.keepStoredDocument(boardId, at - INTERVAL, at)) versions.prune(boardId, LIMIT)
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    companion object {
        /** The longest time of work on a board without a new version. */
        val INTERVAL: Duration = Duration.ofMinutes(10)

        /** The most versions a board keeps. */
        const val LIMIT = 100

        /** The largest state of a version that the owner can save. */
        const val MAX_STATE_SIZE = 16 * 1024 * 1024
    }
}
