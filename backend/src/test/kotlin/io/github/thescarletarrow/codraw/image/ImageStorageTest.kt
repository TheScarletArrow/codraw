package io.github.thescarletarrow.codraw.image

import io.github.thescarletarrow.codraw.TestcontainersConfiguration
import org.junit.jupiter.api.Test
import java.util.UUID
import kotlin.test.assertContentEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class ImageStorageTest {

    private fun storage(endpoint: String, bucket: String = "codraw-images") = ImageStorage(
        ImageProperties(
            ImageProperties.S3(
                endpoint = endpoint,
                bucket = bucket,
                accessKey = TestcontainersConfiguration.S3_ACCESS_KEY,
                secretKey = TestcontainersConfiguration.S3_SECRET_KEY,
            ),
        ),
    )

    @Test
    fun `a storage that does not answer keeps the backend from nothing but storing images`() {
        // Nothing listens on the port 1.
        val storage = storage("http://127.0.0.1:1")

        storage.prepare()

        assertFailsWith<ImageStorageException> { storage.put("boards/a/b", byteArrayOf(1), "image/png") }
        assertFailsWith<ImageStorageException> { storage.get("boards/a/b") }
        storage.destroy()
    }

    @Test
    fun `a new bucket is made with the first image, and objects are stored, read and deleted`() {
        val s3 = TestcontainersConfiguration.s3
        val storage = storage("http://${s3.host}:${s3.getMappedPort(TestcontainersConfiguration.S3_PORT)}", "images-${UUID.randomUUID()}")
        val keys = (1..3).map { "boards/${UUID.randomUUID()}/$it" }

        keys.forEachIndexed { index, key -> storage.put(key, byteArrayOf(index.toByte(), 2, 3), "image/png") }

        storage.get(keys[1])!!.use { assertContentEquals(byteArrayOf(1, 2, 3), it.readAllBytes()) }
        storage.delete(keys.take(2) + "boards/missing/key")
        assertNull(storage.get(keys[0]))
        assertNull(storage.get(keys[1]))
        storage.get(keys[2])!!.close()
        storage.destroy()
    }
}
