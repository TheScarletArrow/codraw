package io.github.thescarletarrow.codraw.board

import org.flywaydb.core.Flyway
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
class BoardTrashMigrationTest {
    companion object {
        @Container @JvmStatic val postgres = PostgreSQLContainer("postgres:18-alpine")
    }

    @Test
    fun `trash migration and undo preserve existing board data`() {
        val source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        val jdbc = JdbcClient.create(source)
        Flyway.configure().dataSource(source).target("19").load().migrate()
        jdbc.sql("""
            INSERT INTO users(id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'github', '1', 'Alice', now());
            INSERT INTO boards(id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000002', 'Схема', '0199a000-0000-7000-8000-000000000001', now(), now());
            INSERT INTO board_documents(board_id, state, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000002', '\x010203', now());
        """).update()
        assertEquals(1, Flyway.configure().dataSource(source).target("20").load().migrate().migrationsExecuted)
        assertEquals(1, jdbc.sql("SELECT count(*) FROM boards WHERE deleted_at IS NULL").query(Int::class.java).single())
        jdbc.sql("UPDATE boards SET deleted_at = now()").update()
        source.connection.use { ScriptUtils.executeSqlScript(it, ClassPathResource("db/migration/U20__board_trash.sql")) }
        assertEquals(1, jdbc.sql("SELECT count(*) FROM board_documents WHERE state = decode('010203', 'hex')").query(Int::class.java).single())
        assertEquals(1, Flyway.configure().dataSource(source).target("20").load().migrate().migrationsExecuted)
        assertEquals(1, jdbc.sql("SELECT count(*) FROM boards WHERE deleted_at IS NULL").query(Int::class.java).single())
    }
}
