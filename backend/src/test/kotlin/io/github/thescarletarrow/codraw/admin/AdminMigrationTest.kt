package io.github.thescarletarrow.codraw.admin

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.springframework.core.io.ClassPathResource
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.init.ScriptUtils
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

@Testcontainers
class AdminMigrationTest {
    companion object {
        @Container @JvmStatic val postgres = PostgreSQLContainer("postgres:18-alpine")

        private const val ALICE = "0199a000-0000-7000-8000-000000000001"
        private const val BOARD = "0199a000-0000-7000-8000-000000000002"
    }

    private val source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private val jdbc = JdbcClient.create(source)

    @Test
    fun `V29 leaves users unblocked and boards open, keeps reports with their boards, and U29 reverts it`() {
        // Migrations before V29 come from other changes, so do not assume how many of them there are.
        Flyway.configure().dataSource(source).target("28").load().migrate()
        jdbc.sql(
            """
            INSERT INTO users(id, provider, provider_user_id, name, created_at) VALUES ('$ALICE', 'github', '1', 'Alice', now());
            INSERT INTO boards(id, title, owner_id, created_at, updated_at, link_access) VALUES ('$BOARD', 'Публичная', '$ALICE', now(), now(), 'PUBLIC');
            """,
        ).update()

        Flyway.configure().dataSource(source).target("29").load().migrate()
        assertEquals(true, jdbc.sql("SELECT blocked_at IS NULL FROM users").query(Boolean::class.java).single())
        assertEquals(true, jdbc.sql("SELECT sharing_blocked_at IS NULL AND link_access = 'PUBLIC' FROM boards").query(Boolean::class.java).single())

        jdbc.sql("INSERT INTO board_reports(board_id, reason, reporter_id, created_at) VALUES ('$BOARD', 'SPAM', '$ALICE', now())").update()
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("INSERT INTO board_reports(board_id, reason, created_at) VALUES ('$BOARD', 'BORING', now())").update()
        }
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("UPDATE board_reports SET resolved_at = now()").update()
        }
        jdbc.sql(
            """
            INSERT INTO admin_actions(admin_id, admin_name, action, target_kind, target_id, target_label, created_at)
            VALUES ('$ALICE', 'Alice', 'BLOCK_USER', 'USER', '$ALICE', 'Alice', now())
            """,
        ).update()
        // The journal outlives its administrator and its target; a report goes with its board, its sender stays unknown.
        jdbc.sql("DELETE FROM boards").update()
        jdbc.sql("DELETE FROM users").update()
        assertEquals(0, jdbc.sql("SELECT count(*) FROM board_reports").query(Int::class.java).single())
        assertEquals(1, jdbc.sql("SELECT count(*) FROM admin_actions").query(Int::class.java).single())

        source.connection.use {
            ScriptUtils.executeSqlScript(it, ClassPathResource("db/migration/U29__claude_admin_moderation_162.sql"))
        }
        assertEquals(0, jdbc.sql("SELECT count(*) FROM information_schema.tables WHERE table_name IN ('board_reports', 'admin_actions')").query(Int::class.java).single())
        assertEquals(1, Flyway.configure().dataSource(source).target("29").load().migrate().migrationsExecuted)
    }
}
