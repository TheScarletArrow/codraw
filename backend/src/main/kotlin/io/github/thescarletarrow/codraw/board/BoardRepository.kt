package io.github.thescarletarrow.codraw.board

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.ListCrudRepository
import java.time.Instant
import java.util.UUID

interface BoardRepository : ListCrudRepository<Board, UUID> {

    @Query("SELECT * FROM boards WHERE owner_id = :ownerId AND deleted_at IS NULL ORDER BY updated_at DESC")
    fun findAllByOwnerIdOrderByUpdatedAtDesc(ownerId: UUID): List<Board>

    @Query("SELECT count(*) FROM boards WHERE owner_id = :ownerId AND deleted_at IS NULL")
    fun countByOwnerId(ownerId: UUID): Int

    @Query("SELECT EXISTS (SELECT 1 FROM boards WHERE id = :id AND deleted_at IS NULL)")
    fun existsActive(id: UUID): Boolean

    @Query("SELECT * FROM boards WHERE owner_id = :ownerId AND deleted_at > :after ORDER BY deleted_at DESC")
    fun trashOf(ownerId: UUID, after: Instant): List<Board>

    @Modifying
    @Query("UPDATE boards SET deleted_at = :at WHERE id = :id AND owner_id = :ownerId AND deleted_at IS NULL")
    fun moveToTrash(id: UUID, ownerId: UUID, at: Instant): Boolean

    @Modifying
    @Query("UPDATE boards SET deleted_at = NULL WHERE id = :id AND owner_id = :ownerId AND deleted_at > :after")
    fun restore(id: UUID, ownerId: UUID, after: Instant): Boolean

    @Modifying
    @Query("DELETE FROM boards WHERE id = :id AND owner_id = :ownerId AND deleted_at IS NOT NULL")
    fun purgeTrash(id: UUID, ownerId: UUID): Boolean

    @Modifying
    @Query("UPDATE boards SET owner_id = :newOwnerId WHERE owner_id = :ownerId")
    fun changeOwner(ownerId: UUID, newOwnerId: UUID): Int

    /** Gives the board [id] the owner [newOwnerId], if [ownerId] still owns it; the time of change stays. */
    @Modifying
    @Query("UPDATE boards SET owner_id = :newOwnerId WHERE id = :id AND owner_id = :ownerId AND deleted_at IS NULL")
    fun changeOwnerOf(id: UUID, ownerId: UUID, newOwnerId: UUID): Boolean

    @Modifying
    @Query("UPDATE boards SET updated_at = :updatedAt WHERE id = :id AND deleted_at IS NULL")
    fun touch(id: UUID, updatedAt: Instant): Boolean

    /** Changes only the title and the time of change, so that a concurrent change of the link access stays. */
    @Modifying
    @Query("UPDATE boards SET title = :title, updated_at = :updatedAt WHERE id = :id AND deleted_at IS NULL")
    fun rename(id: UUID, title: String, updatedAt: Instant): Boolean

    /** Changes only the link access, so that a concurrent change of the title or of the document keeps its time. */
    @Modifying
    @Query("UPDATE boards SET link_access = :linkAccess WHERE id = :id AND deleted_at IS NULL")
    fun updateLinkAccess(id: UUID, linkAccess: String): Boolean
}
