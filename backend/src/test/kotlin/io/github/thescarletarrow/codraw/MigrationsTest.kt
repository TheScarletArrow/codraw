package io.github.thescarletarrow.codraw

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.springframework.core.io.ClassPathResource
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.init.ScriptUtils
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import kotlin.test.assertEquals

@Testcontainers
class MigrationsTest {

    companion object {
        @Container
        @JvmStatic
        val postgres = PostgreSQLContainer("postgres:18-alpine")
    }

    private val dataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private val flyway = Flyway.configure().dataSource(dataSource).load()

    @Test
    fun `V1 creates tables on an empty database and U1 reverts it`() {
        assertEquals(1, flyway.migrate().migrationsExecuted)
        assertEquals(setOf("boards", "board_documents"), appTables())

        dataSource.connection.use {
            ScriptUtils.executeSqlScript(it, ClassPathResource("db/migration/U1__claude_relaxed_euler_o3h2ky.sql"))
        }
        assertEquals(emptySet(), appTables())

        assertEquals(1, flyway.migrate().migrationsExecuted)
        assertEquals(setOf("boards", "board_documents"), appTables())
    }

    private fun appTables(): Set<String> = dataSource.connection.use { connection ->
        connection.createStatement().executeQuery(
            "SELECT table_name FROM information_schema.tables " +
                "WHERE table_schema = 'public' AND table_name <> 'flyway_schema_history'",
        ).use { rows -> generateSequence { if (rows.next()) rows.getString(1) else null }.toSet() }
    }
}
