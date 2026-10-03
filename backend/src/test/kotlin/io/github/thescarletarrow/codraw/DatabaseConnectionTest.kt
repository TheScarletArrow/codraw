package io.github.thescarletarrow.codraw

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient
import kotlin.test.assertTrue

@IntegrationTest
class DatabaseConnectionTest(@Autowired private val jdbcClient: JdbcClient) {

    @Test
    fun `connects to PostgreSQL 18`() {
        val version = jdbcClient.sql("SHOW server_version").query(String::class.java).single()

        assertTrue(version.startsWith("18."), "Unexpected PostgreSQL version: $version")
    }
}
