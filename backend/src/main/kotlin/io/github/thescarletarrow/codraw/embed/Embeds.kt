package io.github.thescarletarrow.codraw.embed

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** The live image of a page of a board. */
data class Embed(
    /** The secret part of the address of the image. */
    val token: String,
    val pageId: String,
    /** When the image was last published, `null` before the first one. */
    val updatedAt: Instant?,
)

/** The image itself, as the public address serves it. */
data class EmbedImage(
    val svg: ByteArray?,
    val updatedAt: Instant?,
)

/** Live images of boards, one per board. */
@Repository
class Embeds(private val jdbc: JdbcClient) {

    fun find(boardId: UUID): Embed? = jdbc.sql("SELECT token, page_id, updated_at FROM board_embeds WHERE board_id = :boardId")
        .param("boardId", boardId)
        .query { rs, _ -> rs.toEmbed() }
        .optional()
        .orElse(null)

    fun image(token: String): EmbedImage? = jdbc.sql("SELECT e.svg, e.updated_at FROM board_embeds e JOIN boards b ON b.id = e.board_id WHERE e.token = :token AND b.deleted_at IS NULL")
        .param("token", token)
        .query { rs, _ -> EmbedImage(rs.getBytes("svg"), rs.instant("updated_at")) }
        .optional()
        .orElse(null)

    /**
     * Shows the page [pageId] of the board as its live image: a new image gets [token]; another page of an image clears
     * the picture of the page before, which is not the image of the page now.
     */
    fun enable(boardId: UUID, pageId: String, token: String, at: Instant): Embed = jdbc.sql(
        """
        INSERT INTO board_embeds (board_id, token, page_id, created_at) VALUES (:boardId, :token, :pageId, :at)
        ON CONFLICT (board_id) DO UPDATE SET
            page_id = EXCLUDED.page_id,
            svg = CASE WHEN board_embeds.page_id = EXCLUDED.page_id THEN board_embeds.svg END,
            updated_at = CASE WHEN board_embeds.page_id = EXCLUDED.page_id THEN board_embeds.updated_at END
        RETURNING token, page_id, updated_at
        """,
    )
        .param("boardId", boardId)
        .param("token", token)
        .param("pageId", pageId)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> rs.toEmbed() }
        .single()

    fun disable(boardId: UUID) {
        jdbc.sql("DELETE FROM board_embeds WHERE board_id = :boardId").param("boardId", boardId).update()
    }

    /** Stores the picture of the page [pageId]; `false` when the image of the board shows no such page. */
    fun store(boardId: UUID, pageId: String, svg: ByteArray, at: Instant): Boolean = jdbc.sql(
        "UPDATE board_embeds SET svg = :svg, updated_at = :at WHERE board_id = :boardId AND page_id = :pageId",
    )
        .param("boardId", boardId)
        .param("pageId", pageId)
        .param("svg", svg)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .update() > 0

    private fun ResultSet.toEmbed() = Embed(getString("token"), getString("page_id"), instant("updated_at"))

    private fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()
}
