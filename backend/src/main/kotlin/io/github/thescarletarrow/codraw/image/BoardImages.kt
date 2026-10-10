package io.github.thescarletarrow.codraw.image

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

/** An image of a board, without its bytes. */
data class BoardImage(
    val id: UUID,
    val boardId: UUID,
    val type: ImageType,
    val size: Long,
    val width: Int,
    val height: Int,
) {
    /** Where the storage keeps its bytes. */
    val key: String
        get() = storageKey(boardId, id)
}

/** Where the storage keeps the bytes of the image [id] of the board [boardId]. */
fun storageKey(boardId: UUID, id: UUID) = "boards/$boardId/$id"

/** Images of boards, which stay as long as their board does; their bytes are in [ImageStorage]. */
@Repository
class BoardImages(private val jdbc: JdbcClient) {

    /**
     * Locks the board till the end of the transaction, so that images added to it at the same time count each other;
     * `false` when there is no such board any more.
     */
    fun lockBoard(boardId: UUID): Boolean =
        // Unlike FOR UPDATE, this lock lets the board be referenced meanwhile, e.g. by a new version.
        jdbc.sql("SELECT id FROM boards WHERE id = :boardId FOR NO KEY UPDATE").param("boardId", boardId).query().listOfRows().isNotEmpty()

    fun find(boardId: UUID, id: UUID): BoardImage? = select("board_id = :boardId AND id = :id")
        .param("boardId", boardId)
        .param("id", id)
        .query { rs, _ -> rs.toImage() }
        .optional()
        .orElse(null)

    /** The image of the board [boardId] with the bytes whose SHA-256 is [sha256], if the board has one. */
    fun findBySha256(boardId: UUID, sha256: ByteArray): BoardImage? = select("board_id = :boardId AND sha256 = :sha256")
        .param("boardId", boardId)
        .param("sha256", sha256)
        .query { rs, _ -> rs.toImage() }
        .optional()
        .orElse(null)

    /** How many bytes the images of the board [boardId] take together. */
    fun sizeOf(boardId: UUID): Long = jdbc.sql("SELECT coalesce(sum(size), 0) FROM board_images WHERE board_id = :boardId")
        .param("boardId", boardId)
        .query(Long::class.java)
        .single()

    fun add(boardId: UUID, sha256: ByteArray, info: ImageInfo, size: Long, at: Instant): BoardImage = jdbc.sql(
        """
        INSERT INTO board_images (board_id, sha256, content_type, size, width, height, created_at)
        VALUES (:boardId, :sha256, :contentType, :size, :width, :height, :at)
        RETURNING $COLUMNS
        """,
    )
        .param("boardId", boardId)
        .param("sha256", sha256)
        .param("contentType", info.type.mediaType)
        .param("size", size)
        .param("width", info.width)
        .param("height", info.height)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> rs.toImage() }
        .single()

    /** The images of the board [boardId]. */
    fun ofBoard(boardId: UUID): List<BoardImage> = select("board_id = :boardId")
        .param("boardId", boardId)
        .query { rs, _ -> rs.toImage() }
        .list()

    /**
     * Gives the board [to] a copy of each image of the board [from], with the same bytes and a new id; returns the id of
     * each copy by the id of its image. The bytes are copied in the storage by the caller.
     */
    fun copyAll(from: UUID, to: UUID, at: Instant): Map<UUID, UUID> = jdbc.sql(
        """
        WITH copied AS (
            INSERT INTO board_images (board_id, sha256, content_type, size, width, height, created_at)
            SELECT :to, sha256, content_type, size, width, height, :at FROM board_images WHERE board_id = :from
            RETURNING id, sha256
        )
        -- The same file is stored once per board, so its hash names the image of the copy.
        SELECT i.id AS original_id, c.id AS copy_id FROM copied c JOIN board_images i ON i.board_id = :from AND i.sha256 = c.sha256
        """,
    )
        .param("from", from)
        .param("to", to)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> rs.getObject("original_id", UUID::class.java) to rs.getObject("copy_id", UUID::class.java) }
        .list()
        .toMap()

    /** Up to [limit] images whose boards are deleted. */
    fun ofDeletedBoards(limit: Int): List<BoardImage> = jdbc.sql(
        """
        SELECT $COLUMNS FROM board_images i
        WHERE NOT EXISTS (SELECT 1 FROM boards b WHERE b.id = i.board_id)
        LIMIT :limit
        """,
    )
        .param("limit", limit)
        .query { rs, _ -> rs.toImage() }
        .list()

    fun delete(ids: Collection<UUID>) {
        if (ids.isEmpty()) return
        jdbc.sql("DELETE FROM board_images WHERE id IN (:ids)").param("ids", ids).update()
    }

    private fun select(where: String) = jdbc.sql("SELECT $COLUMNS FROM board_images WHERE $where")

    private fun ResultSet.toImage() = BoardImage(
        id = getObject("id", UUID::class.java),
        boardId = getObject("board_id", UUID::class.java),
        type = checkNotNull(ImageType.of(getString("content_type"))) { "Unknown type of an image: ${getString("content_type")}" },
        size = getLong("size"),
        width = getInt("width"),
        height = getInt("height"),
    )

    companion object {
        private const val COLUMNS = "id, board_id, content_type, size, width, height"
    }
}
