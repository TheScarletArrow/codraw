package io.github.thescarletarrow.codraw.workspace

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
class WorkspaceMigrationTest {
    companion object {
        @Container @JvmStatic val postgres = PostgreSQLContainer("postgres:18-alpine")

        private const val ALICE = "0199a000-0000-7000-8000-000000000001"
        private const val WORKSPACE = "0199a000-0000-7000-8000-000000000002"
        private const val PROJECT = "0199a000-0000-7000-8000-000000000003"
    }

    private val source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private val jdbc = JdbcClient.create(source)

    @Test
    fun `boards stay personal through V25, deleting a project keeps its boards, and U25 keeps all boards`() {
        Flyway.configure().dataSource(source).target("24").load().migrate()
        jdbc.sql(
            """
            INSERT INTO users(id, provider, provider_user_id, name, created_at) VALUES ('$ALICE', 'github', '1', 'Alice', now());
            INSERT INTO boards(title, owner_id, created_at, updated_at) VALUES ('Личная', '$ALICE', now(), now());
            """,
        ).update()
        // Migrations before V25 come from other changes, so do not assume how many of them there are.
        Flyway.configure().dataSource(source).target("25").load().migrate()
        assertEquals(true, jdbc.sql("SELECT workspace_id IS NULL FROM boards").query(Boolean::class.java).single())
        assertEquals("EDIT", jdbc.sql("SELECT workspace_access FROM boards").query(String::class.java).single())

        jdbc.sql(
            """
            INSERT INTO workspaces(id, name, created_at) VALUES ('$WORKSPACE', 'Платформа', now());
            INSERT INTO workspace_members(workspace_id, user_id, role, created_at) VALUES ('$WORKSPACE', '$ALICE', 'OWNER', now());
            INSERT INTO workspace_projects(id, workspace_id, name, created_at) VALUES ('$PROJECT', '$WORKSPACE', 'Платежи', now());
            INSERT INTO boards(title, owner_id, created_at, updated_at, workspace_id, project_id)
            VALUES ('Командная', '$ALICE', now(), now(), '$WORKSPACE', '$PROJECT');
            """,
        ).update()
        // A project belongs to the workspace of its boards, and a personal board has none.
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("UPDATE boards SET project_id = '$PROJECT' WHERE title = 'Личная'").update()
        }
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("INSERT INTO workspace_invites(workspace_id, token, role, created_at) VALUES ('$WORKSPACE', 't', 'OWNER', now())")
                .update()
        }
        jdbc.sql("DELETE FROM workspace_projects WHERE id = '$PROJECT'").update()
        assertEquals(
            WORKSPACE,
            jdbc.sql("SELECT workspace_id::text FROM boards WHERE title = 'Командная' AND project_id IS NULL").query(String::class.java).single(),
        )

        source.connection.use {
            ScriptUtils.executeSqlScript(it, ClassPathResource("db/migration/U25__claude_admiring_euler_lmzooy_team_workspaces.sql"))
        }
        assertEquals(2, jdbc.sql("SELECT count(*) FROM boards").query(Int::class.java).single())
        assertEquals(1, Flyway.configure().dataSource(source).target("25").load().migrate().migrationsExecuted)
        assertEquals(0, jdbc.sql("SELECT count(*) FROM workspaces").query(Int::class.java).single())
    }
}
