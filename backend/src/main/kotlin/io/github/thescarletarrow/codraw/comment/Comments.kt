package io.github.thescarletarrow.codraw.comment

import com.fasterxml.jackson.annotation.JsonValue
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** A user as comments show them: the author, who resolved a thread, who is mentioned. */
data class Person(
    val id: UUID,
    val name: String,
    val avatarUrl: String?,
)

/** A reaction to a comment, one of a fixed set. Stored by its name. */
enum class Reaction(@get:JsonValue val value: String) {
    /** 👍 */
    THUMBS_UP("thumbs-up"),

    /** ❤️ */
    HEART("heart"),

    /** 🎉 */
    PARTY("party"),

    /** 😄 */
    SMILE("smile"),

    /** 👀 */
    EYES("eyes"),

    /** ✅ */
    CHECK("check"),
    ;

    companion object {
        /** The reaction that the API names [value], `null` for a name outside the set. */
        fun of(value: String): Reaction? = entries.find { it.value == value }
    }
}

/** One reaction to a comment and who put it, in the order they did. */
data class CommentReaction(
    val reaction: Reaction,
    val people: List<Person>,
)

data class Comment(
    val id: UUID,
    /** `null` once the author is deleted, e.g. a guest who did not come back. */
    val author: Person?,
    val body: String,
    /** The participants of the board that the comment mentions. */
    val mentions: List<Person>,
    /** The reactions put on the comment, in the order of the set. */
    val reactions: List<CommentReaction>,
    val createdAt: Instant,
    /** When the author last changed the text, `null` when they never did. */
    val editedAt: Instant?,
)

/** A point of a page in the coordinates of its diagram, like the positions of the shapes. */
data class ThreadPoint(
    val x: Double,
    val y: Double,
)

/**
 * Comments about one element of a page, about a point of it, or about the whole page when neither [cellId] nor [point]
 * is set; never about both.
 */
data class CommentThread(
    val id: UUID,
    val pageId: String,
    /** The id of the cell in the document of the board; the cell may be deleted since. */
    val cellId: String?,
    /** The decision of the board the thread discusses (see `Decisions`); `null` for a thread about the diagram. */
    val decisionId: UUID?,
    /** Where the thread stands on the page. */
    val point: ThreadPoint?,
    val createdAt: Instant,
    /** When the thread was marked resolved, `null` while it is open. */
    val resolvedAt: Instant?,
    /** Who marked the thread resolved; `null` while it is open or once they are deleted. */
    val resolvedBy: Person?,
    /** Who takes care of the thread; `null` while nobody does or once they are deleted. */
    val assignee: Person?,
    /** The first comment starts the thread; the others answer it, oldest first. */
    val comments: List<Comment>,
)

/** Where a stored thread stands and who started it. */
data class StoredThread(
    val id: UUID,
    /** The thread stands at a point of its page. */
    val atPoint: Boolean,
    /** The author of its first comment; `null` once they are deleted. */
    val authorId: UUID?,
)

/** The assignee a thread had before it was given another one. */
data class Reassignment(val previousAssigneeId: UUID?)

/** The author of a stored comment and whether it starts its thread. */
data class StoredComment(
    val id: UUID,
    val threadId: UUID,
    val authorId: UUID?,
    val first: Boolean,
)

/** Threads of comments on boards, their comments, the users the comments mention and the reactions to them. */
@Repository
class Comments(private val jdbc: JdbcClient) {

    /** All threads of the board, oldest first, with their comments. */
    fun threads(boardId: UUID): List<CommentThread> = load(boardId, threadId = null)

    fun thread(boardId: UUID, threadId: UUID): CommentThread? = load(boardId, threadId).singleOrNull()

    /** Whether the thread [threadId] is on the board [boardId]. */
    fun threadExists(boardId: UUID, threadId: UUID): Boolean = jdbc.sql(
        "SELECT EXISTS (SELECT 1 FROM comment_threads WHERE id = :threadId AND board_id = :boardId)",
    )
        .param("threadId", threadId)
        .param("boardId", boardId)
        .query(Boolean::class.java)
        .single()

    /** The thread [threadId] of the board [boardId]: whether it stands at a point and who wrote its first comment. */
    fun storedThread(boardId: UUID, threadId: UUID): StoredThread? = jdbc.sql(
        """
        SELECT t.id, t.x IS NOT NULL AS at_point,
               (SELECT f.author_id FROM comments f WHERE f.thread_id = t.id ORDER BY f.created_at, f.id LIMIT 1) AS author_id
        FROM comment_threads t
        WHERE t.id = :threadId AND t.board_id = :boardId
        """,
    )
        .param("threadId", threadId)
        .param("boardId", boardId)
        .query { rs, _ ->
            StoredThread(
                id = rs.getObject("id", UUID::class.java),
                atPoint = rs.getBoolean("at_point"),
                authorId = rs.getObject("author_id", UUID::class.java),
            )
        }
        .optional()
        .orElse(null)

    fun comment(boardId: UUID, threadId: UUID, commentId: UUID): StoredComment? = jdbc.sql(
        """
        SELECT c.id, c.thread_id, c.author_id,
               c.id = (SELECT f.id FROM comments f WHERE f.thread_id = c.thread_id ORDER BY f.created_at, f.id LIMIT 1)
                   AS first
        FROM comments c
        JOIN comment_threads t ON t.id = c.thread_id
        WHERE c.id = :commentId AND c.thread_id = :threadId AND t.board_id = :boardId
        """,
    )
        .param("commentId", commentId)
        .param("threadId", threadId)
        .param("boardId", boardId)
        .query { rs, _ ->
            StoredComment(
                id = rs.getObject("id", UUID::class.java),
                threadId = rs.getObject("thread_id", UUID::class.java),
                authorId = rs.getObject("author_id", UUID::class.java),
                first = rs.getBoolean("first"),
            )
        }
        .optional()
        .orElse(null)

    /** Locks the board till the end of the transaction, so that comments counted per board do not race each other. */
    fun lockBoard(boardId: UUID) {
        // Unlike FOR UPDATE, this lock lets the board be referenced meanwhile, e.g. by a new version.
        jdbc.sql("SELECT id FROM boards WHERE id = :boardId FOR NO KEY UPDATE").param("boardId", boardId).query().listOfRows()
    }

    fun countOnBoard(boardId: UUID): Int = jdbc.sql(
        "SELECT count(*) FROM comments c JOIN comment_threads t ON t.id = c.thread_id WHERE t.board_id = :boardId",
    )
        .param("boardId", boardId)
        .query(Int::class.java)
        .single()

    fun addThread(boardId: UUID, pageId: String, cellId: String?, point: ThreadPoint?, decisionId: UUID?, at: Instant): UUID = jdbc.sql(
        """
        INSERT INTO comment_threads (board_id, page_id, cell_id, x, y, decision_id, created_at)
        VALUES (:boardId, :pageId, :cellId, :x, :y, :decisionId, :at)
        RETURNING id
        """,
    )
        .param("boardId", boardId)
        .param("pageId", pageId)
        .param("cellId", cellId)
        .param("decisionId", decisionId)
        .param("x", point?.x)
        .param("y", point?.y)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query(UUID::class.java)
        .single()

    fun addComment(threadId: UUID, authorId: UUID, body: String, at: Instant): UUID = jdbc.sql(
        """
        INSERT INTO comments (thread_id, author_id, body, created_at) VALUES (:threadId, :authorId, :body, :at)
        RETURNING id
        """,
    )
        .param("threadId", threadId)
        .param("authorId", authorId)
        .param("body", body)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query(UUID::class.java)
        .single()

    fun edit(commentId: UUID, body: String, at: Instant) {
        jdbc.sql("UPDATE comments SET body = :body, edited_at = :at WHERE id = :commentId")
            .param("commentId", commentId)
            .param("body", body)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** Makes the comment mention exactly the users [userIds]. */
    fun replaceMentions(commentId: UUID, userIds: Collection<UUID>) {
        jdbc.sql("DELETE FROM comment_mentions WHERE comment_id = :commentId").param("commentId", commentId).update()
        if (userIds.isEmpty()) return
        jdbc.sql(
            "INSERT INTO comment_mentions (comment_id, user_id) SELECT :commentId, unnest(:userIds::uuid[])",
        )
            .param("commentId", commentId)
            .param("userIds", userIds.toTypedArray())
            .update()
    }

    /** The users that the comment [commentId] mentions. */
    fun mentionsOf(commentId: UUID): Set<UUID> = jdbc.sql(
        "SELECT user_id FROM comment_mentions WHERE comment_id = :commentId",
    )
        .param("commentId", commentId)
        .query(UUID::class.java)
        .list()
        .filterNotNullTo(mutableSetOf())

    /** The authors of the comments of the thread [threadId], but those who are deleted. */
    fun authors(threadId: UUID): Set<UUID> = jdbc.sql(
        "SELECT DISTINCT author_id FROM comments WHERE thread_id = :threadId AND author_id IS NOT NULL",
    )
        .param("threadId", threadId)
        .query(UUID::class.java)
        .list()
        .filterNotNullTo(mutableSetOf())

    fun deleteComment(commentId: UUID) {
        jdbc.sql("DELETE FROM comments WHERE id = :commentId").param("commentId", commentId).update()
    }

    /** Deletes the thread with all its comments. */
    fun deleteThread(threadId: UUID) {
        jdbc.sql("DELETE FROM comment_threads WHERE id = :threadId").param("threadId", threadId).update()
    }

    /** Moves the thread to the [point] of its page. */
    fun move(threadId: UUID, point: ThreadPoint) {
        jdbc.sql("UPDATE comment_threads SET x = :x, y = :y WHERE id = :threadId")
            .param("threadId", threadId)
            .param("x", point.x)
            .param("y", point.y)
            .update()
    }

    /**
     * Makes the user [assigneeId] the assignee of the thread [threadId] of the board [boardId], or leaves the thread
     * without one when it is `null`. Returns who was the assignee before, read under the lock of the row of the thread,
     * or `null` when the board has no such thread.
     */
    fun assign(boardId: UUID, threadId: UUID, assigneeId: UUID?): Reassignment? = jdbc.sql(
        """
        UPDATE comment_threads SET assignee_id = :assigneeId
        WHERE id = :threadId AND board_id = :boardId
        RETURNING old.assignee_id AS previous
        """,
    )
        .param("threadId", threadId)
        .param("boardId", boardId)
        .param("assigneeId", assigneeId)
        .query { rs, _ -> Reassignment(rs.getObject("previous", UUID::class.java)) }
        .optional()
        .orElse(null)

    /** Puts the [reaction] of the user [userId] on the comment [commentId], unless it is there already. */
    fun addReaction(commentId: UUID, userId: UUID, reaction: Reaction, at: Instant) {
        jdbc.sql(
            """
            INSERT INTO comment_reactions (comment_id, user_id, reaction, created_at)
            VALUES (:commentId, :userId, :reaction, :at)
            ON CONFLICT DO NOTHING
            """,
        )
            .param("commentId", commentId)
            .param("userId", userId)
            .param("reaction", reaction.name)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    fun removeReaction(commentId: UUID, userId: UUID, reaction: Reaction) {
        jdbc.sql(
            "DELETE FROM comment_reactions WHERE comment_id = :commentId AND user_id = :userId AND reaction = :reaction",
        )
            .param("commentId", commentId)
            .param("userId", userId)
            .param("reaction", reaction.name)
            .update()
    }

    /** Marks the thread resolved by the user [by] at [at], or open again when [at] is `null`. */
    fun resolve(threadId: UUID, by: UUID?, at: Instant?) {
        jdbc.sql("UPDATE comment_threads SET resolved_at = :at, resolved_by = :by WHERE id = :threadId")
            .param("threadId", threadId)
            .param("at", at?.atOffset(ZoneOffset.UTC))
            .param("by", by)
            .update()
    }

    /**
     * Who may be mentioned on the board [boardId]: its owner first, then its members and, unless the link is closed,
     * the users who opened it through its link, the most recently joined or opened first, at most [limit] of them.
     */
    fun people(boardId: UUID, ownerId: UUID, linkOpen: Boolean, limit: Int): List<Person> {
        val owner = jdbc.sql("SELECT id, name, avatar_url FROM users WHERE id = :ownerId")
            .param("ownerId", ownerId)
            .query { rs, _ -> rs.toPerson() }
            .list()
            .filterNotNull()
        return owner + jdbc.sql(
            """
            SELECT u.id, u.name, u.avatar_url
            FROM ($PARTICIPANTS) p
            JOIN users u ON u.id = p.user_id
            WHERE p.user_id <> :ownerId
            GROUP BY u.id, u.name, u.avatar_url
            ORDER BY max(p.since) DESC, u.id
            LIMIT :limit
            """,
        )
            .param("boardId", boardId)
            .param("ownerId", ownerId)
            .param("linkOpen", linkOpen)
            .param("limit", limit)
            .query { rs, _ -> rs.toPerson() }
            .list()
            .filterNotNull()
    }

    /**
     * Those of the users [userIds] who are the owner [ownerId] or a member, or, unless the link is closed, opened the
     * board.
     */
    fun participants(boardId: UUID, ownerId: UUID, linkOpen: Boolean, userIds: Collection<UUID>): Set<UUID> {
        if (userIds.isEmpty()) return emptySet()
        return jdbc.sql(
            """
            SELECT u.id FROM users u
            WHERE u.id = ANY (:userIds::uuid[])
              AND (u.id = :ownerId OR u.id IN (SELECT p.user_id FROM ($PARTICIPANTS) p))
            """,
        )
            .param("userIds", userIds.toTypedArray())
            .param("ownerId", ownerId)
            .param("linkOpen", linkOpen)
            .param("boardId", boardId)
            .query(UUID::class.java)
            .list()
            .filterNotNullTo(mutableSetOf())
    }

    /**
     * Passes the comments, the resolutions, the mentions, the reactions and the assigned threads of the user
     * [fromUserId] to the user [toUserId]. A reaction that both put on a comment stays once, as [toUserId] put it.
     */
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        jdbc.sql("UPDATE comments SET author_id = :toUserId WHERE author_id = :fromUserId")
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql("UPDATE comment_threads SET resolved_by = :toUserId WHERE resolved_by = :fromUserId")
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql(
            """
            INSERT INTO comment_mentions (comment_id, user_id)
            SELECT comment_id, :toUserId FROM comment_mentions WHERE user_id = :fromUserId
            ON CONFLICT DO NOTHING
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql("DELETE FROM comment_mentions WHERE user_id = :fromUserId").param("fromUserId", fromUserId).update()
        jdbc.sql(
            """
            INSERT INTO comment_reactions (comment_id, user_id, reaction, created_at)
            SELECT comment_id, :toUserId, reaction, created_at FROM comment_reactions WHERE user_id = :fromUserId
            ON CONFLICT DO NOTHING
            """,
        )
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql("DELETE FROM comment_reactions WHERE user_id = :fromUserId").param("fromUserId", fromUserId).update()
        jdbc.sql("UPDATE comment_threads SET assignee_id = :toUserId WHERE assignee_id = :fromUserId")
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
    }

    /**
     * Threads of the board, or only the thread [threadId] of it, with their comments, mentions and reactions: four
     * queries.
     */
    private fun load(boardId: UUID, threadId: UUID?): List<CommentThread> {
        val threadFilter = if (threadId == null) "" else "AND t.id = :threadId"
        val threads = jdbc.sql(
            """
            SELECT t.id, t.page_id, t.cell_id, t.decision_id, t.x, t.y, t.created_at, t.resolved_at,
                   r.id AS resolver_id, r.name AS resolver_name, r.avatar_url AS resolver_avatar_url,
                   s.id AS assignee_id, s.name AS assignee_name, s.avatar_url AS assignee_avatar_url
            FROM comment_threads t
            LEFT JOIN users r ON r.id = t.resolved_by
            LEFT JOIN users s ON s.id = t.assignee_id
            WHERE t.board_id = :boardId $threadFilter
            ORDER BY t.created_at, t.id
            """,
        )
            .param("boardId", boardId)
            .apply { if (threadId != null) param("threadId", threadId) }
            .query { rs, _ -> rs.toThread() }
            .list()
        if (threads.isEmpty()) return threads

        val mentions = jdbc.sql(
            """
            SELECT m.comment_id, u.id, u.name, u.avatar_url
            FROM comment_mentions m
            JOIN comments c ON c.id = m.comment_id
            JOIN comment_threads t ON t.id = c.thread_id
            JOIN users u ON u.id = m.user_id
            WHERE t.board_id = :boardId $threadFilter
            ORDER BY u.name, u.id
            """,
        )
            .param("boardId", boardId)
            .apply { if (threadId != null) param("threadId", threadId) }
            .query { rs, _ -> rs.getObject("comment_id", UUID::class.java) to checkNotNull(rs.toPerson()) }
            .list()
            .groupBy({ it.first }, { it.second })

        val reactions = jdbc.sql(
            """
            SELECT r.comment_id, r.reaction, u.id, u.name, u.avatar_url
            FROM comment_reactions r
            JOIN comments c ON c.id = r.comment_id
            JOIN comment_threads t ON t.id = c.thread_id
            JOIN users u ON u.id = r.user_id
            WHERE t.board_id = :boardId $threadFilter
            ORDER BY r.created_at, u.id
            """,
        )
            .param("boardId", boardId)
            .apply { if (threadId != null) param("threadId", threadId) }
            .query { rs, _ ->
                val reaction = Reaction.valueOf(rs.getString("reaction"))
                rs.getObject("comment_id", UUID::class.java) to (reaction to checkNotNull(rs.toPerson()))
            }
            .list()
            .groupBy({ it.first }, { it.second })
            .mapValues { (_, reacted) ->
                reacted.groupBy({ it.first }, { it.second })
                    .map { (reaction, people) -> CommentReaction(reaction, people) }
                    .sortedBy { it.reaction.ordinal }
            }

        val comments = jdbc.sql(
            """
            SELECT c.id, c.thread_id, c.body, c.created_at, c.edited_at,
                   a.id AS author_id, a.name AS author_name, a.avatar_url AS author_avatar_url
            FROM comments c
            JOIN comment_threads t ON t.id = c.thread_id
            LEFT JOIN users a ON a.id = c.author_id
            WHERE t.board_id = :boardId $threadFilter
            ORDER BY c.created_at, c.id
            """,
        )
            .param("boardId", boardId)
            .apply { if (threadId != null) param("threadId", threadId) }
            .query { rs, _ ->
                val id = rs.getObject("id", UUID::class.java)
                rs.getObject("thread_id", UUID::class.java) to Comment(
                    id = id,
                    author = rs.toPerson("author_"),
                    body = rs.getString("body"),
                    mentions = mentions[id].orEmpty(),
                    reactions = reactions[id].orEmpty(),
                    createdAt = rs.instant("created_at")!!,
                    editedAt = rs.instant("edited_at"),
                )
            }
            .list()
            .groupBy({ it.first }, { it.second })

        return threads.map { it.copy(comments = comments[it.id].orEmpty()) }
    }

    private fun ResultSet.toThread() = CommentThread(
        id = getObject("id", UUID::class.java),
        pageId = getString("page_id"),
        cellId = getString("cell_id"),
        decisionId = getObject("decision_id", UUID::class.java),
        point = toPoint(),
        createdAt = instant("created_at")!!,
        resolvedAt = instant("resolved_at"),
        resolvedBy = toPerson("resolver_"),
        assignee = toPerson("assignee_"),
        comments = emptyList(),
    )

    /** The point in the columns `x` and `y`; `null` when the thread stands at none. */
    private fun ResultSet.toPoint(): ThreadPoint? {
        val x = getDouble("x")
        return if (wasNull()) null else ThreadPoint(x, getDouble("y"))
    }

    /** The user in the columns `id`, `name` and `avatar_url`, or `{prefix}id`… of a join; `null` when there is none. */
    private fun ResultSet.toPerson(prefix: String = ""): Person? {
        val id = getObject("${prefix}id", UUID::class.java) ?: return null
        return Person(id, getString("${prefix}name"), getString("${prefix}avatar_url"))
    }

    private fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()

    private companion object {
        /**
         * Users other than the owner who take part in the board `:boardId`, with when they joined or last opened it:
         * its members, the users who opened it through its link while `:linkOpen`, and the members of its workspace
         * whom the workspace gives a role on it.
         */
        const val PARTICIPANTS = """
            SELECT user_id, created_at AS since FROM board_members WHERE board_id = :boardId
            UNION ALL
            SELECT user_id, visited_at FROM board_visits WHERE board_id = :boardId AND :linkOpen
            UNION ALL
            SELECT w.user_id, w.created_at FROM boards b JOIN workspace_members w ON w.workspace_id = b.workspace_id
            WHERE b.id = :boardId AND (w.role IN ('OWNER', 'ADMIN') OR b.workspace_access <> 'NONE')
        """
    }
}
