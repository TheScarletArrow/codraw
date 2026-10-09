package io.github.thescarletarrow.codraw.template

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
class PersonalTemplateMigrationTest {
    companion object {
        @Container @JvmStatic val postgres = PostgreSQLContainer("postgres:18-alpine")
    }

    @Test
    fun `personal template migration undo and reapply preserve existing boards`() {
        val source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        val jdbc = JdbcClient.create(source)
        Flyway.configure().dataSource(source).target("23").load().migrate()
        jdbc.sql("""
            INSERT INTO users(id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'github', '1', 'Alice', now());
            INSERT INTO boards(title, owner_id, created_at, updated_at)
            VALUES ('Схема', '0199a000-0000-7000-8000-000000000001', now(), now());
        """).update()
        // Migrations before V24 come from other changes, so do not assume how many of them there are.
        Flyway.configure().dataSource(source).target("24").load().migrate()
        jdbc.sql("""
            INSERT INTO personal_templates(owner_id, title, description, drawio, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Шаблон', '', '<mxfile><diagram/></mxfile>', now(), now())
        """).update()
        assertEquals(1, jdbc.sql("SELECT count(*) FROM personal_templates").query(Int::class.java).single())
        source.connection.use { ScriptUtils.executeSqlScript(it, ClassPathResource("db/migration/U24__personal_templates.sql")) }
        assertEquals(1, jdbc.sql("SELECT count(*) FROM boards").query(Int::class.java).single())
        assertEquals(1, Flyway.configure().dataSource(source).target("24").load().migrate().migrationsExecuted)
        assertEquals(0, jdbc.sql("SELECT count(*) FROM personal_templates").query(Int::class.java).single())
    }
}
