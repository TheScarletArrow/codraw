package io.github.thescarletarrow.codraw.admin

import io.github.thescarletarrow.codraw.board.LinkAccess
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID

/** A user as administrators find them. */
data class AdminUser(
    val id: UUID,
    val name: String,
    val avatarUrl: String?,
    val provider: String,
    val providerUserId: String,
    val guest: Boolean,
    /** Whether the configuration makes the user an administrator. */
    val admin: Boolean,
    val createdAt: Instant,
    val blockedAt: Instant?,
    /** Their personal boards and the boards of workspaces they are responsible for, without those in the trash. */
    val boards: Int,
)

/** A board as administrators find it, in the trash too. */
data class AdminBoard(
    val id: UUID,
    val title: String,
    val owner: UserRef,
    val linkAccess: LinkAccess,
    val embed: Boolean,
    val sharingBlocked: Boolean,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant?,
    val openReports: Int,
)

/** What administrators know of a board besides its search entry: never its content. */
data class AdminBoardSizes(
    /** The stored state of the document, in bytes. */
    val document: Long,
    /** The states of all its versions together. */
    val versions: Long,
    val versionCount: Int,
    /** Its images, the same file once. */
    val images: Long,
    val imageCount: Int,
)

/** The live image of a board as administrators see it. */
data class AdminEmbed(val path: String, val updatedAt: Instant?)

/** The workspace of a board as administrators see it. */
data class AdminWorkspace(val id: UUID, val name: String)

/** Finds users and boards of the whole installation for its administrators. */
@Repository
class AdminDirectory(private val jdbc: JdbcClient) {

    /**
     * Users whose name has [query], or whose id or id at the provider is [query]; the latest created when it is blank.
     * [isAdmin] tells administrators by their provider and their id there.
     */
    fun users(query: String, limit: Int, isAdmin: (String, String) -> Boolean): List<AdminUser> = jdbc.sql(
        """
        SELECT u.*, (SELECT count(*) FROM boards b WHERE b.owner_id = u.id AND b.deleted_at IS NULL) AS boards
        FROM users u
        WHERE :query = '' OR u.name ILIKE :pattern ESCAPE '\' OR u.id::text = lower(:query) OR u.provider_user_id = :query
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT :limit
        """,
    )
        .param("query", query)
        .param("pattern", "%${likeEscaped(query)}%")
        .param("limit", limit)
        .query { rs, _ ->
            val provider = rs.getString("provider")
            val providerUserId = rs.getString("provider_user_id")
            AdminUser(
                id = rs.getObject("id", UUID::class.java),
                name = rs.getString("name"),
                avatarUrl = rs.getString("avatar_url"),
                provider = provider,
                providerUserId = providerUserId,
                guest = provider == "guest",
                admin = isAdmin(provider, providerUserId),
                createdAt = checkNotNull(rs.instant("created_at")),
                blockedAt = rs.instant("blocked_at"),
                boards = rs.getInt("boards"),
            )
        }
        .list()

    /** Boards, in the trash too, whose title has [query] or whose id is [query]; the latest changed when it is blank. */
    fun boards(query: String, limit: Int): List<AdminBoard> = jdbc.sql(
        """
        $BOARDS
        WHERE :query = '' OR b.title ILIKE :pattern ESCAPE '\' OR b.id::text = lower(:query)
        ORDER BY b.updated_at DESC, b.id DESC
        LIMIT :limit
        """,
    )
        .param("query", query)
        .param("pattern", "%${likeEscaped(query)}%")
        .param("limit", limit)
        .query { rs, _ -> rs.toBoard() }
        .list()

    fun board(id: UUID): AdminBoard? = jdbc.sql("$BOARDS WHERE b.id = :id")
        .param("id", id)
        .query { rs, _ -> rs.toBoard() }
        .optional()
        .orElse(null)

    fun sizes(boardId: UUID): AdminBoardSizes = jdbc.sql(
        """
        SELECT
            (SELECT coalesce(octet_length(state), 0) FROM board_documents WHERE board_id = :id) AS document,
            (SELECT coalesce(sum(octet_length(state)), 0) FROM board_versions WHERE board_id = :id) AS versions,
            (SELECT count(*) FROM board_versions WHERE board_id = :id) AS version_count,
            (SELECT coalesce(sum(size), 0) FROM board_images WHERE board_id = :id) AS images,
            (SELECT count(*) FROM board_images WHERE board_id = :id) AS image_count
        """,
    )
        .param("id", boardId)
        .query { rs, _ ->
            AdminBoardSizes(
                document = rs.getLong("document"),
                versions = rs.getLong("versions"),
                versionCount = rs.getInt("version_count"),
                images = rs.getLong("images"),
                imageCount = rs.getInt("image_count"),
            )
        }
        .single()

    fun workspace(boardId: UUID): AdminWorkspace? = jdbc.sql(
        "SELECT w.id, w.name FROM boards b JOIN workspaces w ON w.id = b.workspace_id WHERE b.id = :id",
    )
        .param("id", boardId)
        .query { rs, _ -> AdminWorkspace(rs.getObject("id", UUID::class.java), rs.getString("name")) }
        .optional()
        .orElse(null)

    private fun ResultSet.toBoard() = AdminBoard(
        id = getObject("id", UUID::class.java),
        title = getString("title"),
        owner = UserRef(getObject("owner_id", UUID::class.java), getString("owner_name")),
        linkAccess = LinkAccess.valueOf(getString("link_access")),
        embed = getBoolean("embed"),
        sharingBlocked = getObject("sharing_blocked_at") != null,
        createdAt = checkNotNull(instant("created_at")),
        updatedAt = checkNotNull(instant("updated_at")),
        deletedAt = instant("deleted_at"),
        openReports = getInt("open_reports"),
    )

    private fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()

    /** [query] as a literal part of a pattern of `LIKE`. */
    private fun likeEscaped(query: String) = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    private companion object {
        const val BOARDS = """
            SELECT b.*, o.name AS owner_name,
                   EXISTS (SELECT 1 FROM board_embeds e WHERE e.board_id = b.id) AS embed,
                   (SELECT count(*) FROM board_reports r WHERE r.board_id = b.id AND r.resolved_at IS NULL) AS open_reports
            FROM boards b
            JOIN users o ON o.id = b.owner_id
        """
    }
}
