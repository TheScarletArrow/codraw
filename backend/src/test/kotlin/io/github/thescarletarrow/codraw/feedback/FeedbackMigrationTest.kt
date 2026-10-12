package io.github.thescarletarrow.codraw.feedback

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
class FeedbackMigrationTest {
    companion object {
        @Container @JvmStatic val postgres = PostgreSQLContainer("postgres:18-alpine")

        private const val ALICE = "0199a000-0000-7000-8000-000000000001"
        private const val ADMIN = "0199a000-0000-7000-8000-000000000002"
    }

    private val source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private val jdbc = JdbcClient.create(source)

    @Test
    fun `V31 keeps feedback without its deleted author, lets the journal name it, and U31 reverts it`() {
        // Migrations before V31 come from other changes, so do not assume how many of them there are.
        Flyway.configure().dataSource(source).target("30").load().migrate()
        jdbc.sql(
            """
            INSERT INTO users(id, provider, provider_user_id, name, created_at) VALUES ('$ALICE', 'github', '1', 'Alice', now());
            INSERT INTO users(id, provider, provider_user_id, name, created_at) VALUES ('$ADMIN', 'github', '2', 'Admin', now());
            INSERT INTO admin_actions(admin_id, admin_name, action, target_kind, target_id, target_label, created_at)
            VALUES ('$ADMIN', 'Admin', 'BLOCK_USER', 'USER', '$ALICE', 'Alice', now());
            """,
        ).update()

        Flyway.configure().dataSource(source).target("31").load().migrate()
        jdbc.sql(
            """
            INSERT INTO feedback(user_id, kind, text, page, app_version, user_agent, created_at, resolved_at, resolved_by, resolved_by_name)
            VALUES ('$ALICE', 'BUG', 'Не сохраняется подпись', '/boards/42', '0.43.0', 'Mozilla/5.0', now(), now(), '$ADMIN', 'Admin')
            """,
        ).update()
        jdbc.sql("INSERT INTO feedback(user_id, kind, text, created_at) VALUES ('$ALICE', 'IDEA', 'Тёмная тема', now())").update()
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("INSERT INTO feedback(user_id, kind, text, created_at) VALUES ('$ALICE', 'COMPLAINT', 'x', now())").update()
        }
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("INSERT INTO feedback(user_id, kind, text, created_at) VALUES ('$ALICE', 'OTHER', '', now())").update()
        }
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("INSERT INTO feedback(user_id, kind, text, created_at) VALUES ('$ALICE', 'OTHER', repeat('x', 4001), now())").update()
        }
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("UPDATE feedback SET resolved_at = now() WHERE kind = 'IDEA'").update()
        }
        jdbc.sql(
            """
            INSERT INTO admin_actions(admin_id, admin_name, action, target_kind, target_id, target_label, created_at)
            SELECT '$ADMIN', 'Admin', 'RESOLVE_FEEDBACK', 'FEEDBACK', id, 'Не сохраняется подпись', now() FROM feedback WHERE kind = 'BUG'
            """,
        ).update()
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql(
                """
                INSERT INTO admin_actions(admin_id, admin_name, action, target_kind, target_id, target_label, created_at)
                VALUES ('$ADMIN', 'Admin', 'RESOLVE_FEEDBACK', 'COMMENT', '$ALICE', 'x', now())
                """,
            ).update()
        }
        // Feedback outlives its author and the administrator who closed it, with the name of the administrator.
        jdbc.sql("DELETE FROM users").update()
        assertEquals(2, jdbc.sql("SELECT count(*) FROM feedback WHERE user_id IS NULL AND resolved_by IS NULL").query(Int::class.java).single())
        assertEquals("Admin", jdbc.sql("SELECT resolved_by_name FROM feedback WHERE kind = 'BUG'").query(String::class.java).single())

        source.connection.use {
            ScriptUtils.executeSqlScript(it, ClassPathResource("db/migration/U31__claude_beautiful_wright_pbif75_feedback.sql"))
        }
        assertEquals(0, jdbc.sql("SELECT count(*) FROM information_schema.tables WHERE table_name = 'feedback'").query(Int::class.java).single())
        // The journal keeps its other entries and takes no entries about feedback any more.
        assertEquals(listOf("BLOCK_USER"), jdbc.sql("SELECT action FROM admin_actions").query(String::class.java).list())
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql(
                """
                INSERT INTO admin_actions(admin_id, admin_name, action, target_kind, target_id, target_label, created_at)
                VALUES ('$ADMIN', 'Admin', 'RESOLVE_FEEDBACK', 'USER', '$ALICE', 'Alice', now())
                """,
            ).update()
        }
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql(
                """
                INSERT INTO admin_actions(admin_id, admin_name, action, target_kind, target_id, target_label, created_at)
                VALUES ('$ADMIN', 'Admin', 'BLOCK_USER', 'FEEDBACK', '$ALICE', 'Alice', now())
                """,
            ).update()
        }
        assertEquals(1, Flyway.configure().dataSource(source).target("31").load().migrate().migrationsExecuted)
    }
}
