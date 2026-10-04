package io.github.thescarletarrow.codraw

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.core.io.ClassPathResource
import org.springframework.jdbc.core.simple.JdbcClient
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

        private val boardSyncTables = setOf("boards", "board_documents")
        private val userAuthTables = boardSyncTables + setOf("users", "spring_session", "spring_session_attributes")
    }

    private val dataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private val jdbcClient = JdbcClient.create(dataSource)

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public").update()
    }

    @Test
    fun `V1 and V2 create tables on an empty database and U2, U1 revert them`() {
        assertEquals(2, flyway().migrate().migrationsExecuted)
        assertEquals(userAuthTables, appTables())

        revert("U2__claude_relaxed_euler_o3h2ky.sql")
        assertEquals(boardSyncTables, appTables())
        assertEquals(setOf("id", "title", "created_at", "updated_at"), boardColumns())

        revert("U1__claude_relaxed_euler_o3h2ky.sql")
        assertEquals(emptySet(), appTables())

        assertEquals(2, flyway().migrate().migrationsExecuted)
        assertEquals(userAuthTables, appTables())
    }

    @Test
    fun `V2 deletes boards of add-board-sync, which have no owner, and requires an owner`() {
        flyway("1").migrate()
        jdbcClient.sql(
            """
            INSERT INTO boards (id, title, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Без владельца', now(), now())
            """,
        ).update()
        jdbcClient.sql(
            "INSERT INTO board_documents (board_id, state, updated_at) VALUES ('0199a000-0000-7000-8000-000000000001', '\\x01', now())",
        ).update()

        assertEquals(1, flyway().migrate().migrationsExecuted)

        assertEquals(0, count("boards"))
        assertEquals(0, count("board_documents"))
        val ownerNullable = jdbcClient.sql(
            "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'boards' AND column_name = 'owner_id'",
        ).query(String::class.java).single()
        assertEquals("NO", ownerNullable)
    }

    private fun flyway(target: String = "latest") =
        Flyway.configure().dataSource(dataSource).target(target).load()

    private fun revert(script: String) = dataSource.connection.use {
        ScriptUtils.executeSqlScript(it, ClassPathResource("db/migration/$script"))
    }

    private fun count(table: String) = jdbcClient.sql("SELECT count(*) FROM $table").query(Int::class.java).single()

    private fun boardColumns(): Set<String> = jdbcClient.sql(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'boards'",
    ).query(String::class.java).list().filterNotNull().toSet()

    private fun appTables(): Set<String> = jdbcClient.sql(
        "SELECT table_name FROM information_schema.tables " +
            "WHERE table_schema = 'public' AND table_name <> 'flyway_schema_history'",
    ).query(String::class.java).list().filterNotNull().toSet()
}
