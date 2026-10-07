package io.github.thescarletarrow.codraw.image

import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

/**
 * Deletes the images of deleted boards from the storage, then their rows. The owner deleting a board deletes its images
 * at once; this finds the rest: boards deleted by the cleanup of gone guests, and images that the storage did not let
 * go at the time.
 */
@Component
class ImageCleanup(private val images: BoardImageService) {

    private val log = LoggerFactory.getLogger(javaClass)

    /** Images deleted by one batch; tests make it small. */
    internal var batchSize = BATCH_SIZE

    @Scheduled(cron = "\${codraw.images.cleanup-cron}")
    fun run() {
        try {
            val deleted = cleanUp()
            if (deleted > 0) log.info("Image cleanup deleted {} images of deleted boards", deleted)
        } catch (exception: ImageStorageException) {
            log.warn("Image cleanup waits for the storage of images: {}", exception.cause?.message)
        }
    }

    /** Deletes the images of deleted boards; returns how many. */
    fun cleanUp(): Int {
        var total = 0
        do {
            val deleted = images.deleteImagesOfDeletedBoards(batchSize)
            total += deleted
        } while (deleted == batchSize)
        return total
    }

    companion object {
        const val BATCH_SIZE = 500
    }
}
