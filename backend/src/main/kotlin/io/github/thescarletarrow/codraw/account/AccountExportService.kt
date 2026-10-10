package io.github.thescarletarrow.codraw.account

import io.github.thescarletarrow.codraw.AddressRateLimiter
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.BoardDocumentRepository
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.util.UUID

/**
 * The data of a user for «Скачать мои данные»: everything the tables keep of them, as one JSON document that PostgreSQL
 * builds, and the documents of their boards, which only the app turns into `.drawio`. Tokens and other secrets that the
 * user cannot use outside CoDraw stay out, and so does what others wrote.
 */
@Service
class AccountExportService(
    private val jdbc: JdbcClient,
    private val documents: BoardDocumentRepository,
    limits: LimitProperties,
    clock: Clock,
) {

    private val limiter = AddressRateLimiter(Duration.ofDays(1), { limits.exportsPerUserPerDay }, clock)

    /** Counts an export of the user [userId]: `null` when it may go, or how long they wait otherwise. */
    fun acquire(userId: UUID): Duration? = limiter.acquire(userId.toString())

    /** The data of the user [userId] as a JSON object, a key per part; `null` when there is no such user. */
    fun export(userId: UUID): String? = jdbc.sql(EXPORT).param("userId", userId).query(String::class.java).optional().orElse(null)

    /**
     * The stored document of the board [boardId] when the user [userId] owns it or is responsible for it, in the trash
     * too: an empty array while it has no stored state, `null` for any other board.
     */
    fun document(userId: UUID, boardId: UUID): ByteArray? {
        val owns = jdbc.sql("SELECT EXISTS (SELECT 1 FROM boards WHERE id = :boardId AND owner_id = :userId)")
            .param("boardId", boardId)
            .param("userId", userId)
            .query(Boolean::class.java)
            .single()
        if (!owns) return null
        return documents.findState(boardId) ?: ByteArray(0)
    }

    private companion object {
        /** A list of the rows of a query as a JSON array, empty when there are none. */
        fun list(query: String, order: String) = "(SELECT coalesce(json_agg(r ORDER BY $order), '[]'::json) FROM ($query) r)"

        val EXPORT = """
            SELECT json_build_object(
                'profile', json_build_object(
                    'id', u.id, 'provider', u.provider, 'providerUserId', u.provider_user_id, 'name', u.name,
                    'avatarUrl', u.avatar_url, 'createdAt', u.created_at
                ),
                'boards', ${list(
                    """
                    SELECT b.id, b.title, b.created_at AS "createdAt", b.updated_at AS "updatedAt",
                           b.deleted_at AS "deletedAt", lower(b.link_access) AS "linkAccess", w.name AS workspace,
                           p.name AS project
                    FROM boards b
                    LEFT JOIN workspaces w ON w.id = b.workspace_id
                    LEFT JOIN workspace_projects p ON p.id = b.project_id
                    WHERE b.owner_id = u.id
                    """,
                    "r.\"createdAt\", r.id",
                )},
                'sharedBoards', ${list(
                    """
                    SELECT b.id, b.title, lower(m.role) AS role, m.created_at AS "joinedAt"
                    FROM board_members m JOIN boards b ON b.id = m.board_id
                    WHERE m.user_id = u.id
                    """,
                    "r.\"joinedAt\", r.id",
                )},
                'visits', ${list(
                    """
                    SELECT v.board_id AS "boardId", b.title, v.visited_at AS "visitedAt"
                    FROM board_visits v JOIN boards b ON b.id = v.board_id
                    WHERE v.user_id = u.id
                    """,
                    "r.\"visitedAt\", r.\"boardId\"",
                )},
                'workspaces', ${list(
                    """
                    SELECT w.id, w.name, lower(m.role) AS role, m.created_at AS "joinedAt"
                    FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
                    WHERE m.user_id = u.id
                    """,
                    "r.\"joinedAt\", r.id",
                )},
                'accessRequests', ${list(
                    """
                    SELECT q.board_id AS "boardId", b.title, lower(q.role) AS role, q.message, q.created_at AS "createdAt"
                    FROM board_access_requests q JOIN boards b ON b.id = q.board_id
                    WHERE q.user_id = u.id
                    """,
                    "r.\"createdAt\", r.\"boardId\"",
                )},
                'comments', ${list(
                    """
                    SELECT c.id, t.board_id AS "boardId", b.title AS "boardTitle", c.thread_id AS "threadId",
                           t.page_id AS "pageId", t.cell_id AS "cellId", t.decision_id AS "decisionId", c.body,
                           c.created_at AS "createdAt", c.edited_at AS "editedAt"
                    FROM comments c
                    JOIN comment_threads t ON t.id = c.thread_id
                    JOIN boards b ON b.id = t.board_id
                    WHERE c.author_id = u.id
                    """,
                    "r.\"createdAt\", r.id",
                )},
                'reactions', ${list(
                    """
                    SELECT x.comment_id AS "commentId", lower(x.reaction) AS reaction, x.created_at AS "createdAt"
                    FROM comment_reactions x
                    WHERE x.user_id = u.id
                    """,
                    "r.\"createdAt\", r.\"commentId\"",
                )},
                'decisions', ${list(
                    """
                    SELECT d.id, d.board_id AS "boardId", b.title AS "boardTitle", d.number, d.title, lower(d.status) AS status,
                           d.decided_on AS "decidedOn", d.context, d.options, d.outcome, d.consequences,
                           d.created_at AS "createdAt", d.updated_at AS "updatedAt"
                    FROM decisions d JOIN boards b ON b.id = d.board_id
                    WHERE d.author_id = u.id
                    """,
                    "r.\"createdAt\", r.id",
                )},
                'proposals', ${list(
                    """
                    SELECT p.id, p.board_id AS "boardId", b.title AS "boardTitle", p.title, p.description,
                           lower(p.status) AS status, p.comment, p.created_at AS "createdAt", p.decided_at AS "decidedAt"
                    FROM proposals p JOIN boards b ON b.id = p.board_id
                    WHERE p.author_id = u.id
                    """,
                    "r.\"createdAt\", r.id",
                )},
                'libraries', ${list(
                    """
                    SELECT l.id, l.name, l.created_at AS "createdAt", ${list(
                        """
                        SELECT c.id, c.name, c.content, c.preview, c.created_at AS "createdAt", c.updated_at AS "updatedAt"
                        FROM library_components c WHERE c.library_id = l.id
                        """,
                        "r.\"createdAt\", r.id",
                    )} AS components
                    FROM shape_libraries l
                    WHERE l.user_id = u.id
                    """,
                    "r.\"createdAt\", r.id",
                )},
                'templates', ${list(
                    """
                    SELECT t.id, t.title, t.description, t.drawio, t.created_at AS "createdAt", t.updated_at AS "updatedAt"
                    FROM personal_templates t
                    WHERE t.owner_id = u.id
                    """,
                    "r.\"createdAt\", r.id",
                )},
                'folders', ${list(
                    """
                    SELECT f.id, f.name, f.created_at AS "createdAt",
                           (SELECT coalesce(json_agg(p.board_id ORDER BY p.board_id), '[]'::json)
                            FROM board_placements p WHERE p.folder_id = f.id) AS boards
                    FROM board_folders f
                    WHERE f.user_id = u.id
                    """,
                    "r.\"createdAt\", r.id",
                )},
                'tags', ${list(
                    "SELECT g.board_id AS \"boardId\", g.tag FROM board_tags g WHERE g.user_id = u.id",
                    "r.\"boardId\", r.tag",
                )},
                'notificationChannels', ${list(
                    """
                    SELECT lower(n.kind) AS kind, n.address, n.enabled, n.events, n.verified_at AS "verifiedAt",
                           n.created_at AS "createdAt"
                    FROM notification_channels n
                    WHERE n.user_id = u.id
                    """,
                    "r.kind",
                )},
                'mutedBoards', ${list(
                    "SELECT m.board_id AS \"boardId\", m.created_at AS \"createdAt\" FROM notification_board_mutes m WHERE m.user_id = u.id",
                    "r.\"createdAt\", r.\"boardId\"",
                )},
                'issueTrackers', ${list(
                    """
                    SELECT lower(i.tracker) AS tracker, i.login, i.created_at AS "createdAt", i.rejected_at AS "rejectedAt"
                    FROM issue_tracker_connections i
                    WHERE i.user_id = u.id
                    """,
                    "r.tracker",
                )},
                'notifications', ${list(
                    """
                    SELECT n.id, lower(n.kind) AS kind, n.board_id AS "boardId", n.created_at AS "createdAt",
                           n.read_at AS "readAt"
                    FROM notifications n
                    WHERE n.user_id = u.id
                    """,
                    "r.id",
                )}
            )::text
            FROM users u
            WHERE u.id = :userId
        """.trimIndent()
    }
}
