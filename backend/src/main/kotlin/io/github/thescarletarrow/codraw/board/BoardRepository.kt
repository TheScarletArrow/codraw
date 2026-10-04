package io.github.thescarletarrow.codraw.board

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.ListCrudRepository
import java.time.Instant
import java.util.UUID

interface BoardRepository : ListCrudRepository<Board, UUID> {

    fun findAllByOwnerIdOrderByUpdatedAtDesc(ownerId: UUID): List<Board>

    fun findByIdAndOwnerId(id: UUID, ownerId: UUID): Board?

    @Modifying
    @Query("UPDATE boards SET owner_id = :newOwnerId WHERE owner_id = :ownerId")
    fun changeOwner(ownerId: UUID, newOwnerId: UUID): Int

    @Modifying
    @Query("UPDATE boards SET updated_at = :updatedAt WHERE id = :id")
    fun touch(id: UUID, updatedAt: Instant): Boolean
}
