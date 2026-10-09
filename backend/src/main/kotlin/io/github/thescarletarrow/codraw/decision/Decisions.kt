package io.github.thescarletarrow.codraw.decision

import com.fasterxml.jackson.annotation.JsonValue
import io.github.thescarletarrow.codraw.comment.Person
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** Where a decision stands, as MADR names it. Stored by its name. */
enum class DecisionStatus(@get:JsonValue val value: String) {
    PROPOSED("proposed"),
    ACCEPTED("accepted"),
    REJECTED("rejected"),

    /** Another decision of the board, which the decision names, took its place. */
    SUPERSEDED("superseded"),
    ;

    companion object {
        /** The status that the API names [value], `null` for a name outside the set. */
        fun of(value: String): DecisionStatus? = entries.find { it.value == value }
    }
}

/** An element of a page of the board document a decision is about; the cell may be deleted since. */
data class DecisionElement(
    val pageId: String,
    val cellId: String,
)

/**
 * An architecture decision of a board in the format of MADR: its number on the board, its title and status, the day it
 * was decided on, its author, and its sections, which are text of Markdown.
 */
data class Decision(
    val id: UUID,
    val number: Int,
    val title: String,
    val status: DecisionStatus,
    /** The decision of the board that superseded it; `null` for one of another status, or once that decision is gone. */
    val supersededBy: UUID?,
    val decidedOn: LocalDate,
    /** Who wrote it down; `null` once they are deleted. */
    val author: Person?,
    val context: String,
    /** The options considered. */
    val options: String,
    /** The outcome: the option chosen and why. */
    val outcome: String,
    val consequences: String,
    /** The elements it is about, by page and cell. */
    val elements: List<DecisionElement>,
    val createdAt: Instant,
    val updatedAt: Instant,
)

/** What a decision says, apart from its number, author and elements. */
data class DecisionContent(
    val title: String,
    val status: DecisionStatus,
    val supersededBy: UUID?,
    val decidedOn: LocalDate,
    val context: String,
    val options: String,
    val outcome: String,
    val consequences: String,
)

/** Architecture decisions of boards and the elements they are about. */
@Repository
class Decisions(private val jdbc: JdbcClient) {

    /** All decisions of the board, by their numbers. */
    fun decisions(boardId: UUID): List<Decision> = load(boardId, decisionId = null)

    fun decision(boardId: UUID, decisionId: UUID): Decision? = load(boardId, decisionId).singleOrNull()

    /** Whether the decision [decisionId] is on the board [boardId]. */
    fun exists(boardId: UUID, decisionId: UUID): Boolean = jdbc.sql(
        "SELECT EXISTS (SELECT 1 FROM decisions WHERE id = :decisionId AND board_id = :boardId)",
    )
        .param("decisionId", decisionId)
        .param("boardId", boardId)
        .query(Boolean::class.java)
        .single()

    /** Locks the board till the end of the transaction, so that decisions counted and numbered per board do not race. */
    fun lockBoard(boardId: UUID) {
        jdbc.sql("SELECT id FROM boards WHERE id = :boardId FOR NO KEY UPDATE").param("boardId", boardId).query().listOfRows()
    }

    fun countOnBoard(boardId: UUID): Int = jdbc.sql("SELECT count(*) FROM decisions WHERE board_id = :boardId")
        .param("boardId", boardId)
        .query(Int::class.java)
        .single()

    /** The number after the largest one of the board, 1 for its first decision. */
    fun nextNumber(boardId: UUID): Int = jdbc.sql("SELECT coalesce(max(number), 0) + 1 FROM decisions WHERE board_id = :boardId")
        .param("boardId", boardId)
        .query(Int::class.java)
        .single()

    fun numberTaken(boardId: UUID, number: Int): Boolean = jdbc.sql(
        "SELECT EXISTS (SELECT 1 FROM decisions WHERE board_id = :boardId AND number = :number)",
    )
        .param("boardId", boardId)
        .param("number", number)
        .query(Boolean::class.java)
        .single()

    fun add(boardId: UUID, number: Int, authorId: UUID, content: DecisionContent, at: Instant): UUID = jdbc.sql(
        """
        INSERT INTO decisions (board_id, number, title, status, superseded_by, decided_on, author_id, context, options,
                               outcome, consequences, created_at, updated_at)
        VALUES (:boardId, :number, :title, :status, :supersededBy, :decidedOn, :authorId, :context, :options, :outcome,
                :consequences, :at, :at)
        RETURNING id
        """,
    )
        .param("boardId", boardId)
        .param("number", number)
        .param("authorId", authorId)
        .content(content)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query(UUID::class.java)
        .single()

    fun update(decisionId: UUID, content: DecisionContent, at: Instant) {
        jdbc.sql(
            """
            UPDATE decisions
            SET title = :title, status = :status, superseded_by = :supersededBy, decided_on = :decidedOn, context = :context,
                options = :options, outcome = :outcome, consequences = :consequences, updated_at = :at
            WHERE id = :decisionId
            """,
        )
            .param("decisionId", decisionId)
            .content(content)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** Makes the decision be about exactly the [elements]. */
    fun replaceElements(decisionId: UUID, elements: List<DecisionElement>, at: Instant) {
        jdbc.sql("DELETE FROM decision_elements WHERE decision_id = :decisionId").param("decisionId", decisionId).update()
        for (element in elements.distinct()) {
            jdbc.sql("INSERT INTO decision_elements (decision_id, page_id, cell_id) VALUES (:decisionId, :pageId, :cellId)")
                .param("decisionId", decisionId)
                .param("pageId", element.pageId)
                .param("cellId", element.cellId)
                .update()
        }
        jdbc.sql("UPDATE decisions SET updated_at = :at WHERE id = :decisionId")
            .param("decisionId", decisionId)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** Deletes the decision with its elements and its discussion; decisions it superseded no longer name it. */
    fun delete(decisionId: UUID) {
        jdbc.sql("DELETE FROM decisions WHERE id = :decisionId").param("decisionId", decisionId).update()
    }

    /** Passes the decisions of the user [fromUserId] to the user [toUserId]. */
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        jdbc.sql("UPDATE decisions SET author_id = :toUserId WHERE author_id = :fromUserId")
            .param("fromUserId", fromUserId)
            .param("toUserId", toUserId)
            .update()
    }

    /** Decisions of the board, or only the decision [decisionId] of it, with their elements: two queries. */
    private fun load(boardId: UUID, decisionId: UUID?): List<Decision> {
        val decisionFilter = if (decisionId == null) "" else "AND d.id = :decisionId"
        val decisions = jdbc.sql(
            """
            SELECT d.id, d.number, d.title, d.status, d.superseded_by, d.decided_on, d.context, d.options, d.outcome,
                   d.consequences, d.created_at, d.updated_at, a.id AS author_id, a.name AS author_name,
                   a.avatar_url AS author_avatar_url
            FROM decisions d
            LEFT JOIN users a ON a.id = d.author_id
            WHERE d.board_id = :boardId $decisionFilter
            ORDER BY d.number
            """,
        )
            .param("boardId", boardId)
            .apply { if (decisionId != null) param("decisionId", decisionId) }
            .query { rs, _ -> rs.toDecision() }
            .list()
        if (decisions.isEmpty()) return decisions
        val elements = jdbc.sql(
            """
            SELECT e.decision_id, e.page_id, e.cell_id
            FROM decision_elements e
            JOIN decisions d ON d.id = e.decision_id
            WHERE d.board_id = :boardId $decisionFilter
            ORDER BY e.page_id, e.cell_id
            """,
        )
            .param("boardId", boardId)
            .apply { if (decisionId != null) param("decisionId", decisionId) }
            .query { rs, _ -> rs.getObject("decision_id", UUID::class.java) to DecisionElement(rs.getString("page_id"), rs.getString("cell_id")) }
            .list()
            .groupBy({ it.first }, { it.second })
        return decisions.map { it.copy(elements = elements[it.id].orEmpty()) }
    }

    private fun JdbcClient.StatementSpec.content(content: DecisionContent): JdbcClient.StatementSpec = this
        .param("title", content.title)
        .param("status", content.status.name)
        .param("supersededBy", content.supersededBy)
        .param("decidedOn", content.decidedOn)
        .param("context", content.context)
        .param("options", content.options)
        .param("outcome", content.outcome)
        .param("consequences", content.consequences)

    private fun ResultSet.toDecision() = Decision(
        id = getObject("id", UUID::class.java),
        number = getInt("number"),
        title = getString("title"),
        status = DecisionStatus.valueOf(getString("status")),
        supersededBy = getObject("superseded_by", UUID::class.java),
        decidedOn = getObject("decided_on", LocalDate::class.java),
        author = getObject("author_id", UUID::class.java)?.let { Person(it, getString("author_name"), getString("author_avatar_url")) },
        context = getString("context"),
        options = getString("options"),
        outcome = getString("outcome"),
        consequences = getString("consequences"),
        elements = emptyList(),
        createdAt = getObject("created_at", OffsetDateTime::class.java).toInstant(),
        updatedAt = getObject("updated_at", OffsetDateTime::class.java).toInstant(),
    )
}
