package io.github.thescarletarrow.codraw.password

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
class PasswordMigrationTest {
    companion object {
        @Container @JvmStatic val postgres = PostgreSQLContainer("postgres:18-alpine")

        private const val ALICE = "0199a000-0000-7000-8000-000000000001"
    }

    private val source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private val jdbc = JdbcClient.create(source)

    @Test
    fun `V33 keeps one hash per user, which goes with the user, and U33 reverts it`() {
        // Migrations before V33 come from other changes, so do not assume how many of them there are.
        Flyway.configure().dataSource(source).target("33").load().migrate()
        jdbc.sql(
            "INSERT INTO users(id, provider, provider_user_id, name, created_at) VALUES ('$ALICE', 'password', 'alice', 'Alice', now())",
        ).update()
        jdbc.sql("INSERT INTO password_credentials(user_id, password_hash, changed_at) VALUES ('$ALICE', '{bcrypt}1', now())").update()
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("INSERT INTO password_credentials(user_id, password_hash, changed_at) VALUES ('$ALICE', '{bcrypt}2', now())")
                .update()
        }

        jdbc.sql("DELETE FROM users").update()
        assertEquals(0, jdbc.sql("SELECT count(*) FROM password_credentials").query(Int::class.java).single())

        source.connection.use {
            ScriptUtils.executeSqlScript(it, ClassPathResource("db/migration/U33__claude_affectionate_goldberg_cpghhs_password_sign_in.sql"))
        }
        assertEquals(
            0,
            jdbc.sql("SELECT count(*) FROM information_schema.tables WHERE table_name = 'password_credentials'")
                .query(Int::class.java).single(),
        )
        assertEquals(1, Flyway.configure().dataSource(source).target("33").load().migrate().migrationsExecuted)
    }
}
