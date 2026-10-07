package io.github.thescarletarrow.codraw.image

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.BoardDeleted
import org.slf4j.LoggerFactory
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.io.InputStream
import java.security.MessageDigest
import java.time.Clock
import java.time.temporal.ChronoUnit
import java.util.UUID

/** How much room for images a board has: what its images take, how much they may take, and the largest file. */
data class ImageUsage(
    val used: Long,
    val quota: Long,
    val imageSize: Long,
)

/** A stored image of a board, and whether storing made it: the same file of a board is stored once. */
data class StoredImage(val image: BoardImage, val created: Boolean)

/** The file is no PNG, JPEG, GIF or WebP, by its signature. */
class UnsupportedImageException : RuntimeException("The file is no PNG, JPEG, GIF or WebP image")

/** The image is larger than the [limit] of bytes of a file, or of pixels when [pixels]. */
class ImageTooLargeException(val limit: Long, val pixels: Boolean) :
    RuntimeException(if (pixels) "The image has more than $limit pixels" else "The image must have at most $limit bytes")

/** The images of the board take [used] bytes of the [limit], and the new one does not fit. */
class ImageQuotaReachedException(val limit: Long, val used: Long) :
    RuntimeException("The images of the board take $used of $limit bytes, the most allowed")

/** The board was deleted while an image was added to it. */
class BoardGoneException : RuntimeException("Board not found")

/**
 * Images that participants put on boards: rows of [BoardImages] for what they are, objects of [ImageStorage] for their
 * bytes. An image stays as long as its board does; deleting the board deletes its images.
 */
@Service
class BoardImageService(
    private val images: BoardImages,
    private val storage: ImageStorage,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val transactions: TransactionTemplate,
    private val clock: Clock,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    fun usage(boardId: UUID) = ImageUsage(images.sizeOf(boardId), limits.imagesSizePerBoard.toBytes(), limits.imageSize.toBytes())

    /**
     * Stores the image file [bytes] of the board [boardId], which the caller has checked against the limit of a file.
     * Throws [UnsupportedImageException], [ImageTooLargeException] for too many pixels, [ImageQuotaReachedException],
     * [BoardGoneException] and [ImageStorageException].
     */
    fun store(boardId: UUID, bytes: ByteArray): StoredImage {
        val info = ImageFormats.sniff(bytes) ?: throw UnsupportedImageException()
        if (info.pixels > ImageFormats.MAX_PIXELS) {
            metrics.limitReached(Limit.IMAGE)
            throw ImageTooLargeException(ImageFormats.MAX_PIXELS, pixels = true)
        }
        val sha256 = MessageDigest.getInstance("SHA-256").digest(bytes)
        // The row first, in a short transaction that holds no connection while the bytes go to the storage.
        val stored = checkNotNull(transactions.execute { add(boardId, sha256, info, bytes.size.toLong()) })
        try {
            // Again for a file the board has: its first upload may still be on its way, or may have failed.
            storage.put(stored.image.key, bytes, info.type.mediaType)
        } catch (exception: ImageStorageException) {
            if (stored.created) images.delete(listOf(stored.image.id))
            throw exception
        }
        if (stored.created) metrics.imageStored(bytes.size.toLong())
        return stored
    }

    private fun add(boardId: UUID, sha256: ByteArray, info: ImageInfo, size: Long): StoredImage {
        // Images added to a board at the same time count each other.
        if (!images.lockBoard(boardId)) throw BoardGoneException()
        images.findBySha256(boardId, sha256)?.let { return StoredImage(it, created = false) }
        val used = images.sizeOf(boardId)
        val quota = limits.imagesSizePerBoard.toBytes()
        if (used + size > quota) {
            metrics.limitReached(Limit.IMAGES)
            throw ImageQuotaReachedException(quota, used)
        }
        val at = clock.instant().truncatedTo(ChronoUnit.MICROS)
        return StoredImage(images.add(boardId, sha256, info, size, at), created = true)
    }

    /** The image [id] of the board [boardId], or `null` when the board has none. */
    fun find(boardId: UUID, id: UUID): BoardImage? = images.find(boardId, id)

    /** The bytes of the [image], to be closed by the caller; `null` when the storage lost them. */
    fun open(image: BoardImage): InputStream? = storage.get(image.key)

    /** The images of a board go with it, at once when its owner deletes it; failures leave them to [ImageCleanup]. */
    @EventListener
    fun boardDeleted(event: BoardDeleted) {
        try {
            delete(images.ofBoard(event.boardId))
        } catch (exception: ImageStorageException) {
            log.warn("The images of the deleted board {} stay till the next cleanup: {}", event.boardId, exception.cause?.message)
        }
    }

    /** Deletes up to [limit] images of deleted boards from the storage, then their rows; returns how many. */
    fun deleteImagesOfDeletedBoards(limit: Int): Int = delete(images.ofDeletedBoards(limit))

    private fun delete(gone: List<BoardImage>): Int {
        if (gone.isEmpty()) return 0
        storage.delete(gone.map { it.key })
        images.delete(gone.map { it.id })
        metrics.imagesDeleted(gone.size)
        return gone.size
    }
}
