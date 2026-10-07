package io.github.thescarletarrow.codraw.image

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.DisposableBean
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.core.ResponseInputStream
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation
import software.amazon.awssdk.core.exception.SdkException
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.BucketAlreadyOwnedByYouException
import software.amazon.awssdk.services.s3.model.Delete
import software.amazon.awssdk.services.s3.model.GetObjectResponse
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.ObjectIdentifier
import software.amazon.awssdk.services.s3.model.S3Exception
import java.net.URI
import java.time.Duration

/** Where the images of boards are stored: an S3-compatible storage, see docs/adr/0006-image-storage.md. */
@ConfigurationProperties("codraw.images")
data class ImageProperties(
    val s3: S3 = S3(),
) {
    data class S3(
        /** The address of the storage, e.g. `http://s3:9000`; empty for Amazon S3 itself, by the region. */
        val endpoint: String = "",
        val region: String = "us-east-1",
        /** Created on start when the storage has no such bucket. */
        val bucket: String = "codraw-images",
        /** Keys of access; without them, those of the environment (e.g. a role of the server at Amazon). */
        val accessKey: String = "",
        val secretKey: String = "",
        /** The bucket in the path of the address (`http://s3:9000/bucket/key`), as S3-compatible servers expect. */
        val pathStyle: Boolean = true,
    )
}

/** The storage of images did not answer, or refused a request; boards work without it. */
class ImageStorageException(cause: Throwable) : RuntimeException("The storage of images is not available", cause)

/**
 * Objects of the S3-compatible storage that keeps the bytes of images of boards. Calls are synchronous: requests run on
 * virtual threads. Failures throw [ImageStorageException].
 */
@Component
class ImageStorage(properties: ImageProperties) : DisposableBean {

    private val log = LoggerFactory.getLogger(javaClass)

    private val bucket = properties.s3.bucket

    private val client: S3Client = properties.s3.let { s3 ->
        S3Client.builder()
            .httpClient(
                UrlConnectionHttpClient.builder()
                    .connectionTimeout(Duration.ofSeconds(5))
                    .socketTimeout(Duration.ofSeconds(60))
                    .build(),
            )
            .region(Region.of(s3.region))
            .credentialsProvider(credentials(s3))
            .forcePathStyle(s3.pathStyle)
            // Checksums only where S3 requires them: S3-compatible servers take the newer ones differently.
            .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
            .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
            .apply { if (s3.endpoint.isNotBlank()) endpointOverride(URI.create(s3.endpoint.trim())) }
            .build()
    }

    @Volatile
    private var bucketReady = false

    /**
     * Creates the bucket when the storage has none. A storage that does not answer keeps nobody from working on boards:
     * the backend starts anyway, and the bucket is made on the first image.
     */
    @EventListener(ApplicationReadyEvent::class)
    fun prepare() {
        try {
            ensureBucket()
        } catch (exception: ImageStorageException) {
            log.warn("The storage of images is not available; images are stored once it is: {}", exception.cause?.message)
        }
    }

    fun put(key: String, bytes: ByteArray, contentType: String) = call {
        ensureBucket()
        client.putObject({ it.bucket(bucket).key(key).contentType(contentType).contentLength(bytes.size.toLong()) }, RequestBody.fromBytes(bytes))
    }

    /** The object [key] as a stream that the caller closes; `null` when the storage has no such object. */
    fun get(key: String): ResponseInputStream<GetObjectResponse>? = call {
        try {
            client.getObject { it.bucket(bucket).key(key) }
        } catch (_: NoSuchKeyException) {
            null
        }
    }

    /** Deletes the objects [keys]; keys without objects are fine. */
    fun delete(keys: Collection<String>) = call {
        for (batch in keys.chunked(MAX_DELETE)) {
            val objects = batch.map { ObjectIdentifier.builder().key(it).build() }
            val response = client.deleteObjects { it.bucket(bucket).delete(Delete.builder().objects(objects).quiet(true).build()) }
            if (response.hasErrors() && response.errors().isNotEmpty()) {
                throw IllegalStateException("The storage did not delete ${response.errors().size} objects: ${response.errors().first().message()}")
            }
        }
    }

    private fun ensureBucket() {
        if (bucketReady) return
        synchronized(this) {
            if (bucketReady) return
            call {
                try {
                    client.headBucket { it.bucket(bucket) }
                } catch (exception: S3Exception) {
                    if (exception.statusCode() != 404) throw exception
                    try {
                        client.createBucket { it.bucket(bucket) }
                        log.info("Created the bucket {} for images", bucket)
                    } catch (_: BucketAlreadyOwnedByYouException) {
                        // Another instance of the backend made it meanwhile.
                    }
                }
            }
            bucketReady = true
        }
    }

    private fun <T> call(action: () -> T): T = try {
        action()
    } catch (exception: SdkException) {
        throw ImageStorageException(exception)
    } catch (exception: IllegalStateException) {
        throw ImageStorageException(exception)
    }

    override fun destroy() = client.close()

    companion object {
        /** The most keys that one request deletes, as S3 allows. */
        private const val MAX_DELETE = 1000

        private fun credentials(s3: ImageProperties.S3): AwsCredentialsProvider =
            if (s3.accessKey.isBlank()) {
                DefaultCredentialsProvider.builder().build()
            } else {
                StaticCredentialsProvider.create(AwsBasicCredentials.create(s3.accessKey, s3.secretKey))
            }
    }
}
