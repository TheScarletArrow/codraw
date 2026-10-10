package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.user.UserService
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import java.util.UUID

@IntegrationTest
class UserChecksApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
) {

    /** Other tests sign the same users in: none of them stays blocked. */
    @AfterEach
    fun unblockAll() {
        jdbcClient.sql("UPDATE users SET blocked_at = NULL").update()
    }

    @Test
    fun `tells which users are gone and which are blocked`() {
        val alice = users.gitHubUser("Alice")
        val bob = users.gitHubUser("Bob")
        val gone = UUID.randomUUID()
        jdbcClient.sql("UPDATE users SET blocked_at = now() WHERE id = :id").param("id", bob.id).update()

        check("""{"userIds": ["${alice.id}", "${bob.id}", "$gone", "not-an-id"]}""").andExpect {
            status { isOk() }
            content { json("""{"missing": ["$gone", "not-an-id"], "blocked": ["${bob.id}"]}""", strict = true) }
        }
        check("""{"userIds": []}""").andExpect { content { json("""{"missing": [], "blocked": []}""", strict = true) } }
    }

    @Test
    fun `answers about at most 10000 users at once, and only to collab`() {
        val many = (1..10_001).joinToString { "\"${UUID.randomUUID()}\"" }
        check("""{"userIds": [$many]}""").andExpect { status { isBadRequest() } }

        mockMvc.post("/internal/users/check") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"userIds": []}"""
        }.andExpect { status { isUnauthorized() } }
    }

    private fun check(body: String) = mockMvc.post("/internal/users/check") {
        header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
        contentType = MediaType.APPLICATION_JSON
        content = body
    }
}
