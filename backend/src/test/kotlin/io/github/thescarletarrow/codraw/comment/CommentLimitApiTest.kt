package io.github.thescarletarrow.codraw.comment

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import kotlin.test.assertEquals

@IntegrationTest
@TestPropertySource(properties = ["codraw.limits.comments-per-board=2"])
class CommentLimitApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val registry: MeterRegistry,
) {

    @Test
    fun `a board holds at most the limit of comments, in all its threads`() {
        val alice = users.gitHubUser("Alice")
        val session = alice.session()
        fun post(path: String, json: String) = mockMvc.post(path) {
            with(session)
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = json
        }
        val board = post("/api/boards", """{"title": "Доска"}""").andReturn().response.getHeader("Location")!!
        val thread = post("$board/threads", """{"pageId": "page-1", "body": "Первый"}""")
            .andExpect { status { isCreated() } }
            .andReturn().response.getHeader("Location")!!
        post("$thread/comments", """{"body": "Второй"}""").andExpect { status { isCreated() } }
        val reached = registry.get("codraw.limits.reached").tag("limit", "comments").counter().count()

        post("$thread/comments", """{"body": "Третий"}""").andExpect {
            status { isConflict() }
            jsonPath("$.limit") { value(2) }
        }
        post("$board/threads", """{"pageId": "page-1", "body": "Новая ветка"}""").andExpect { status { isConflict() } }

        assertEquals(reached + 2, registry.get("codraw.limits.reached").tag("limit", "comments").counter().count())
        assertEquals(2, jdbcClient.sql("SELECT count(*) FROM comments").query(Int::class.java).single())
    }
}
