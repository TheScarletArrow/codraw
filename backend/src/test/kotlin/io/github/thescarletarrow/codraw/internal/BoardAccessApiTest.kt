package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post

@IntegrationTest
class BoardAccessApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
) {

    private lateinit var owner: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        owner = users.gitHubUser("Owner")
    }

    @Test
    fun `returns the owner and the link access of a board`() {
        val board = createBoard()

        mockMvc.get(accessUrl(board)) { header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN) }
            .andExpect {
                status { isOk() }
                content { json("""{"ownerId": "${owner.id}", "linkAccess": "edit"}""", strict = true) }
            }

        mockMvc.patch("/api/boards/$board") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "view"}"""
        }.andExpect { status { isOk() } }
        mockMvc.get(accessUrl(board)) { header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN) }
            .andExpect { jsonPath("$.linkAccess") { value("view") } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["0199a000-0000-7000-8000-000000000000", "not-a-uuid"])
    fun `returns 404 for an unknown board`(board: String) {
        mockMvc.get(accessUrl(board)) { header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN) }
            .andExpect { status { isNotFound() } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["", "wrong-token"])
    fun `rejects requests without a valid internal token`(token: String) {
        val board = createBoard()

        mockMvc.get(accessUrl(board)) { if (token.isNotEmpty()) header(InternalTokenInterceptor.HEADER, token) }
            .andExpect { status { isUnauthorized() } }
        mockMvc.get(accessUrl(board)) { with(owner.session()) }.andExpect { status { isUnauthorized() } }
    }

    private fun accessUrl(board: String) = "/internal/boards/$board/access"

    private fun createBoard(): String {
        val response = mockMvc.post("/api/boards") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Доска"}"""
        }.andExpect { status { isCreated() } }.andReturn().response

        return response.getHeader("Location")!!.substringAfterLast('/')
    }
}
