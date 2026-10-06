package io.github.thescarletarrow.codraw.board

import com.fasterxml.jackson.annotation.JsonValue
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** Why a version of a board was saved. Stored by its name. */
enum class VersionReason(@get:JsonValue val value: String) {
    /** The backend kept the state from before a change. */
    AUTO("auto"),

    /** The owner saved the state. */
    MANUAL("manual"),

    /** The owner's page kept the state from before a restore. */
    RESTORE("restore"),

    /** The state from before a proposal of changes was accepted, which the page of whoever accepted it sent. */
    PROPOSAL("proposal"),
}

/** A participant whose changes a version has since the version before it, as their account shows them now. */
data class VersionAuthor(
    val id: UUID,
    val name: String,
    val avatarUrl: String?,
)

/** A saved earlier state of the document of a board. */
data class BoardVersion(
    val id: UUID,
    val createdAt: Instant,
    val reason: VersionReason,
    /** The name the owner or an editor gave the version, `null` when it has none. */
    val name: String?,
    /** Who changed the board since the version before, in the order of their first change; users who are gone are left out. */
    val authors: List<VersionAuthor>,
)

/**
 * Versions of board documents: their states are opaque to the backend, like the documents themselves. A version names
 * its authors by their ids; their names are read from the users with the versions.
 */
@Repository
class BoardVersions(private val jdbc: JdbcClient) {

    /** Versions of the board [boardId], most recent first. */
    fun list(boardId: UUID): List<BoardVersion> = withAuthors(
        jdbc.sql("SELECT $COLUMNS FROM board_versions WHERE board_id = :boardId ORDER BY created_at DESC, id DESC")
            .param("boardId", boardId)
            .query { rs, _ -> rs.toStoredVersion() }
            .list(),
    )

    /** The versions of the board [boardId] without their states, oldest first. */
    fun stamps(boardId: UUID): List<VersionStamp> = jdbc.sql(
        "SELECT id, created_at, reason, authors FROM board_versions WHERE board_id = :boardId ORDER BY created_at, id",
    )
        .param("boardId", boardId)
        .query { rs, _ ->
            VersionStamp(
                id = rs.getObject("id", UUID::class.java),
                createdAt = rs.getObject("created_at", OffsetDateTime::class.java).toInstant(),
                reason = VersionReason.valueOf(rs.getString("reason")),
                authorIds = rs.authorIds(),
            )
        }
        .list()

    /** The state of the version [versionId] of the board [boardId], or `null` when the board has no such version. */
    fun state(boardId: UUID, versionId: UUID): ByteArray? = jdbc.sql(
        "SELECT state FROM board_versions WHERE board_id = :boardId AND id = :versionId",
    )
        .param("boardId", boardId)
        .param("versionId", versionId)
        .query(ByteArray::class.java)
        .optional()
        .orElse(null)

    /**
     * Saves [state] as a version of the board [boardId] at [at]. Its authors are the users who changed the stored document
     * since the latest version, who are taken from the document: the next version starts with nobody.
     */
    fun add(boardId: UUID, state: ByteArray, reason: VersionReason, name: String?, at: Instant): BoardVersion {
        val version = jdbc.sql(
            """
            -- The row of the document stays locked till the end of the transaction: a store at the same time gives
            -- its users either to this version or to the next one, never to both.
            WITH taken AS (
                UPDATE board_documents SET editors = '{}' WHERE board_id = :boardId RETURNING old.editors
            )
            INSERT INTO board_versions (board_id, state, reason, name, authors, created_at)
            VALUES (:boardId, :state, :reason, :name, coalesce((SELECT editors FROM taken), '{}'), :at)
            RETURNING $COLUMNS
            """,
        )
            .param("boardId", boardId)
            .param("state", state)
            .param("reason", reason.name)
            .param("name", name)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .query { rs, _ -> rs.toStoredVersion() }
            .single()
        return withAuthors(listOf(version)).single()
    }

    /**
     * Keeps the stored document of the board [boardId] as an [VersionReason.AUTO] version at [at], unless the board has
     * a version made after [since] or no stored document. Returns whether it made a version. The document is copied in
     * the database, without passing through the backend, and the users who changed it become the authors of the version.
     */
    fun keepStoredDocument(boardId: UUID, since: Instant, at: Instant): Boolean = jdbc.sql(
        """
        WITH taken AS (
            UPDATE board_documents SET editors = '{}'
            WHERE board_id = :boardId
              AND NOT EXISTS (SELECT 1 FROM board_versions WHERE board_id = :boardId AND created_at > :since)
            RETURNING board_id, state, old.editors
        )
        INSERT INTO board_versions (board_id, state, reason, authors, created_at)
        SELECT board_id, state, 'AUTO', editors, :at FROM taken
        """,
    )
        .param("boardId", boardId)
        .param("since", since.atOffset(ZoneOffset.UTC))
        .param("at", at.atOffset(ZoneOffset.UTC))
        .update() > 0

    /** Gives the version [versionId] of the board [boardId] the [name], or none; `null` when there is no such version. */
    fun rename(boardId: UUID, versionId: UUID, name: String?): BoardVersion? = jdbc.sql(
        "UPDATE board_versions SET name = :name WHERE board_id = :boardId AND id = :versionId RETURNING $COLUMNS",
    )
        .param("name", name)
        .param("boardId", boardId)
        .param("versionId", versionId)
        .query { rs, _ -> rs.toStoredVersion() }
        .optional()
        .map { withAuthors(listOf(it)).single() }
        .orElse(null)

    /**
     * Deletes the versions of the board [boardId] that do not fit into [keep] versions and [maxBytes] together. The most
     * recent version stays whatever its size; the others go in the order versions without a name first, then those with
     * one, the oldest first in each.
     */
    fun prune(boardId: UUID, keep: Int, maxBytes: Long) {
        jdbc.sql(
            """
            DELETE FROM board_versions WHERE id IN (
                SELECT id FROM (
                    SELECT id, row_number() OVER kept AS n, sum(size) OVER kept AS bytes
                    FROM (
                        -- octet_length of bytea reads the size from the header, without unpacking the state.
                        SELECT id, created_at, name IS NOT NULL AS named, octet_length(state) AS size,
                               row_number() OVER (ORDER BY created_at DESC, id DESC) = 1 AS newest
                        FROM board_versions WHERE board_id = :boardId
                    ) sized
                    -- The order in which versions are kept: the ones at the end go first.
                    WINDOW kept AS (ORDER BY newest DESC, named DESC, created_at DESC, id DESC)
                ) versions
                WHERE n > :keep OR (n > 1 AND bytes > :maxBytes)
            )
            """,
        )
            .param("boardId", boardId)
            .param("keep", keep)
            .param("maxBytes", maxBytes)
            .update()
    }

    /** Names the user [toUserId] instead of the user [fromUserId] wherever the latter changed a board. */
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        jdbc.sql(
            """
            UPDATE board_documents SET editors = array_replace(editors, :fromUserId, :toUserId)
            WHERE editors @> ARRAY[:fromUserId::uuid]
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql(
            """
            UPDATE board_versions SET authors = array_replace(authors, :fromUserId, :toUserId)
            WHERE authors @> ARRAY[:fromUserId::uuid]
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
    }

    /** The users [ids] as authors, in the order of the ids; repeated ids show once, users who are gone not at all. */
    fun authors(ids: List<UUID>): List<VersionAuthor> {
        val users = users(ids.toSet())
        return ids.distinct().mapNotNull(users::get)
    }

    /** The authors of the [versions] from the users, read at once; repeated ids show once, users who are gone not at all. */
    private fun withAuthors(versions: List<StoredVersion>): List<BoardVersion> {
        val users = users(versions.flatMapTo(mutableSetOf()) { it.authorIds })
        return versions.map { version ->
            BoardVersion(
                id = version.id,
                createdAt = version.createdAt,
                reason = version.reason,
                name = version.name,
                authors = version.authorIds.distinct().mapNotNull(users::get),
            )
        }
    }

    /** The users [ids] who are still there, by their ids. */
    private fun users(ids: Set<UUID>): Map<UUID, VersionAuthor> {
        if (ids.isEmpty()) return emptyMap()
        return jdbc.sql("SELECT id, name, avatar_url FROM users WHERE id = ANY (:ids::uuid[])")
            .param("ids", ids.toTypedArray())
            .query { rs, _ ->
                VersionAuthor(rs.getObject("id", UUID::class.java), rs.getString("name"), rs.getString("avatar_url"))
            }
            .list()
            .associateBy { it.id }
    }

    /** A version as it is stored, with the ids of its authors. */
    private class StoredVersion(
        val id: UUID,
        val createdAt: Instant,
        val reason: VersionReason,
        val name: String?,
        val authorIds: List<UUID>,
    )

    private fun ResultSet.toStoredVersion() = StoredVersion(
        id = getObject("id", UUID::class.java),
        createdAt = getObject("created_at", OffsetDateTime::class.java).toInstant(),
        reason = VersionReason.valueOf(getString("reason")),
        name = getString("name"),
        authorIds = authorIds(),
    )

    private fun ResultSet.authorIds(): List<UUID> = (getArray("authors").array as Array<*>).map { it as UUID }

    private companion object {
        const val COLUMNS = "id, created_at, reason, name, authors"
    }
}
