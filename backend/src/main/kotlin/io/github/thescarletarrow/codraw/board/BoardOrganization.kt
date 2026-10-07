package io.github.thescarletarrow.codraw.board

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

/** A personal folder of boards of a user. */
data class BoardFolder(
    val id: UUID,
    val name: String,
)

/** How a user organized the boards of their list: their tags of each board and the folder of each board. */
data class Organization(
    val tags: Map<UUID, List<String>>,
    val folders: Map<UUID, UUID>,
) {
    fun tagsOf(boardId: UUID): List<String> = tags[boardId].orEmpty()

    fun folderOf(boardId: UUID): UUID? = folders[boardId]
}

/**
 * Personal folders and tags of users and the folders of their boards. Rows belong to their user, not to the board:
 * nobody else sees them. The caller checks that the board is in the list of the user.
 */
@Repository
class BoardOrganization(private val jdbc: JdbcClient) {

    /** The folders of the user [userId], by name. */
    fun folders(userId: UUID): List<BoardFolder> = jdbc.sql(
        "SELECT id, name FROM board_folders WHERE user_id = :userId ORDER BY lower(name), id",
    )
        .param("userId", userId)
        .query { rs, _ -> BoardFolder(rs.getObject("id", UUID::class.java), rs.getString("name")) }
        .list()

    fun addFolder(userId: UUID, name: String, at: Instant): BoardFolder = jdbc.sql(
        "INSERT INTO board_folders (user_id, name, created_at) VALUES (:userId, :name, :at) RETURNING id, name",
    )
        .param("userId", userId)
        .param("name", name)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> BoardFolder(rs.getObject("id", UUID::class.java), rs.getString("name")) }
        .single()

    /** Gives the folder [folderId] of the user [userId] a new [name]; `false` when the user has no such folder. */
    fun renameFolder(userId: UUID, folderId: UUID, name: String): Boolean =
        jdbc.sql("UPDATE board_folders SET name = :name WHERE id = :folderId AND user_id = :userId")
            .param("userId", userId)
            .param("folderId", folderId)
            .param("name", name)
            .update() > 0

    /** Deletes the folder [folderId] of the user [userId], and its boards are in no folder; `false` without it. */
    fun deleteFolder(userId: UUID, folderId: UUID): Boolean =
        jdbc.sql("DELETE FROM board_folders WHERE id = :folderId AND user_id = :userId")
            .param("userId", userId)
            .param("folderId", folderId)
            .update() > 0

    /** The different tags of the user [userId] on all boards, each as it is written. */
    fun tags(userId: UUID): List<String> = jdbc.sql("SELECT DISTINCT tag FROM board_tags WHERE user_id = :userId")
        .param("userId", userId)
        .query(String::class.java)
        .list()
        .filterNotNull()

    /** The tags of the user [userId] on the board [boardId]. */
    fun tagsOf(userId: UUID, boardId: UUID): List<String> = jdbc.sql(
        "SELECT tag FROM board_tags WHERE user_id = :userId AND board_id = :boardId ORDER BY tag",
    )
        .param("userId", userId)
        .param("boardId", boardId)
        .query(String::class.java)
        .list()
        .filterNotNull()

    /** Replaces the tags of the user [userId] on the board [boardId] with [tags], which differ regardless of case. */
    fun setTags(userId: UUID, boardId: UUID, tags: List<String>) {
        jdbc.sql("DELETE FROM board_tags WHERE user_id = :userId AND board_id = :boardId")
            .param("userId", userId)
            .param("boardId", boardId)
            .update()
        if (tags.isEmpty()) return
        jdbc.sql("INSERT INTO board_tags (user_id, board_id, tag) SELECT :userId, :boardId, unnest(:tags::text[])")
            .param("userId", userId)
            .param("boardId", boardId)
            .param("tags", tags.toTypedArray())
            .update()
    }

    /** Puts the board [boardId] into the folder [folderId] of the user [userId], or with `null` into none. */
    fun place(userId: UUID, boardId: UUID, folderId: UUID?) {
        if (folderId == null) {
            jdbc.sql("DELETE FROM board_placements WHERE user_id = :userId AND board_id = :boardId")
                .param("userId", userId)
                .param("boardId", boardId)
                .update()
            return
        }
        jdbc.sql(
            """
            INSERT INTO board_placements (user_id, board_id, folder_id) VALUES (:userId, :boardId, :folderId)
            ON CONFLICT (user_id, board_id) DO UPDATE SET folder_id = EXCLUDED.folder_id
            """,
        )
            .param("userId", userId)
            .param("boardId", boardId)
            .param("folderId", folderId)
            .update()
    }

    /** The tags and the folders of all boards of the user [userId]. */
    fun of(userId: UUID): Organization {
        val tags = jdbc.sql("SELECT board_id, tag FROM board_tags WHERE user_id = :userId ORDER BY board_id, tag")
            .param("userId", userId)
            .query { rs, _ -> rs.getObject("board_id", UUID::class.java) to rs.getString("tag") }
            .list()
            .groupBy({ it.first }, { it.second })
        val folders = jdbc.sql("SELECT board_id, folder_id FROM board_placements WHERE user_id = :userId")
            .param("userId", userId)
            .query { rs, _ -> rs.getObject("board_id", UUID::class.java) to rs.getObject("folder_id", UUID::class.java) }
            .list()
            .toMap()
        return Organization(tags, folders)
    }

    /** The users who gave the board [boardId] tags or put it into a folder. */
    fun users(boardId: UUID): List<UUID> = jdbc.sql(
        """
        SELECT user_id FROM board_tags WHERE board_id = :boardId
        UNION
        SELECT user_id FROM board_placements WHERE board_id = :boardId
        """,
    )
        .param("boardId", boardId)
        .query(UUID::class.java)
        .list()
        .filterNotNull()

    /** Forgets the tags and the folder of the board [boardId] of the users [userIds]. */
    fun forget(boardId: UUID, userIds: Collection<UUID>) {
        if (userIds.isEmpty()) return
        for (table in listOf("board_tags", "board_placements")) {
            jdbc.sql("DELETE FROM $table WHERE board_id = :boardId AND user_id = ANY (:userIds::uuid[])")
                .param("boardId", boardId)
                .param("userIds", userIds.toTypedArray())
                .update()
        }
    }

    /**
     * Passes the folders, the tags and the folders of boards of the user [fromUserId] to the user [toUserId]. A folder
     * whose name [toUserId] has, regardless of case, merges into theirs; a tag that [toUserId] has is written as theirs
     * and is not repeated on a board; a board that both put into folders stays in the folder of [toUserId].
     */
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        jdbc.sql(
            """
            INSERT INTO board_folders (user_id, name, created_at)
            SELECT :toUserId, f.name, f.created_at FROM board_folders f
            WHERE f.user_id = :fromUserId
              AND NOT EXISTS (SELECT 1 FROM board_folders t WHERE t.user_id = :toUserId AND lower(t.name) = lower(f.name))
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql(
            """
            INSERT INTO board_placements (user_id, board_id, folder_id)
            SELECT :toUserId, p.board_id, t.id
            FROM board_placements p
            JOIN board_folders f ON f.id = p.folder_id
            JOIN board_folders t ON t.user_id = :toUserId AND lower(t.name) = lower(f.name)
            WHERE p.user_id = :fromUserId
            ON CONFLICT (user_id, board_id) DO NOTHING
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql(
            """
            INSERT INTO board_tags (user_id, board_id, tag)
            SELECT :toUserId, g.board_id,
                   coalesce((SELECT min(t.tag) FROM board_tags t WHERE t.user_id = :toUserId AND lower(t.tag) = lower(g.tag)), g.tag)
            FROM board_tags g
            WHERE g.user_id = :fromUserId
            ON CONFLICT DO NOTHING
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        // Deleting the folders takes their boards out of them.
        jdbc.sql("DELETE FROM board_folders WHERE user_id = :fromUserId").param("fromUserId", fromUserId).update()
        jdbc.sql("DELETE FROM board_tags WHERE user_id = :fromUserId").param("fromUserId", fromUserId).update()
    }
}
