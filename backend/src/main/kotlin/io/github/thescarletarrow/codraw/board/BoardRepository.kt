package io.github.thescarletarrow.codraw.board

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.ListCrudRepository
import java.time.Instant
import java.util.UUID

interface BoardRepository : ListCrudRepository<Board, UUID> {

    fun findAllByOwnerIdOrderByUpdatedAtDesc(ownerId: UUID): List<Board>

    fun countByOwnerId(ownerId: UUID): Int

    @Modifying
    @Query("UPDATE boards SET owner_id = :newOwnerId WHERE owner_id = :ownerId")
    fun changeOwner(ownerId: UUID, newOwnerId: UUID): Int

    /** Gives the board [id] the owner [newOwnerId], if [ownerId] still owns it; the time of change stays. */
    @Modifying
    @Query("UPDATE boards SET owner_id = :newOwnerId WHERE id = :id AND owner_id = :ownerId")
    fun changeOwnerOf(id: UUID, ownerId: UUID, newOwnerId: UUID): Boolean

    @Modifying
    @Query("UPDATE boards SET updated_at = :updatedAt WHERE id = :id")
    fun touch(id: UUID, updatedAt: Instant): Boolean

    /** Changes only the title and the time of change, so that a concurrent change of the link access stays. */
    @Modifying
    @Query("UPDATE boards SET title = :title, updated_at = :updatedAt WHERE id = :id")
    fun rename(id: UUID, title: String, updatedAt: Instant): Boolean

    /** Changes only the link access, so that a concurrent change of the title or of the document keeps its time. */
    @Modifying
    @Query("UPDATE boards SET link_access = :linkAccess WHERE id = :id")
    fun updateLinkAccess(id: UUID, linkAccess: String): Boolean
}
