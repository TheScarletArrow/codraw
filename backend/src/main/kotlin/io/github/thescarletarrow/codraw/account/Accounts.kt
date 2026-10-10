package io.github.thescarletarrow.codraw.account

import io.github.thescarletarrow.codraw.board.BoardRole
import io.github.thescarletarrow.codraw.board.Participant
import io.github.thescarletarrow.codraw.user.DELETED_USER_ID
import io.github.thescarletarrow.codraw.workspace.WorkspaceRole
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.util.UUID

/** A personal board of a user that others work on too, which deleting the user must not take away unasked. */
data class SharedBoard(
    val id: UUID,
    val title: String,
    /** Its members, to one of whom it may pass. */
    val members: List<Participant>,
    /** How many others opened it through its link and are not its members. */
    val visitors: Int,
)

/** A workspace of a user with their role in it, and how many owners and members it has. */
data class Membership(val workspaceId: UUID, val name: String, val role: WorkspaceRole, val owners: Int, val members: Int)

/** What deleting an account reads and changes that belongs to no other part of the backend. */
@Repository
class Accounts(private val jdbc: JdbcClient) {

    /** The personal boards of the user [userId] outside of the trash whose members or visitors are others. */
    fun sharedBoards(userId: UUID): List<SharedBoard> {
        val boards = jdbc.sql(
            """
            SELECT b.id, b.title,
                   (SELECT count(*) FROM board_visits v
                    WHERE v.board_id = b.id AND v.user_id <> b.owner_id
                      AND NOT EXISTS (SELECT 1 FROM board_members m WHERE m.board_id = b.id AND m.user_id = v.user_id)
                   ) AS visitors
            FROM boards b
            WHERE b.owner_id = :userId AND b.workspace_id IS NULL AND b.deleted_at IS NULL
              AND (EXISTS (SELECT 1 FROM board_members m WHERE m.board_id = b.id)
                   OR EXISTS (SELECT 1 FROM board_visits v WHERE v.board_id = b.id AND v.user_id <> b.owner_id))
            ORDER BY b.updated_at DESC, b.id
            """,
        )
            .param("userId", userId)
            .query { rs, _ -> Triple(rs.getObject("id", UUID::class.java), rs.getString("title"), rs.getInt("visitors")) }
            .list()
        if (boards.isEmpty()) return emptyList()
        val members = jdbc.sql(
            """
            SELECT m.board_id, u.id, u.name, u.avatar_url, m.role
            FROM board_members m JOIN users u ON u.id = m.user_id
            WHERE m.board_id = ANY (:boardIds::uuid[])
            ORDER BY m.created_at, u.id
            """,
        )
            .param("boardIds", boards.map { it.first }.toTypedArray())
            .query { rs, _ ->
                rs.getObject("board_id", UUID::class.java) to Participant(
                    id = rs.getObject("id", UUID::class.java),
                    name = rs.getString("name"),
                    avatarUrl = rs.getString("avatar_url"),
                    role = BoardRole.valueOf(rs.getString("role")),
                )
            }
            .list()
            .groupBy({ it.first }, { it.second })
        return boards.map { (id, title, visitors) -> SharedBoard(id, title, members[id].orEmpty(), visitors) }
    }

    /** The ids of all personal boards of the user [userId], those in the trash too. */
    fun personalBoards(userId: UUID): List<UUID> =
        jdbc.sql("SELECT id FROM boards WHERE owner_id = :userId AND workspace_id IS NULL ORDER BY id")
            .param("userId", userId)
            .query(UUID::class.java)
            .list()
            .filterNotNull()

    /** The workspaces of the user [userId], by name. */
    fun memberships(userId: UUID): List<Membership> = jdbc.sql(
        """
        SELECT w.id, w.name, m.role,
               (SELECT count(*) FROM workspace_members o WHERE o.workspace_id = w.id AND o.role = 'OWNER') AS owners,
               (SELECT count(*) FROM workspace_members o WHERE o.workspace_id = w.id) AS members
        FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.user_id = :userId
        ORDER BY w.name, w.id
        """,
    )
        .param("userId", userId)
        .query { rs, _ ->
            Membership(
                workspaceId = rs.getObject("id", UUID::class.java),
                name = rs.getString("name"),
                role = WorkspaceRole.valueOf(rs.getString("role")),
                owners = rs.getInt("owners"),
                members = rs.getInt("members"),
            )
        }
        .list()

    /**
     * Names [DELETED_USER_ID] instead of the user [userId] in the changes of documents and the authors of versions,
     * which keep ids without a foreign key: the versions show a deleted user rather than nobody.
     */
    fun anonymizeEditors(userId: UUID) {
        for (column in listOf("board_documents" to "editors", "board_versions" to "authors")) {
            jdbc.sql(
                """
                UPDATE ${column.first} SET ${column.second} = array_replace(${column.second}, :userId, :deleted)
                WHERE ${column.second} @> ARRAY[:userId::uuid]
                """,
            )
                .param("userId", userId)
                .param("deleted", DELETED_USER_ID)
                .update()
        }
    }

    /** Ends all sessions of the user [userId], where Spring Session keeps their id as the principal name. */
    fun endSessions(userId: UUID): Int = jdbc.sql("DELETE FROM spring_session WHERE principal_name = :userId")
        .param("userId", userId.toString())
        .update()

    fun deleteUser(userId: UUID): Boolean = jdbc.sql("DELETE FROM users WHERE id = :userId").param("userId", userId).update() > 0

    /** Of the [ids], those of users who are not there. */
    fun missing(ids: Collection<UUID>): List<UUID> {
        if (ids.isEmpty()) return emptyList()
        val present = jdbc.sql("SELECT id FROM users WHERE id = ANY (:ids::uuid[])")
            .param("ids", ids.toTypedArray())
            .query(UUID::class.java)
            .list()
            .toSet()
        return ids.filterNot(present::contains).distinct()
    }
}
