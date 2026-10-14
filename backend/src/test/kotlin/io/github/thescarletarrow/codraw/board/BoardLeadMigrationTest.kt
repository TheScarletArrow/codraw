package io.github.thescarletarrow.codraw.board

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
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

@Testcontainers
class BoardLeadMigrationTest {
    companion object {
        @Container @JvmStatic val postgres = PostgreSQLContainer("postgres:18-alpine")

        private const val ALICE = "0199a000-0000-7000-8000-000000000001"
        private const val BOB = "0199a000-0000-7000-8000-000000000002"
        private const val CAROL = "0199a000-0000-7000-8000-000000000003"
    }

    private val source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private val jdbc = JdbcClient.create(source)

    @Test
    fun `V34 keeps the lead a member of the board, which ending the membership takes, and U34 reverts it`() {
        // Migrations before V34 come from other changes, so do not assume how many of them there are.
        Flyway.configure().dataSource(source).target("34").load().migrate()
        for ((id, name) in listOf(ALICE to "Alice", BOB to "Bob", CAROL to "Carol")) {
            jdbc.sql("INSERT INTO users(id, provider, provider_user_id, name, created_at) VALUES ('$id', 'github', '$name', '$name', now())")
                .update()
        }
        val board = board()
        member(board, BOB)
        assertFailsWith<DataIntegrityViolationException> { lead(board, CAROL) }

        lead(board, BOB)
        jdbc.sql("DELETE FROM board_members WHERE user_id = '$BOB'").update()
        assertNull(leadOf(board))

        member(board, CAROL)
        lead(board, CAROL)
        jdbc.sql("DELETE FROM users WHERE id = '$CAROL'").update()
        assertNull(leadOf(board))

        member(board, BOB)
        lead(board, BOB)
        jdbc.sql("DELETE FROM boards WHERE id = :id").param("id", board).update()
        assertEquals(0, jdbc.sql("SELECT count(*) FROM board_members").query(Int::class.java).single())

        source.connection.use {
            ScriptUtils.executeSqlScript(it, ClassPathResource("db/migration/U34__claude_affectionate_goldberg_cpghhs_board_lead.sql"))
        }
        assertEquals(
            0,
            jdbc.sql("SELECT count(*) FROM information_schema.columns WHERE table_name = 'boards' AND column_name = 'lead_id'")
                .query(Int::class.java).single(),
        )
        assertEquals(1, Flyway.configure().dataSource(source).target("34").load().migrate().migrationsExecuted)
    }

    private fun board(): UUID = jdbc.sql(
        "INSERT INTO boards(title, owner_id, created_at, updated_at) VALUES ('Платежи', '$ALICE', now(), now()) RETURNING id",
    ).query(UUID::class.java).single()

    private fun member(board: UUID, userId: String) {
        jdbc.sql("INSERT INTO board_members(board_id, user_id, role, created_at) VALUES (:board, '$userId', 'VIEWER', now())")
            .param("board", board)
            .update()
    }

    private fun lead(board: UUID, userId: String) {
        jdbc.sql("UPDATE boards SET lead_id = '$userId' WHERE id = :board").param("board", board).update()
    }

    private fun leadOf(board: UUID): UUID? =
        jdbc.sql("SELECT lead_id FROM boards WHERE id = :board").param("board", board).query(UUID::class.java).list().single()
}
