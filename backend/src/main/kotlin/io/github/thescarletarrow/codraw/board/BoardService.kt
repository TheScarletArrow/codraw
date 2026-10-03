package io.github.thescarletarrow.codraw.board

import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class BoardService(
    private val boards: BoardRepository,
    private val clock: Clock,
) {

    fun create(title: String): Board {
        val now = now()
        return boards.save(Board(title = title, createdAt = now, updatedAt = now))
    }

    fun list(): List<Board> = boards.findAllByOrderByUpdatedAtDesc()

    fun find(id: UUID): Board? = boards.findByIdOrNull(id)

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)
}
