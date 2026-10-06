package io.github.thescarletarrow.codraw

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.BeforeEach
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
class MigrationsTest {

    companion object {
        @Container
        @JvmStatic
        val postgres = PostgreSQLContainer("postgres:18-alpine")

        private val boardSyncTables = setOf("boards", "board_documents")
        private val userAuthTables = boardSyncTables + setOf("users", "spring_session", "spring_session_attributes")
        private val boardManagementTables = userAuthTables + "board_visits"
        private val boardVersionsTables = boardManagementTables + "board_versions"
        private val commentsTables = boardVersionsTables + setOf("comment_threads", "comments", "comment_mentions")
        private val embedTables = commentsTables + "board_embeds"
        private val membersTables = embedTables + setOf("board_members", "board_invites")
    }

    private val dataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private val jdbcClient = JdbcClient.create(dataSource)

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public").update()
    }

    @Test
    fun `V1 to V8 create tables on an empty database and U8, U7, U6, U5, U4, U3, U2, U1 revert them`() {
        assertEquals(8, flyway().migrate().migrationsExecuted)
        assertEquals(membersTables, appTables())
        assertEquals(setOf("id", "title", "owner_id", "created_at", "updated_at", "link_access"), boardColumns())

        revert("U8__claude_epic_lovelace_pwi6v4_board_members.sql")
        assertEquals(embedTables, appTables())

        revert("U7__claude_affectionate_euler_ktyog4_board_embed.sql")
        assertEquals(commentsTables, appTables())

        revert("U6__claude_affectionate_euler_ktyog4_comments.sql")
        assertEquals(boardVersionsTables, appTables())

        revert("U5__claude_bold_cannon_6zvbpn.sql")
        assertEquals(boardManagementTables, appTables())

        revert("U4__claude_bold_cannon_6zvbpn.sql")
        assertEquals(setOf("id", "title", "owner_id", "created_at", "updated_at"), boardColumns())

        revert("U3__claude_focused_cori_b96u4j.sql")
        assertEquals(userAuthTables, appTables())

        revert("U2__claude_relaxed_euler_o3h2ky.sql")
        assertEquals(boardSyncTables, appTables())
        assertEquals(setOf("id", "title", "created_at", "updated_at"), boardColumns())

        revert("U1__claude_relaxed_euler_o3h2ky.sql")
        assertEquals(emptySet(), appTables())

        assertEquals(8, flyway().migrate().migrationsExecuted)
        assertEquals(membersTables, appTables())
    }

    @Test
    fun `V2 deletes boards of add-board-sync, which have no owner, and requires an owner`() {
        flyway("1").migrate()
        jdbcClient.sql(
            """
            INSERT INTO boards (id, title, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Без владельца', now(), now())
            """,
        ).update()
        jdbcClient.sql(
            "INSERT INTO board_documents (board_id, state, updated_at) VALUES ('0199a000-0000-7000-8000-000000000001', '\\x01', now())",
        ).update()

        assertEquals(1, flyway("2").migrate().migrationsExecuted)

        assertEquals(0, count("boards"))
        assertEquals(0, count("board_documents"))
        val ownerNullable = jdbcClient.sql(
            "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'boards' AND column_name = 'owner_id'",
        ).query(String::class.java).single()
        assertEquals("NO", ownerNullable)
    }

    @Test
    fun `V3 adds the visits to a database with boards, and they go with their board`() {
        flyway("2").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now()),
                   ('0199a000-0000-7000-8000-0000000000b1', 'github', '2', 'Bob', now())
            """,
        ).update()
        jdbcClient.sql(
            """
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now())
            """,
        ).update()

        assertEquals(1, flyway("3").migrate().migrationsExecuted)
        jdbcClient.sql(
            """
            INSERT INTO board_visits (user_id, board_id, visited_at)
            VALUES ('0199a000-0000-7000-8000-0000000000b1', '0199a000-0000-7000-8000-000000000001', now())
            """,
        ).update()
        jdbcClient.sql("DELETE FROM boards").update()

        assertEquals(0, count("board_visits"))
    }

    @Test
    fun `V6 keeps the comments of a user who is gone and drops the comments of a deleted board`() {
        flyway("6").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now()),
                   ('0199a000-0000-7000-8000-0000000000b1', 'guest', '2', 'Гость 1', now())
            """,
        ).update()
        jdbcClient.sql(
            """
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now())
            """,
        ).update()
        jdbcClient.sql(
            """
            INSERT INTO comment_threads (id, board_id, page_id, cell_id, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000c1', '0199a000-0000-7000-8000-000000000001', 'page-1', 'cell-1', now());
            INSERT INTO comments (thread_id, author_id, body, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000c1', '0199a000-0000-7000-8000-0000000000b1', 'Почему без кэша?', now())
            """,
        ).update()

        jdbcClient.sql("DELETE FROM users WHERE id = '0199a000-0000-7000-8000-0000000000b1'").update()
        assertEquals(1, count("comments"))
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql("UPDATE comments SET body = ''").update()
        }

        jdbcClient.sql("DELETE FROM boards").update()
        assertEquals(0, count("comment_threads"))
        assertEquals(0, count("comments"))
    }

    @Test
    fun `V7 keeps one live image per board with a unique token and drops it with its board`() {
        flyway("7").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now());
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now()),
                   ('0199a000-0000-7000-8000-000000000002', 'Другая', '0199a000-0000-7000-8000-0000000000a1', now(), now());
            INSERT INTO board_embeds (board_id, token, page_id, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA', 'page-1', now())
            """,
        ).update()

        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql(
                """
                INSERT INTO board_embeds (board_id, token, page_id, created_at)
                VALUES ('0199a000-0000-7000-8000-000000000002', 'AAAAAAAAAAAAAAAAAAAAAA', 'page-1', now())
                """,
            ).update()
        }
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql("UPDATE board_embeds SET token = 'short'").update()
        }

        jdbcClient.sql("DELETE FROM boards").update()
        assertEquals(0, count("board_embeds"))
    }

    @Test
    fun `V8 keeps members with known roles and unique invitation tokens, which go with their board and their user`() {
        flyway("8").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now()),
                   ('0199a000-0000-7000-8000-0000000000b1', 'guest', '2', 'Гость 1', now()),
                   ('0199a000-0000-7000-8000-0000000000c1', 'github', '3', 'Carol', now());
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now());
            INSERT INTO board_members (board_id, user_id, role, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', '0199a000-0000-7000-8000-0000000000b1', 'EDITOR', now()),
                   ('0199a000-0000-7000-8000-000000000001', '0199a000-0000-7000-8000-0000000000c1', 'VIEWER', now());
            INSERT INTO board_invites (board_id, token, role, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA', 'EDITOR', now())
            """,
        ).update()

        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql("UPDATE board_members SET role = 'OWNER'").update()
        }
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql(
                """
                INSERT INTO board_invites (board_id, token, role, created_at)
                VALUES ('0199a000-0000-7000-8000-000000000001', 'AAAAAAAAAAAAAAAAAAAAAA', 'VIEWER', now())
                """,
            ).update()
        }

        jdbcClient.sql("DELETE FROM users WHERE id = '0199a000-0000-7000-8000-0000000000b1'").update()
        assertEquals(1, count("board_members"))

        jdbcClient.sql("DELETE FROM boards").update()
        assertEquals(0, count("board_members"))
        assertEquals(0, count("board_invites"))
    }

    @Test
    fun `V4 keeps existing boards editable through their links and accepts only known link access`() {
        flyway("3").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now())
            """,
        ).update()
        jdbcClient.sql(
            """
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now())
            """,
        ).update()

        assertEquals(1, flyway("4").migrate().migrationsExecuted)

        assertEquals("EDIT", jdbcClient.sql("SELECT link_access FROM boards").query(String::class.java).single())
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql("UPDATE boards SET link_access = 'PUBLIC'").update()
        }
    }

    private fun flyway(target: String = "latest") =
        Flyway.configure().dataSource(dataSource).target(target).load()

    private fun revert(script: String) = dataSource.connection.use {
        ScriptUtils.executeSqlScript(it, ClassPathResource("db/migration/$script"))
    }

    private fun count(table: String) = jdbcClient.sql("SELECT count(*) FROM $table").query(Int::class.java).single()

    private fun boardColumns(): Set<String> = jdbcClient.sql(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'boards'",
    ).query(String::class.java).list().filterNotNull().toSet()

    private fun appTables(): Set<String> = jdbcClient.sql(
        "SELECT table_name FROM information_schema.tables " +
            "WHERE table_schema = 'public' AND table_name <> 'flyway_schema_history'",
    ).query(String::class.java).list().filterNotNull().toSet()
}
