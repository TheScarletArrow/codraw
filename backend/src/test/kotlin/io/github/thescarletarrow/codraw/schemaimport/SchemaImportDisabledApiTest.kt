package io.github.thescarletarrow.codraw.schemaimport

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.UserService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

/** The installation as it comes: no host of a database is allowed. */
@IntegrationTest
class SchemaImportDisabledApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val users: UserService,
) {

    @Test
    fun `is not there until the administrator allows hosts of databases`() {
        val alice = users.gitHubUser("Alice")

        mockMvc.get(SchemaImportController.PATH) { with(alice.session()) }.andExpect { status { isNotFound() } }
        mockMvc.post(SchemaImportController.PATH) {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"host": "localhost", "database": "codraw", "user": "codraw", "password": "codraw"}"""
        }.andExpect { status { isNotFound() } }
        mockMvc.get("/api/legal").andExpect { jsonPath("$.schemaImport") { value(false) } }
    }
}
