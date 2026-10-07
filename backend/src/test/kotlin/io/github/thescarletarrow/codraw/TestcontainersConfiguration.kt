package io.github.thescarletarrow.codraw

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.springframework.test.context.DynamicPropertyRegistrar
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.postgresql.PostgreSQLContainer

@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    fun postgres(): PostgreSQLContainer = PostgreSQLContainer("postgres:18-alpine")

    /** The storage of images: the server of docker-compose.yml. */
    @Bean
    fun imageStorageProperties() = DynamicPropertyRegistrar { registry ->
        registry.add("codraw.images.s3.endpoint") { "http://${s3.host}:${s3.getMappedPort(S3_PORT)}" }
        registry.add("codraw.images.s3.access-key") { S3_ACCESS_KEY }
        registry.add("codraw.images.s3.secret-key") { S3_SECRET_KEY }
    }

    companion object {
        const val S3_IMAGE = "rustfs/rustfs:1.0.1"
        const val S3_PORT = 9000
        const val S3_ACCESS_KEY = "codraw-test"
        const val S3_SECRET_KEY = "codraw-test-secret"

        /**
         * One storage for all contexts of the tests, started when the first one needs it: keys of images have the ids of
         * their boards, so the contexts do not mix.
         */
        val s3: S3Container by lazy {
            S3Container()
                .withExposedPorts(S3_PORT)
                .withEnv("RUSTFS_ACCESS_KEY", S3_ACCESS_KEY)
                .withEnv("RUSTFS_SECRET_KEY", S3_SECRET_KEY)
                .waitingFor(Wait.forHttp("/health").forPort(S3_PORT))
                .apply { start() }
        }
    }
}

/** A container of the storage of images; Kotlin needs the type of the container for the builder methods. */
class S3Container : GenericContainer<S3Container>(TestcontainersConfiguration.S3_IMAGE)
