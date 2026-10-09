package io.github.thescarletarrow.codraw.issue

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
class IssueLinkMigrationTest {

    companion object {
        @Container
        @JvmStatic
        val postgres = PostgreSQLContainer("postgres:18-alpine")

        const val ALICE = "0199a000-0000-7000-8000-0000000000a1"
        const val BOB = "0199a000-0000-7000-8000-0000000000b1"
        const val BOARD = "0199a000-0000-7000-8000-000000000001"
        const val THREAD = "0199a000-0000-7000-8000-0000000000c1"
    }

    private val dataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private val jdbc = JdbcClient.create(dataSource)

    @Test
    fun `V25 keeps one connection per user and tracker, links of an element or a thread once, and U25 reverts it`() {
        flyway("24").migrate()
        jdbc.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('$ALICE', 'github', '1', 'Alice', now()), ('$BOB', 'github', '2', 'Bob', now());
            INSERT INTO boards (id, title, owner_id, created_at, updated_at) VALUES ('$BOARD', 'Доска', '$ALICE', now(), now());
            INSERT INTO comment_threads (id, board_id, page_id, cell_id, created_at) VALUES ('$THREAD', '$BOARD', 'page-1', 'api', now());
            """,
        ).update()
        // Migrations before V25 come from other changes, so do not assume how many of them there are.
        assertEquals(1, flyway("25").migrate().migrationsExecuted)

        val connect = { user: String, tracker: String ->
            jdbc.sql("INSERT INTO issue_tracker_connections (user_id, tracker, token, login, created_at) VALUES (:user::uuid, :tracker, 'token', 'login', now())")
                .param("user", user)
                .param("tracker", tracker)
                .update()
        }
        connect(ALICE, "GITHUB")
        connect(BOB, "GITHUB")
        assertFailsWith<DataIntegrityViolationException> { connect(ALICE, "GITHUB") }
        assertFailsWith<DataIntegrityViolationException> { connect(BOB, "JIRA") }

        val link = { page: String?, cell: String?, thread: String?, externalId: Long ->
            jdbc.sql(
                """
                INSERT INTO issue_links (board_id, page_id, cell_id, thread_id, tracker, external_id, repository, number, title,
                                         state, url, private, issue_updated_at, sync_status, synced_at, linked_by,
                                         created_here, created_at)
                VALUES ('$BOARD', :page, :cell, :thread::uuid, 'GITHUB', :externalId, 'acme/shop', 12, 'Кэш', 'OPEN',
                        'https://github.com/acme/shop/issues/12', false, now(), 'OK', now(), '$ALICE', false, now())
                RETURNING id
                """,
            )
                .param("page", page)
                .param("cell", cell)
                .param("thread", thread)
                .param("externalId", externalId)
                .query(String::class.java)
                .single()
        }
        val linkId = link("page-1", "api", null, 1)
        link(null, null, THREAD, 1)
        link("page-1", "db", null, 1)
        // The same issue on the same element or thread once; an element and a thread never together, never neither.
        assertFailsWith<DataIntegrityViolationException> { link("page-1", "api", null, 1) }
        assertFailsWith<DataIntegrityViolationException> { link(null, null, THREAD, 1) }
        assertFailsWith<DataIntegrityViolationException> { link("page-1", "api", THREAD, 2) }
        assertFailsWith<DataIntegrityViolationException> { link("page-1", null, null, 2) }
        assertFailsWith<DataIntegrityViolationException> { link(null, null, null, 2) }
        assertFailsWith<DataIntegrityViolationException> {
            jdbc.sql("UPDATE issue_links SET sync_status = 'DISCONNECTED' WHERE id = :id::uuid").param("id", linkId).update()
        }
        jdbc.sql("INSERT INTO issue_creations (user_id, request_id, link_id, created_at) VALUES ('$ALICE', gen_random_uuid(), :link::uuid, now())")
            .param("link", linkId)
            .update()

        // The thread goes with its links; the user who linked goes, and the links stay without them; the link goes with
        // its request; the board goes with the rest.
        jdbc.sql("DELETE FROM comment_threads").update()
        assertEquals(2, count("issue_links"))
        jdbc.sql("UPDATE issue_links SET linked_by = '$BOB' WHERE cell_id = 'db'").update()
        jdbc.sql("DELETE FROM users WHERE id = '$BOB'").update()
        assertEquals(1, count("issue_tracker_connections"))
        assertEquals(1, count("issue_links WHERE cell_id = 'db' AND linked_by IS NULL"))
        jdbc.sql("DELETE FROM issue_links WHERE id = :id::uuid").param("id", linkId).update()
        assertEquals(0, count("issue_creations"))
        jdbc.sql("DELETE FROM boards").update()
        assertEquals(0, count("issue_links"))

        dataSource.connection.use {
            ScriptUtils.executeSqlScript(it, ClassPathResource("db/migration/U25__claude_charming_knuth_m9hg6v_issue_links.sql"))
        }
        assertEquals(1, count("users WHERE id = '$ALICE'"))
        assertEquals(1, flyway("25").migrate().migrationsExecuted)
        assertEquals(0, count("issue_tracker_connections"))
    }

    private fun flyway(target: String) = Flyway.configure().dataSource(dataSource).target(target).load()

    private fun count(table: String) = jdbc.sql("SELECT count(*) FROM $table").query(Int::class.java).single()
}
