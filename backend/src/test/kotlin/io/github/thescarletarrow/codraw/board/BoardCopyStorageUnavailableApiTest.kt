package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.image.ImageProperties
import io.github.thescarletarrow.codraw.image.ImageStorage
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.UserService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import kotlin.test.assertEquals

/** A storage of images that does not answer: nothing listens on the port 1. */
@IntegrationTest
@Import(BoardCopyStorageUnavailableApiTest.DeadStorage::class)
class BoardCopyStorageUnavailableApiTest(
    @Autowired private val mvc: MockMvc,
    @Autowired private val jdbc: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val boards: BoardService,
) {

    @TestConfiguration(proxyBeanMethods = false)
    class DeadStorage {
        @Bean
        @Primary
        fun deadImageStorage() = ImageStorage(ImageProperties(ImageProperties.S3(endpoint = "http://127.0.0.1:1", accessKey = "a", secretKey = "b")))
    }

    @Test
    fun `a board with images is not copied while the storage does not answer, and leaves no copy behind`() {
        jdbc.sql("DELETE FROM boards").update()
        val alice = users.gitHubUser("Alice")
        val original = checkNotNull(boards.create("Схема", alice.id).id)
        jdbc.sql(
            """
            INSERT INTO board_images (board_id, sha256, content_type, size, width, height, created_at)
            VALUES (:board, :sha256, 'image/png', 10, 1, 1, now())
            """,
        ).param("board", original).param("sha256", ByteArray(32)).update()

        mvc.post("/api/boards/$original/copy") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isServiceUnavailable() } }

        assertEquals(listOf(original), boards.list(alice.id).map { it.id })
        // The rows of the images of the deleted copy wait for the cleanup, which finds them by their missing board.
        assertEquals(
            listOf(original),
            jdbc.sql("SELECT board_id FROM board_images i WHERE EXISTS (SELECT 1 FROM boards b WHERE b.id = i.board_id)")
                .query(java.util.UUID::class.java).list(),
        )
    }
}
