package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.user.UserService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import java.util.UUID

@IntegrationTest
class MissingUsersApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val users: UserService,
) {

    @Test
    fun `tells which users are gone`() {
        val alice = users.gitHubUser("Alice")
        val gone = UUID.randomUUID()

        mockMvc.post("/internal/users/missing") {
            header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """["${alice.id}", "$gone", "not-an-id"]"""
        }.andExpect {
            status { isOk() }
            content { json("""["$gone", "not-an-id"]""", strict = true) }
        }
    }

    @Test
    fun `needs the internal token`() {
        mockMvc.post("/internal/users/missing") {
            contentType = MediaType.APPLICATION_JSON
            content = "[]"
        }.andExpect { status { isUnauthorized() } }
    }
}
