package io.github.thescarletarrow.codraw.user

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
class UserLanguageMigrationTest {
    companion object {
        @Container @JvmStatic val postgres = PostgreSQLContainer("postgres:18-alpine")
    }

    private val source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private val jdbc = JdbcClient.create(source)

    @Test
    fun `users speak Russian through V28 and may speak English, and U28 forgets the languages`() {
        // Migrations before V28 come from other changes, so do not assume how many of them there are.
        Flyway.configure().dataSource(source).target("27").load().migrate()
        jdbc.sql("INSERT INTO users(provider, provider_user_id, name, created_at) VALUES ('github', '1', 'Alice', now())").update()

        Flyway.configure().dataSource(source).target("28").load().migrate()
        assertEquals("RU", jdbc.sql("SELECT language FROM users").query(String::class.java).single())
        jdbc.sql("UPDATE users SET language = 'EN'").update()
        assertFailsWith<DataIntegrityViolationException> { jdbc.sql("UPDATE users SET language = 'de'").update() }

        source.connection.use {
            ScriptUtils.executeSqlScript(it, ClassPathResource("db/migration/U28__claude_i18n_english_ui_user_language.sql"))
        }
        assertEquals(1, jdbc.sql("SELECT count(*) FROM users").query(Int::class.java).single())
        assertEquals(1, Flyway.configure().dataSource(source).target("28").load().migrate().migrationsExecuted)
    }
}
