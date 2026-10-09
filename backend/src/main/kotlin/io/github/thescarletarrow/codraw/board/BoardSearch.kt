package io.github.thescarletarrow.codraw.board

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import org.springframework.stereotype.Service
import java.util.UUID

/** A board whose text has what the user searched for, with the line of the text around the first match. */
data class BoardTextMatch(
    val boardId: UUID,
    val fragment: String,
)

/** A piece of the text of a board around the first match of a query, as the database cuts it. */
data class TextWindow(
    val boardId: UUID,
    val text: String,
    /** Where the window starts in the text of the board, from 1 as in SQL. */
    val start: Int,
    /** The window holds as many characters as asked for: the text goes on after it. */
    val full: Boolean,
)

/**
 * The texts of boards for search, which collab extracts from their documents: names of pages and texts of elements, a
 * line each, in `board_documents.search_text`.
 */
@Repository
class BoardSearch(private val jdbc: JdbcClient) {

    /**
     * Boards that the user [userId] can open — their own, those they are a member of, those they opened through links
     * that still give them a role and those that their workspaces give them a role on — whose text has the [key] of a query, see [BoardSearchService.searchKey]: at most
     * [limit] of them, each with a window of its text from [before] characters before the first match to [after]
     * characters after its end, and one more on each side to tell whether the line goes on.
     */
    fun find(userId: UUID, key: String, before: Int, after: Int, limit: Int): List<TextWindow> = jdbc.sql(
        """
        WITH openable AS (
            SELECT id AS board_id FROM boards WHERE owner_id = :userId
            UNION
            SELECT board_id FROM board_members WHERE user_id = :userId
            UNION
            SELECT v.board_id FROM board_visits v JOIN boards b ON b.id = v.board_id
            WHERE v.user_id = :userId AND b.link_access <> 'NONE'
            UNION
            SELECT b.id FROM boards b JOIN workspace_members w ON w.workspace_id = b.workspace_id
            WHERE w.user_id = :userId AND (w.role IN ('OWNER', 'ADMIN') OR b.workspace_access <> 'NONE')
        ),
        matches AS (
            SELECT d.board_id, d.search_text, strpos(translate(lower(d.search_text), 'ё', 'е'), :key) AS position
            FROM openable o JOIN board_documents d ON d.board_id = o.board_id JOIN boards b ON b.id = d.board_id
            WHERE d.search_text IS NOT NULL AND b.deleted_at IS NULL
        )
        SELECT board_id, greatest(position - :before - 1, 1) AS start,
               substr(search_text, greatest(position - :before - 1, 1), :length) AS window,
               char_length(search_text) AS text_length
        FROM matches
        WHERE position > 0
        ORDER BY board_id
        LIMIT :limit
        """,
    )
        .param("userId", userId)
        .param("key", key)
        .param("before", before)
        .param("length", before + key.length + after + 2)
        .param("limit", limit)
        .query { rs, _ ->
            val start = rs.getInt("start")
            val window = rs.getString("window")
            TextWindow(
                boardId = rs.getObject("board_id", UUID::class.java),
                text = window,
                start = start,
                full = start - 1 + window.codePointCount(0, window.length) < rs.getInt("text_length"),
            )
        }
        .list()
}

/** Finds the boards of a user by the texts of their documents. */
@Service
class BoardSearchService(private val search: BoardSearch) {

    /**
     * Boards that the user [userId] can open whose text has the [query], compared as [searchKey] makes them, with the
     * line of the text around the first match. Empty for a query shorter than [MIN_QUERY_LENGTH].
     */
    fun search(userId: UUID, query: String): List<BoardTextMatch> {
        val key = searchKey(query.trim().replace(WHITESPACE, " "))
        if (key.length < MIN_QUERY_LENGTH) return emptyList()
        return search.find(userId, key, CONTEXT, CONTEXT, LIMIT).map { window ->
            BoardTextMatch(window.boardId, fragment(window, key))
        }
    }

    companion object {
        /** The shortest query searched for in the texts of boards: a single letter is in almost every board. */
        const val MIN_QUERY_LENGTH = 2

        /** The longest query. */
        const val MAX_QUERY_LENGTH = 100

        /** The most boards found. */
        const val LIMIT = 100

        /** How many characters of the line a fragment keeps before and after the match. */
        const val CONTEXT = 40

        private val WHITESPACE = Regex("\\s+")

        /**
         * A text as search compares it: lower case and «ё» as «е», character by character, so that a place in the key is
         * the same place in the text — as the database compares the texts of boards.
         */
        fun searchKey(text: String): String = buildString(text.length) {
            for (char in text) append(char.lowercaseChar().let { if (it == 'ё') 'е' else it })
        }

        /**
         * The line of the [window] with the first match of the [key], at most [CONTEXT] characters before and after the
         * match, and «…» where the line goes on.
         */
        fun fragment(window: TextWindow, key: String): String {
            val text = window.text
            val match = searchKey(text).indexOf(key)
            if (match < 0) return text.trim()
            val lineStart = text.lastIndexOf('\n', match - 1) + 1
            val lineEnd = text.indexOf('\n', match + key.length).takeIf { it >= 0 }
            // The window has a character more on each side than the context: a line cut there goes on beyond it.
            var from = maxOf(lineStart, match - CONTEXT)
            var to = minOf(lineEnd ?: text.length, match + key.length + CONTEXT)
            val cutBefore = from > lineStart
            val cutAfter = to < (lineEnd ?: text.length) || (lineEnd == null && window.full)
            // A character outside the basic plane is not cut in half.
            if (from > 0 && text[from].isLowSurrogate()) from++
            if (to < text.length && text[to - 1].isHighSurrogate()) to--
            return buildString {
                if (cutBefore) append('…')
                append(text, from, to)
                if (cutAfter) append('…')
            }
        }
    }
}
