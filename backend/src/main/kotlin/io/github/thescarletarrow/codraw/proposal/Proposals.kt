package io.github.thescarletarrow.codraw.proposal

import com.fasterxml.jackson.annotation.JsonValue
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** Where a proposal of changes stands. Stored by its name. */
enum class ProposalStatus(@get:JsonValue val value: String) {
    /** Its author edits its draft, and the owner or an editor of the board may accept or decline it. */
    OPEN("open"),

    /** The owner or an editor accepted it into the board. */
    ACCEPTED("accepted"),

    /** The owner or an editor declined it. */
    DECLINED("declined"),

    /** Its author took it back. */
    WITHDRAWN("withdrawn"),
}

/** A user as proposals show them: the author and who decided. */
data class ProposalUser(
    val id: UUID,
    val name: String,
    val avatarUrl: String?,
)

/** A proposal of changes of a board, without its documents. */
data class Proposal(
    val id: UUID,
    val boardId: UUID,
    val title: String,
    val description: String?,
    val status: ProposalStatus,
    val author: ProposalUser,
    val createdAt: Instant,
    /** When it was accepted, declined or withdrawn; `null` while it is open. */
    val decidedAt: Instant?,
    /** Who accepted, declined or withdrew it; `null` while it is open and once they are deleted. */
    val decidedBy: ProposalUser?,
    /** What the owner or an editor wrote to the author when declining it. */
    val comment: String?,
)

/** A document of a proposal, its base or its draft; a `null` [state] is an empty document. */
class ProposalDocument(val state: ByteArray?)

/** What the draft of a proposal is open to: its author, whether it is open, and its board. */
data class DraftAccess(
    val boardId: UUID,
    val authorId: UUID,
    val open: Boolean,
)

/** What storing a draft did. */
enum class DraftStore {
    STORED,

    /** There is no such proposal, e.g. its board was deleted. */
    NOT_FOUND,

    /** The proposal is closed, and its draft no longer changes. */
    CLOSED,
}

/**
 * Proposals of changes of boards with their documents, the base and the draft, which are opaque to the backend like the
 * documents of boards. Their authors and those who decided are read from the users with them.
 */
@Repository
class Proposals(private val jdbc: JdbcClient) {

    /** Locks the board till the end of the transaction, so that proposals counted per board do not race each other. */
    fun lockBoard(boardId: UUID) {
        // Unlike FOR UPDATE, this lock lets the board be referenced meanwhile, e.g. by a new version.
        jdbc.sql("SELECT id FROM boards WHERE id = :boardId FOR NO KEY UPDATE").param("boardId", boardId).query().listOfRows()
    }

    /** How many open proposals the board [boardId] has, of the user [authorId] only when given. */
    fun countOpen(boardId: UUID, authorId: UUID? = null): Int = jdbc.sql(
        """
        SELECT count(*) FROM proposals
        WHERE board_id = :boardId AND status = 'OPEN' AND (:authorId::uuid IS NULL OR author_id = :authorId::uuid)
        """,
    )
        .param("boardId", boardId)
        .param("authorId", authorId)
        .query(Int::class.java)
        .single()

    /**
     * Adds an open proposal of the user [authorId] to the board [boardId] at [at]. Its base and its draft are the stored
     * document of the board, copied in the database without passing through the backend.
     */
    fun add(boardId: UUID, authorId: UUID, title: String, description: String?, at: Instant): UUID = jdbc.sql(
        """
        INSERT INTO proposals (board_id, author_id, title, description, base, draft, created_at)
        SELECT :boardId, :authorId, :title, :description, d.state, d.state, :at
        FROM (SELECT 1) AS one LEFT JOIN board_documents d ON d.board_id = :boardId
        RETURNING id
        """,
    )
        .param("boardId", boardId)
        .param("authorId", authorId)
        .param("title", title)
        .param("description", description)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query(UUID::class.java)
        .single()

    /** The proposal [id] of the board [boardId], or `null` when the board has no such proposal. */
    fun find(boardId: UUID, id: UUID): Proposal? = select("p.board_id = :boardId AND p.id = :id")
        .param("boardId", boardId)
        .param("id", id)
        .query { rs, _ -> rs.toProposal() }
        .optional()
        .orElse(null)

    /** The proposals of the board [boardId], of the user [authorId] only when given, newest first. */
    fun list(boardId: UUID, authorId: UUID?): List<Proposal> =
        select("p.board_id = :boardId AND (:authorId::uuid IS NULL OR p.author_id = :authorId::uuid)", "ORDER BY p.id DESC")
            .param("boardId", boardId)
            .param("authorId", authorId)
            .query { rs, _ -> rs.toProposal() }
            .list()

    /**
     * Locks the proposal [id] of the board [boardId] till the end of the transaction and returns it: a second decision
     * about it waits and finds it decided. `null` when the board has no such proposal.
     */
    fun lock(boardId: UUID, id: UUID): Proposal? {
        val locked = jdbc.sql("SELECT id FROM proposals WHERE board_id = :boardId AND id = :id FOR UPDATE")
            .param("boardId", boardId)
            .param("id", id)
            .query(UUID::class.java)
            .optional()
        return if (locked.isPresent) find(boardId, id) else null
    }

    /** Closes the proposal [id] with the [status], decided by the user [deciderId] at [at], with the [comment] if any. */
    fun close(id: UUID, status: ProposalStatus, deciderId: UUID, comment: String?, at: Instant) {
        jdbc.sql(
            """
            UPDATE proposals SET status = :status, decided_by = :deciderId, comment = :comment, decided_at = :at
            WHERE id = :id AND status = 'OPEN'
            """,
        )
            .param("id", id)
            .param("status", status.name)
            .param("deciderId", deciderId)
            .param("comment", comment)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** Deletes the closed proposals of the board [boardId] but the [keep] closed last, with their documents. */
    fun deleteClosedBeyond(boardId: UUID, keep: Int) {
        jdbc.sql(
            """
            DELETE FROM proposals WHERE id IN (
                SELECT id FROM proposals WHERE board_id = :boardId AND status <> 'OPEN'
                ORDER BY decided_at DESC, id DESC
                OFFSET :keep
            )
            """,
        )
            .param("boardId", boardId)
            .param("keep", keep)
            .update()
    }

    /** The base of the proposal [id] of the board [boardId], or `null` when the board has no such proposal. */
    fun base(boardId: UUID, id: UUID): ProposalDocument? = jdbc.sql(
        "SELECT base FROM proposals WHERE board_id = :boardId AND id = :id",
    )
        .param("boardId", boardId)
        .param("id", id)
        .query { rs, _ -> ProposalDocument(rs.getBytes("base")) }
        .optional()
        .orElse(null)

    /** The draft of the proposal [id], or `null` when there is no such proposal. */
    fun draft(id: UUID): ProposalDocument? = jdbc.sql("SELECT draft FROM proposals WHERE id = :id")
        .param("id", id)
        .query { rs, _ -> ProposalDocument(rs.getBytes("draft")) }
        .optional()
        .orElse(null)

    /** Stores the [state] of the draft of the proposal [id], as long as it is open. */
    fun storeDraft(id: UUID, state: ByteArray): DraftStore {
        val stored = jdbc.sql("UPDATE proposals SET draft = :state WHERE id = :id AND status = 'OPEN'")
            .param("id", id)
            .param("state", state)
            .update() > 0
        return when {
            stored -> DraftStore.STORED
            access(id) == null -> DraftStore.NOT_FOUND
            else -> DraftStore.CLOSED
        }
    }

    /** Whose the draft of the proposal [id] is and whether it is open; `null` when there is no such proposal. */
    fun access(id: UUID): DraftAccess? = jdbc.sql("SELECT board_id, author_id, status FROM proposals WHERE id = :id")
        .param("id", id)
        .query { rs, _ ->
            DraftAccess(
                boardId = rs.getObject("board_id", UUID::class.java),
                authorId = rs.getObject("author_id", UUID::class.java),
                open = rs.getString("status") == ProposalStatus.OPEN.name,
            )
        }
        .optional()
        .orElse(null)

    /** Makes the user [toUserId] the author and the decider instead of the user [fromUserId]. */
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        jdbc.sql("UPDATE proposals SET author_id = :toUserId WHERE author_id = :fromUserId")
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
        jdbc.sql("UPDATE proposals SET decided_by = :toUserId WHERE decided_by = :fromUserId")
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
    }

    private fun select(where: String, orderBy: String = ""): JdbcClient.StatementSpec = jdbc.sql(
        """
        SELECT p.id, p.board_id, p.title, p.description, p.status, p.created_at, p.decided_at, p.comment,
               a.id AS author_id, a.name AS author_name, a.avatar_url AS author_avatar_url,
               d.id AS decider_id, d.name AS decider_name, d.avatar_url AS decider_avatar_url
        FROM proposals p
        JOIN users a ON a.id = p.author_id
        LEFT JOIN users d ON d.id = p.decided_by
        WHERE $where
        $orderBy
        """,
    )

    private fun ResultSet.toProposal() = Proposal(
        id = getObject("id", UUID::class.java),
        boardId = getObject("board_id", UUID::class.java),
        title = getString("title"),
        description = getString("description"),
        status = ProposalStatus.valueOf(getString("status")),
        author = ProposalUser(getObject("author_id", UUID::class.java), getString("author_name"), getString("author_avatar_url")),
        createdAt = instant("created_at")!!,
        decidedAt = instant("decided_at"),
        decidedBy = getObject("decider_id", UUID::class.java)?.let { id ->
            ProposalUser(id, getString("decider_name"), getString("decider_avatar_url"))
        },
        comment = getString("comment"),
    )

    private fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()
}
