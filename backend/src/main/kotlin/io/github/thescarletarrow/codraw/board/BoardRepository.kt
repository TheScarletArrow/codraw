package io.github.thescarletarrow.codraw.board

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.ListCrudRepository
import java.time.Instant
import java.util.UUID

interface BoardRepository : ListCrudRepository<Board, UUID> {

    fun findAllByOrderByUpdatedAtDesc(): List<Board>

    @Modifying
    @Query("UPDATE boards SET updated_at = :updatedAt WHERE id = :id")
    fun touch(id: UUID, updatedAt: Instant): Boolean
}
