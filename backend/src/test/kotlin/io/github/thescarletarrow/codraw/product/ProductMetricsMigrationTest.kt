package io.github.thescarletarrow.codraw.product

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
class ProductMetricsMigrationTest {
    companion object {
        @Container @JvmStatic val postgres = PostgreSQLContainer("postgres:18-alpine")

        private const val ALICE = "0199a000-0000-7000-8000-000000000001"
        private const val BOARD = "0199a000-0000-7000-8000-000000000002"
    }

    private val source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private val jdbc = JdbcClient.create(source)

    @Test
    fun `V32 keeps one day per user and board, which goes with them, and counts of a day, and U32 reverts it`() {
        // Migrations before V32 come from other changes, so do not assume how many of them there are.
        Flyway.configure().dataSource(source).target("30").load().migrate()
        jdbc.sql(
            """
            INSERT INTO users(id, provider, provider_user_id, name, created_at) VALUES ('$ALICE', 'github', '1', 'Alice', now());
            INSERT INTO boards(id, title, owner_id, created_at, updated_at) VALUES ('$BOARD', 'Схема', '$ALICE', now(), now());
            """,
        ).update()

        Flyway.configure().dataSource(source).target("32").load().migrate()
        jdbc.sql("INSERT INTO user_activity_days(user_id, day) VALUES ('$ALICE', '2026-10-11'), ('$ALICE', '2026-10-12')").update()
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("INSERT INTO user_activity_days(user_id, day) VALUES ('$ALICE', '2026-10-12')").update()
        }
        jdbc.sql("INSERT INTO board_activity_days(board_id, day) VALUES ('$BOARD', '2026-10-12')").update()
        assertEquals(false, jdbc.sql("SELECT co_edited FROM board_activity_days").query(Boolean::class.java).single())
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("INSERT INTO board_activity_days(board_id, day) VALUES ('$BOARD', '2026-10-12')").update()
        }
        jdbc.sql("INSERT INTO product_daily_counts(day, kind, count) VALUES ('2026-10-12', 'GUEST_CONVERSION', 1)").update()
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("INSERT INTO product_daily_counts(day, kind, count) VALUES ('2026-10-12', 'CLICKS', 1)").update()
        }
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("UPDATE product_daily_counts SET count = -1").update()
        }

        // The days go with the board and the user; the counts of a day name nobody and stay.
        jdbc.sql("DELETE FROM boards").update()
        assertEquals(0, jdbc.sql("SELECT count(*) FROM board_activity_days").query(Int::class.java).single())
        jdbc.sql("DELETE FROM users").update()
        assertEquals(0, jdbc.sql("SELECT count(*) FROM user_activity_days").query(Int::class.java).single())
        assertEquals(1, jdbc.sql("SELECT count(*) FROM product_daily_counts").query(Int::class.java).single())

        source.connection.use {
            ScriptUtils.executeSqlScript(it, ClassPathResource("db/migration/U32__claude_beautiful_wright_pbif75_product_metrics.sql"))
        }
        assertEquals(
            0,
            jdbc.sql(
                """
                SELECT count(*) FROM information_schema.tables
                WHERE table_name IN ('user_activity_days', 'board_activity_days', 'product_daily_counts')
                """,
            ).query(Int::class.java).single(),
        )
        assertEquals(1, Flyway.configure().dataSource(source).target("32").load().migrate().migrationsExecuted)
    }
}
