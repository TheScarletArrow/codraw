package io.github.thescarletarrow.codraw.board

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.ListCrudRepository
import java.time.Instant
import java.util.UUID

interface BoardRepository : ListCrudRepository<Board, UUID> {

    /** The personal boards of the user [ownerId]: those of workspaces are in their workspaces. */
    @Query("SELECT * FROM boards WHERE owner_id = :ownerId AND workspace_id IS NULL AND deleted_at IS NULL ORDER BY updated_at DESC")
    fun findAllByOwnerIdOrderByUpdatedAtDesc(ownerId: UUID): List<Board>

    /** How many personal boards the user [ownerId] owns, as the limit counts them. */
    @Query("SELECT count(*) FROM boards WHERE owner_id = :ownerId AND workspace_id IS NULL AND deleted_at IS NULL")
    fun countByOwnerId(ownerId: UUID): Int

    /** How many boards the workspace [workspaceId] has, as the limit counts them. */
    @Query("SELECT count(*) FROM boards WHERE workspace_id = :workspaceId AND deleted_at IS NULL")
    fun countInWorkspace(workspaceId: UUID): Int

    @Query("SELECT EXISTS (SELECT 1 FROM boards WHERE id = :id AND deleted_at IS NULL)")
    fun existsActive(id: UUID): Boolean

    /**
     * The boards in the trash since [after] that the user [userId] may restore: their personal boards, and boards of
     * workspaces that they are responsible for or whose workspace they manage.
     */
    @Query(
        """
        SELECT * FROM boards b
        WHERE b.deleted_at > :after AND (
            b.owner_id = :userId OR EXISTS (
                SELECT 1 FROM workspace_members m
                WHERE m.workspace_id = b.workspace_id AND m.user_id = :userId AND m.role IN ('OWNER', 'ADMIN')
            )
        )
        ORDER BY b.deleted_at DESC
        """,
    )
    fun trashOf(userId: UUID, after: Instant): List<Board>

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

    /** Changes only what the workspace gives its members on the board, which is not a change of the board either. */
    @Modifying
    @Query("UPDATE boards SET workspace_access = :workspaceAccess WHERE id = :id AND workspace_id IS NOT NULL AND deleted_at IS NULL")
    fun updateWorkspaceAccess(id: UUID, workspaceAccess: String): Boolean

    /**
     * Changes only the link access, so that a concurrent change of the title or of the document keeps its time. A board
     * whose sharing an administrator blocked only closes its link: `false` then.
     */
    @Modifying
    @Query(
        "UPDATE boards SET link_access = :linkAccess WHERE id = :id AND deleted_at IS NULL " +
            "AND (sharing_blocked_at IS NULL OR :linkAccess = 'NONE')",
    )
    fun updateLinkAccess(id: UUID, linkAccess: String): Boolean

    /** Closes the link of the board [id], in the trash too, and keeps its owner from opening it; `false` when it was. */
    @Modifying
    @Query("UPDATE boards SET link_access = 'NONE', sharing_blocked_at = :at WHERE id = :id AND sharing_blocked_at IS NULL")
    fun blockSharing(id: UUID, at: Instant): Boolean

    /** Lets the owner of the board [id] open its link again; `false` when it was not blocked. */
    @Modifying
    @Query("UPDATE boards SET sharing_blocked_at = NULL WHERE id = :id AND sharing_blocked_at IS NOT NULL")
    fun unblockSharing(id: UUID): Boolean
}
