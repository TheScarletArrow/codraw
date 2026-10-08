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
        private val accessRequestsTables = membersTables + "board_access_requests"
        private val notificationsTables = accessRequestsTables + "notifications"
        private val reactionsTables = notificationsTables + "comment_reactions"
        private val threadColumns = setOf("id", "board_id", "page_id", "cell_id", "resolved_at", "resolved_by", "created_at")
        private val pointThreadColumns = threadColumns + setOf("x", "y")
        private val notificationColumns =
            setOf("id", "user_id", "kind", "board_id", "comment_id", "actor_id", "role", "created_at", "read_at")
        private val versionAuthorsColumns = setOf("id", "board_id", "state", "reason", "created_at", "authors", "name")
        private val readsTables = reactionsTables + "board_reads"
        private val proposalsTables = readsTables + "proposals"
        private val organizationTables = proposalsTables + setOf("board_folders", "board_tags", "board_placements")
        private val documentColumns = setOf("board_id", "state", "updated_at", "editors")
        private val reviewRequestNotificationColumns =
            notificationColumns + setOf("thread_id", "proposal_id", "page_id", "cell_id")
        private val imagesTables = organizationTables + "board_images"
    }

    private val dataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private val jdbcClient = JdbcClient.create(dataSource)

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public").update()
    }

    @Test
    fun `V1 to V20 create tables and their undo scripts revert them`() {
        assertEquals(19, flyway().migrate().migrationsExecuted)
        assertEquals(imagesTables, appTables())
        assertEquals(
            setOf("id", "board_id", "sha256", "content_type", "size", "width", "height", "created_at"),
            columns("board_images"),
        )
        assertEquals(documentColumns + "search_text", columns("board_documents"))
        assertEquals(reviewRequestNotificationColumns, columns("notifications"))

        assertEquals(setOf("id", "title", "owner_id", "created_at", "updated_at", "link_access", "deleted_at"), boardColumns())
        revert("U20__board_trash.sql")
        revert("U19__claude_eager_tesla_oz6ry8_canvas_images.sql")
        assertEquals(organizationTables, appTables())

        revert("U18__claude_relaxed_euler_o3h2ky_element_status.sql")
        assertEquals(organizationTables, appTables())
        assertEquals(notificationColumns + setOf("thread_id", "proposal_id"), columns("notifications"))

        revert("U17__claude_relaxed_euler_o3h2ky_board_organization.sql")
        assertEquals(proposalsTables, appTables())
        assertEquals(setOf("id", "title", "owner_id", "created_at", "updated_at", "link_access"), boardColumns())
        assertEquals(pointThreadColumns + "assignee_id", columns("comment_threads"))
        assertEquals(notificationColumns + setOf("thread_id", "proposal_id"), columns("notifications"))
        assertEquals(versionAuthorsColumns, columns("board_versions"))
        assertEquals(documentColumns, columns("board_documents"))
        assertEquals(setOf("user_id", "board_id", "seen_at", "previous_seen_at", "present"), columns("board_reads"))

        revert("U15__claude_epic_lovelace_pwi6v4_change_proposals.sql")
        assertEquals(readsTables, appTables())
        assertEquals(notificationColumns + "thread_id", columns("notifications"))

        revert("U14__claude_epic_lovelace_pwi6v4_changes_since_visit.sql")
        assertEquals(reactionsTables, appTables())

        revert("U13__claude_epic_lovelace_pwi6v4_version_authors.sql")
        assertEquals(reactionsTables, appTables())
        assertEquals(setOf("id", "board_id", "state", "reason", "created_at"), columns("board_versions"))
        assertEquals(setOf("board_id", "state", "updated_at"), columns("board_documents"))

        revert("U12__claude_epic_lovelace_pwi6v4_comment_reactions_and_assignees.sql")
        assertEquals(notificationsTables, appTables())
        assertEquals(pointThreadColumns, columns("comment_threads"))
        assertEquals(notificationColumns, columns("notifications"))

        revert("U11__claude_epic_lovelace_pwi6v4_point_comments.sql")
        assertEquals(threadColumns, columns("comment_threads"))

        revert("U10__claude_epic_lovelace_pwi6v4_notifications.sql")
        assertEquals(accessRequestsTables, appTables())

        revert("U9__claude_epic_lovelace_pwi6v4_access_requests.sql")
        assertEquals(membersTables, appTables())

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

        assertEquals(19, flyway().migrate().migrationsExecuted)
        assertEquals(imagesTables, appTables())
        assertEquals(pointThreadColumns + "assignee_id", columns("comment_threads"))
        assertEquals(reviewRequestNotificationColumns, columns("notifications"))
        assertEquals(versionAuthorsColumns, columns("board_versions"))
    }

    @Test
    fun `V17 keeps folders and tags of their user with short trimmed names once regardless of case, which go with their user, board and folder`() {
        flyway("15").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now()),
                   ('0199a000-0000-7000-8000-0000000000b1', 'github', '2', 'Bob', now());
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now()),
                   ('0199a000-0000-7000-8000-000000000002', 'Другая', '0199a000-0000-7000-8000-0000000000a1', now(), now());
            INSERT INTO board_documents (board_id, state, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', '\x01', now())
            """,
        ).update()

        assertEquals(1, flyway("17").migrate().migrationsExecuted)
        // Documents stored before have no text for search until collab sends it.
        assertEquals(
            1,
            jdbcClient.sql("SELECT count(*) FROM board_documents WHERE search_text IS NULL").query(Int::class.java).single(),
        )
        jdbcClient.sql(
            """
            INSERT INTO board_folders (id, user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000101', '0199a000-0000-7000-8000-0000000000a1', 'Работа', now()),
                   ('0199a000-0000-7000-8000-000000000102', '0199a000-0000-7000-8000-0000000000b1', 'Работа', now()),
                   ('0199a000-0000-7000-8000-000000000103', '0199a000-0000-7000-8000-0000000000a1', 'Архив', now());
            INSERT INTO board_tags (user_id, board_id, tag)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', '0199a000-0000-7000-8000-000000000001', 'API'),
                   ('0199a000-0000-7000-8000-0000000000a1', '0199a000-0000-7000-8000-000000000002', 'API'),
                   ('0199a000-0000-7000-8000-0000000000b1', '0199a000-0000-7000-8000-000000000001', 'api');
            INSERT INTO board_placements (user_id, board_id, folder_id)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', '0199a000-0000-7000-8000-000000000001',
                    '0199a000-0000-7000-8000-000000000101'),
                   ('0199a000-0000-7000-8000-0000000000a1', '0199a000-0000-7000-8000-000000000002',
                    '0199a000-0000-7000-8000-000000000103'),
                   ('0199a000-0000-7000-8000-0000000000b1', '0199a000-0000-7000-8000-000000000001',
                    '0199a000-0000-7000-8000-000000000102')
            """,
        ).update()
        val folder = { name: String ->
            jdbcClient.sql(
                "INSERT INTO board_folders (user_id, name, created_at) VALUES ('0199a000-0000-7000-8000-0000000000a1', :name, now())",
            ).param("name", name).update()
        }
        val tag = { tag: String ->
            jdbcClient.sql(
                """
                INSERT INTO board_tags (user_id, board_id, tag)
                VALUES ('0199a000-0000-7000-8000-0000000000a1', '0199a000-0000-7000-8000-000000000001', :tag)
                """,
            ).param("tag", tag).update()
        }
        for (wrong in listOf(
            { folder("работа") },
            { folder("") },
            { folder(" Идеи") },
            { folder("я".repeat(61)) },
            { tag("api") },
            { tag("") },
            { tag("Тег ") },
            { tag("я".repeat(31)) },
            // A board is in one folder of a user, and only in a folder of the same user.
            {
                jdbcClient.sql(
                    """
                    INSERT INTO board_placements (user_id, board_id, folder_id)
                    VALUES ('0199a000-0000-7000-8000-0000000000a1', '0199a000-0000-7000-8000-000000000001',
                            '0199a000-0000-7000-8000-000000000103')
                    """,
                ).update()
            },
            {
                jdbcClient.sql(
                    """
                    INSERT INTO board_placements (user_id, board_id, folder_id)
                    VALUES ('0199a000-0000-7000-8000-0000000000b1', '0199a000-0000-7000-8000-000000000002',
                            '0199a000-0000-7000-8000-000000000101')
                    """,
                ).update()
            },
            { jdbcClient.sql("UPDATE board_documents SET search_text = :text").param("text", "я".repeat(100_001)).update() },
        )) {
            assertFailsWith<DataIntegrityViolationException> { wrong() }
        }
        folder("я".repeat(60))
        tag("я".repeat(30))
        jdbcClient.sql("UPDATE board_documents SET search_text = :text").param("text", "я".repeat(100_000)).update()

        // Deleting a folder takes its boards out of it.
        jdbcClient.sql("DELETE FROM board_folders WHERE id = '0199a000-0000-7000-8000-000000000101'").update()
        assertEquals(2, count("board_placements"))
        assertEquals(2, count("boards"))
        jdbcClient.sql("DELETE FROM boards WHERE id = '0199a000-0000-7000-8000-000000000002'").update()
        assertEquals(1, count("board_placements"))
        assertEquals(3, count("board_tags"))
        jdbcClient.sql("DELETE FROM users WHERE id = '0199a000-0000-7000-8000-0000000000b1'").update()
        assertEquals(0, count("board_placements"))
        assertEquals(2, count("board_tags"))
        assertEquals(2, count("board_folders"))

        revert("U17__claude_relaxed_euler_o3h2ky_board_organization.sql")
        assertEquals(proposalsTables, appTables())
        assertEquals(documentColumns, columns("board_documents"))
        assertEquals(1, flyway("17").migrate().migrationsExecuted)
    }

    @Test
    fun `V19 keeps a file of a board once, only raster types, and the rows of images of a deleted board`() {
        assertEquals(18, flyway("19").migrate().migrationsExecuted)
        val insert = { board: String, sha: String, type: String ->
            jdbcClient.sql(
                """
                INSERT INTO board_images (board_id, sha256, content_type, size, width, height, created_at)
                VALUES ('$board'::uuid, decode(repeat('$sha', 32), 'hex'), '$type', 100, 10, 20, now())
                """,
            ).update()
        }

        // No board of that id: the rows wait for the cleanup to delete their objects.
        insert("0199a000-0000-7000-8000-000000000001", "aa", "image/png")
        insert("0199a000-0000-7000-8000-000000000002", "aa", "image/webp")

        assertFailsWith<DataIntegrityViolationException> { insert("0199a000-0000-7000-8000-000000000001", "aa", "image/jpeg") }
        assertFailsWith<DataIntegrityViolationException> { insert("0199a000-0000-7000-8000-000000000001", "bb", "image/svg+xml") }
        assertEquals(2, count("board_images"))
    }

    @Test
    fun `V18 keeps notifications about reviews with a page and an element, and the other kinds without them`() {
        flyway("17").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now()),
                   ('0199a000-0000-7000-8000-0000000000b1', 'github', '2', 'Bob', now());
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now());
            INSERT INTO notifications (user_id, kind, board_id, actor_id, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000b1', 'OWNERSHIP', '0199a000-0000-7000-8000-000000000001',
                    '0199a000-0000-7000-8000-0000000000a1', now())
            """,
        ).update()

        assertEquals(1, flyway("18").migrate().migrationsExecuted)
        val notification = { kind: String, page: String?, cell: String? ->
            jdbcClient.sql(
                """
                INSERT INTO notifications (user_id, kind, board_id, page_id, cell_id, actor_id, created_at)
                VALUES ('0199a000-0000-7000-8000-0000000000a1', :kind, '0199a000-0000-7000-8000-000000000001', :page,
                        :cell, '0199a000-0000-7000-8000-0000000000b1', now())
                """,
            ).param("kind", kind).param("page", page).param("cell", cell).update()
        }
        notification("REVIEW_REQUEST", "page-1", "orders")
        // Many requests about one element are kept: how often the owner hears of it is up to the backend.
        notification("REVIEW_REQUEST", "page-1", "orders")
        notification("REVIEW_REQUEST", "p".repeat(100), "c".repeat(100))
        for (wrong in listOf(
            { notification("REVIEW_REQUEST", null, "orders") },
            { notification("REVIEW_REQUEST", "page-1", null) },
            { notification("REVIEW_REQUEST", "", "orders") },
            { notification("REVIEW_REQUEST", "page-1", "c".repeat(101)) },
            { notification("OWNERSHIP", "page-1", "orders") },
            { notification("OWNERSHIP", null, "orders") },
            { notification("REVIEWED", "page-1", "orders") },
        )) {
            assertFailsWith<DataIntegrityViolationException> { wrong() }
        }
        assertEquals(4, count("notifications"))

        // The requester goes: the notification stays without them, like any other.
        jdbcClient.sql("DELETE FROM users WHERE id = '0199a000-0000-7000-8000-0000000000b1'").update()
        assertEquals(3, count("notifications"))
        assertEquals(
            0,
            jdbcClient.sql("SELECT count(*) FROM notifications WHERE actor_id IS NOT NULL").query(Int::class.java).single(),
        )

        // The kinds of V15 stay, the requests for reviews go.
        revert("U18__claude_relaxed_euler_o3h2ky_element_status.sql")
        assertEquals(0, count("notifications"))
        jdbcClient.sql(
            """
            INSERT INTO notifications (user_id, kind, board_id, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'OWNERSHIP', '0199a000-0000-7000-8000-000000000001', now())
            """,
        ).update()
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql("UPDATE notifications SET kind = 'REVIEW_REQUEST'").update()
        }
        assertEquals(1, flyway("18").migrate().migrationsExecuted)
    }

    @Test
    fun `V15 keeps proposals with known statuses and short texts, which go with their board and their author, and the notifications of V12`() {
        flyway("14").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now()),
                   ('0199a000-0000-7000-8000-0000000000b1', 'guest', '2', 'Гость 1', now()),
                   ('0199a000-0000-7000-8000-0000000000c1', 'github', '3', 'Carol', now());
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now()),
                   ('0199a000-0000-7000-8000-000000000002', 'Другая', '0199a000-0000-7000-8000-0000000000a1', now(), now());
            INSERT INTO board_versions (board_id, state, reason, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', '\x01', 'RESTORE', now());
            INSERT INTO comment_threads (id, board_id, page_id, assignee_id, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000101', '0199a000-0000-7000-8000-000000000001', 'page-1',
                    '0199a000-0000-7000-8000-0000000000a1', now());
            INSERT INTO notifications (user_id, kind, board_id, thread_id, actor_id, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'ASSIGNED', '0199a000-0000-7000-8000-000000000001',
                    '0199a000-0000-7000-8000-000000000101', '0199a000-0000-7000-8000-0000000000c1', now())
            """,
        ).update()

        assertEquals(1, flyway("15").migrate().migrationsExecuted)
        jdbcClient.sql(
            """
            INSERT INTO proposals (id, board_id, author_id, title, base, draft, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000301', '0199a000-0000-7000-8000-000000000001',
                    '0199a000-0000-7000-8000-0000000000b1', 'Очередь', '\x01', NULL, now());
            INSERT INTO proposals (id, board_id, author_id, title, status, created_at, decided_at, decided_by, comment)
            VALUES ('0199a000-0000-7000-8000-000000000302', '0199a000-0000-7000-8000-000000000001',
                    '0199a000-0000-7000-8000-0000000000a1', 'Кэш', 'DECLINED', now(), now(),
                    '0199a000-0000-7000-8000-0000000000c1', 'Не нужно'),
                   ('0199a000-0000-7000-8000-000000000303', '0199a000-0000-7000-8000-000000000002',
                    '0199a000-0000-7000-8000-0000000000a1', 'Шлюз', 'OPEN', now(), NULL, NULL, NULL);
            INSERT INTO board_versions (board_id, state, reason, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', '\x02', 'PROPOSAL', now());
            INSERT INTO notifications (user_id, kind, board_id, proposal_id, actor_id, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'PROPOSAL_CREATED', '0199a000-0000-7000-8000-000000000001',
                    '0199a000-0000-7000-8000-000000000301', '0199a000-0000-7000-8000-0000000000b1', now()),
                   ('0199a000-0000-7000-8000-0000000000a1', 'PROPOSAL_DECLINED', '0199a000-0000-7000-8000-000000000001',
                    '0199a000-0000-7000-8000-000000000302', '0199a000-0000-7000-8000-0000000000c1', now())
            """,
        ).update()

        val proposal = { title: String, status: String, decided: Boolean, comment: String? ->
            jdbcClient.sql(
                """
                INSERT INTO proposals (board_id, author_id, title, status, created_at, decided_at, comment)
                VALUES ('0199a000-0000-7000-8000-000000000001', '0199a000-0000-7000-8000-0000000000a1', :title, :status,
                        now(), CASE WHEN :decided THEN now() END, :comment)
                """,
            ).param("title", title).param("status", status).param("decided", decided).param("comment", comment).update()
        }
        for (wrong in listOf(
            { proposal("", "OPEN", false, null) },
            { proposal("я".repeat(121), "OPEN", false, null) },
            { proposal("Очередь", "MERGED", true, null) },
            // Closed ones have the time of the decision, open ones do not.
            { proposal("Очередь", "OPEN", true, null) },
            { proposal("Очередь", "ACCEPTED", false, null) },
            // Only a declined one has a comment, of 1 to 2000 characters.
            { proposal("Очередь", "ACCEPTED", true, "Хорошо") },
            { proposal("Очередь", "DECLINED", true, "я".repeat(2001)) },
        )) {
            assertFailsWith<DataIntegrityViolationException> { wrong() }
        }
        proposal("я".repeat(120), "WITHDRAWN", true, null)
        val notification = { kind: String, proposal: String? ->
            jdbcClient.sql(
                """
                INSERT INTO notifications (user_id, kind, board_id, proposal_id, actor_id, created_at)
                VALUES ('0199a000-0000-7000-8000-0000000000c1', :kind, '0199a000-0000-7000-8000-000000000001',
                        :proposal::uuid, '0199a000-0000-7000-8000-0000000000a1', now())
                """,
            ).param("kind", kind).param("proposal", proposal).update()
        }
        assertFailsWith<DataIntegrityViolationException> { notification("PROPOSAL_ACCEPTED", null) }
        assertFailsWith<DataIntegrityViolationException> { notification("OWNERSHIP", "0199a000-0000-7000-8000-000000000302") }
        // Notifications of assigned threads keep their kind, and one per thread and recipient.
        val assigned = { proposal: String? ->
            jdbcClient.sql(
                """
                INSERT INTO notifications (user_id, kind, board_id, thread_id, proposal_id, actor_id, created_at)
                VALUES ('0199a000-0000-7000-8000-0000000000a1', 'ASSIGNED', '0199a000-0000-7000-8000-000000000001',
                        '0199a000-0000-7000-8000-000000000101', :proposal::uuid, '0199a000-0000-7000-8000-0000000000c1',
                        now())
                """,
            ).param("proposal", proposal).update()
        }
        assertFailsWith<DataIntegrityViolationException> { assigned(null) }
        assertFailsWith<DataIntegrityViolationException> { assigned("0199a000-0000-7000-8000-000000000302") }
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql("UPDATE board_versions SET reason = 'MERGE'").update()
        }

        // Who declined goes; the proposal stays without them.
        jdbcClient.sql("DELETE FROM users WHERE id = '0199a000-0000-7000-8000-0000000000c1'").update()
        assertEquals(
            1,
            jdbcClient.sql("SELECT count(*) FROM proposals WHERE status = 'DECLINED' AND decided_by IS NULL")
                .query(Int::class.java).single(),
        )
        // The guest who proposed goes with their proposal and the notifications about it.
        jdbcClient.sql("DELETE FROM users WHERE id = '0199a000-0000-7000-8000-0000000000b1'").update()
        assertEquals(3, count("proposals"))
        assertEquals(2, count("notifications"))
        jdbcClient.sql("DELETE FROM boards WHERE id = '0199a000-0000-7000-8000-000000000002'").update()
        assertEquals(2, count("proposals"))

        // The version from before a proposal was accepted stays as one from before a restore.
        revert("U15__claude_epic_lovelace_pwi6v4_change_proposals.sql")
        assertEquals(
            listOf("RESTORE", "RESTORE"),
            jdbcClient.sql("SELECT reason FROM board_versions ORDER BY state").query(String::class.java).list(),
        )
        // The kinds of V12 stay, those of proposals go.
        assertEquals(listOf("ASSIGNED"), jdbcClient.sql("SELECT kind FROM notifications").query(String::class.java).list())
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql("UPDATE notifications SET kind = 'PROPOSAL_ACCEPTED'").update()
        }
        assertEquals(1, flyway("15").migrate().migrationsExecuted)
    }

    @Test
    fun `V14 keeps one visit per user and board, which goes with its board and its user`() {
        flyway("13").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now()),
                   ('0199a000-0000-7000-8000-0000000000b1', 'guest', '2', 'Гость 1', now());
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now()),
                   ('0199a000-0000-7000-8000-000000000002', 'Другая', '0199a000-0000-7000-8000-0000000000a1', now(), now())
            """,
        ).update()

        assertEquals(1, flyway("14").migrate().migrationsExecuted)
        jdbcClient.sql(
            """
            INSERT INTO board_reads (user_id, board_id, seen_at, previous_seen_at, present)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', '0199a000-0000-7000-8000-000000000001', now(), NULL, true),
                   ('0199a000-0000-7000-8000-0000000000b1', '0199a000-0000-7000-8000-000000000001', now(), now(), false),
                   ('0199a000-0000-7000-8000-0000000000b1', '0199a000-0000-7000-8000-000000000002', now(), NULL, true)
            """,
        ).update()
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql(
                """
                INSERT INTO board_reads (user_id, board_id, seen_at, present)
                VALUES ('0199a000-0000-7000-8000-0000000000a1', '0199a000-0000-7000-8000-000000000001', now(), true)
                """,
            ).update()
        }
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql(
                """
                INSERT INTO board_reads (user_id, board_id, seen_at)
                VALUES ('0199a000-0000-7000-8000-0000000000a1', '0199a000-0000-7000-8000-000000000002', now())
                """,
            ).update()
        }

        jdbcClient.sql("DELETE FROM users WHERE id = '0199a000-0000-7000-8000-0000000000b1'").update()
        assertEquals(1, count("board_reads"))

        jdbcClient.sql("DELETE FROM boards").update()
        assertEquals(0, count("board_reads"))
    }

    @Test
    fun `V13 gives existing versions and documents nobody who changed them and keeps names from 1 to 100 characters`() {
        flyway("12").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now());
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now());
            INSERT INTO board_documents (board_id, state, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', '\x01', now());
            INSERT INTO board_versions (board_id, state, reason, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', '\x01', 'AUTO', now())
            """,
        ).update()

        assertEquals(1, flyway("13").migrate().migrationsExecuted)

        assertEquals(0, jdbcClient.sql("SELECT cardinality(editors) FROM board_documents").query(Int::class.java).single())
        assertEquals(0, jdbcClient.sql("SELECT cardinality(authors) FROM board_versions").query(Int::class.java).single())
        jdbcClient.sql("UPDATE board_versions SET name = :name").param("name", "я".repeat(100)).update()
        for (name in listOf("", "я".repeat(101))) {
            assertFailsWith<DataIntegrityViolationException> {
                jdbcClient.sql("UPDATE board_versions SET name = :name").param("name", name).update()
            }
        }
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
    fun `V9 keeps one request for access per user and board, with a known role and a short message, which goes with its board and its user`() {
        flyway("9").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now()),
                   ('0199a000-0000-7000-8000-0000000000b1', 'guest', '2', 'Гость 1', now()),
                   ('0199a000-0000-7000-8000-0000000000c1', 'github', '3', 'Carol', now());
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now());
            INSERT INTO board_access_requests (board_id, user_id, role, message, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', '0199a000-0000-7000-8000-0000000000b1', 'EDITOR', 'Пусти', now()),
                   ('0199a000-0000-7000-8000-000000000001', '0199a000-0000-7000-8000-0000000000c1', 'VIEWER', NULL, now())
            """,
        ).update()

        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql(
                """
                INSERT INTO board_access_requests (board_id, user_id, role, created_at)
                VALUES ('0199a000-0000-7000-8000-000000000001', '0199a000-0000-7000-8000-0000000000b1', 'VIEWER', now())
                """,
            ).update()
        }
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql("UPDATE board_access_requests SET role = 'OWNER'").update()
        }
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql("UPDATE board_access_requests SET message = ''").update()
        }
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql("UPDATE board_access_requests SET message = repeat('а', 501)").update()
        }

        jdbcClient.sql("DELETE FROM users WHERE id = '0199a000-0000-7000-8000-0000000000b1'").update()
        assertEquals(1, count("board_access_requests"))

        jdbcClient.sql("DELETE FROM boards").update()
        assertEquals(0, count("board_access_requests"))
    }

    @Test
    fun `V10 keeps notifications of known kinds, one per comment and recipient, which go with their board, comment and recipient`() {
        flyway("10").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now()),
                   ('0199a000-0000-7000-8000-0000000000b1', 'guest', '2', 'Гость 1', now()),
                   ('0199a000-0000-7000-8000-0000000000c1', 'github', '3', 'Carol', now());
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now()),
                   ('0199a000-0000-7000-8000-000000000002', 'Другая', '0199a000-0000-7000-8000-0000000000a1', now(), now());
            INSERT INTO comment_threads (id, board_id, page_id, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000101', '0199a000-0000-7000-8000-000000000001', 'page-1', now());
            INSERT INTO comments (id, thread_id, author_id, body, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000201', '0199a000-0000-7000-8000-000000000101',
                    '0199a000-0000-7000-8000-0000000000b1', 'Привет', now());
            INSERT INTO notifications (user_id, kind, board_id, comment_id, actor_id, role, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'MENTION', '0199a000-0000-7000-8000-000000000001',
                    '0199a000-0000-7000-8000-000000000201', '0199a000-0000-7000-8000-0000000000b1', NULL, now()),
                   ('0199a000-0000-7000-8000-0000000000c1', 'REPLY', '0199a000-0000-7000-8000-000000000001',
                    '0199a000-0000-7000-8000-000000000201', '0199a000-0000-7000-8000-0000000000b1', NULL, now()),
                   ('0199a000-0000-7000-8000-0000000000a1', 'ACCESS_REQUEST', '0199a000-0000-7000-8000-000000000002',
                    NULL, '0199a000-0000-7000-8000-0000000000b1', 'EDITOR', now()),
                   ('0199a000-0000-7000-8000-0000000000b1', 'ACCESS_DECLINED', '0199a000-0000-7000-8000-000000000002',
                    NULL, '0199a000-0000-7000-8000-0000000000a1', 'EDITOR', now())
            """,
        ).update()

        val notification = { kind: String, comment: String?, actor: String, role: String? ->
            jdbcClient.sql(
                """
                INSERT INTO notifications (user_id, kind, board_id, comment_id, actor_id, role, created_at)
                VALUES ('0199a000-0000-7000-8000-0000000000a1', :kind, '0199a000-0000-7000-8000-000000000001',
                        :comment::uuid, :actor::uuid, :role, now())
                """,
            ).param("kind", kind).param("comment", comment).param("actor", actor).param("role", role).update()
        }
        val comment = "0199a000-0000-7000-8000-000000000201"
        val carol = "0199a000-0000-7000-8000-0000000000c1"
        // A second notification about the comment to the same recipient.
        assertFailsWith<DataIntegrityViolationException> { notification("REPLY", comment, carol, null) }
        assertFailsWith<DataIntegrityViolationException> { notification("LIKE", null, carol, null) }
        assertFailsWith<DataIntegrityViolationException> { notification("MENTION", null, carol, null) }
        assertFailsWith<DataIntegrityViolationException> { notification("OWNERSHIP", comment, carol, null) }
        assertFailsWith<DataIntegrityViolationException> { notification("ACCESS_GRANTED", null, carol, null) }
        assertFailsWith<DataIntegrityViolationException> { notification("ACCESS_GRANTED", null, carol, "OWNER") }
        assertFailsWith<DataIntegrityViolationException> { notification("OWNERSHIP", null, carol, "EDITOR") }
        // Nobody is notified of what they did themselves.
        assertFailsWith<DataIntegrityViolationException> {
            notification("OWNERSHIP", null, "0199a000-0000-7000-8000-0000000000a1", null)
        }

        // The guest who wrote the comment goes: the comment stays without its author, and so do its notifications.
        jdbcClient.sql("DELETE FROM users WHERE id = '0199a000-0000-7000-8000-0000000000b1'").update()
        assertEquals(3, count("notifications"))
        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM notifications WHERE actor_id IS NOT NULL").query(Int::class.java).single())

        jdbcClient.sql("DELETE FROM users WHERE id = '0199a000-0000-7000-8000-0000000000c1'").update()
        assertEquals(2, count("notifications"))

        jdbcClient.sql("DELETE FROM comments").update()
        assertEquals(1, count("notifications"))

        jdbcClient.sql("DELETE FROM boards").update()
        assertEquals(0, count("notifications"))
    }

    @Test
    fun `V11 keeps the threads of a database and gives a thread a whole point within range or none, never with an element`() {
        flyway("10").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now());
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now());
            INSERT INTO comment_threads (id, board_id, page_id, cell_id, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000101', '0199a000-0000-7000-8000-000000000001', 'page-1', 'cell-1', now()),
                   ('0199a000-0000-7000-8000-000000000102', '0199a000-0000-7000-8000-000000000001', 'page-1', NULL, now())
            """,
        ).update()

        assertEquals(1, flyway("11").migrate().migrationsExecuted)

        assertEquals(2, jdbcClient.sql("SELECT count(*) FROM comment_threads WHERE x IS NULL AND y IS NULL").query(Int::class.java).single())
        // SQL literals: NULL, NaN and the infinities as PostgreSQL reads them.
        val point = { x: String, y: String ->
            jdbcClient.sql("UPDATE comment_threads SET x = $x, y = $y WHERE id = '0199a000-0000-7000-8000-000000000102'").update()
        }
        point("-1000000", "1000000")
        assertFailsWith<DataIntegrityViolationException> { point("10", "NULL") }
        assertFailsWith<DataIntegrityViolationException> { point("1000000.5", "0") }
        assertFailsWith<DataIntegrityViolationException> { point("'NaN'", "0") }
        assertFailsWith<DataIntegrityViolationException> { point("0", "'-Infinity'") }
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql("UPDATE comment_threads SET x = 1, y = 2 WHERE id = '0199a000-0000-7000-8000-000000000101'").update()
        }
    }

    @Test
    fun `V12 keeps reactions of the set once per user, an assignee and one notification of an assigned thread per recipient`() {
        flyway("11").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now()),
                   ('0199a000-0000-7000-8000-0000000000b1', 'guest', '2', 'Гость 1', now());
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now());
            INSERT INTO comment_threads (id, board_id, page_id, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000101', '0199a000-0000-7000-8000-000000000001', 'page-1', now());
            INSERT INTO comments (id, thread_id, author_id, body, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000201', '0199a000-0000-7000-8000-000000000101',
                    '0199a000-0000-7000-8000-0000000000a1', 'Привет', now());
            INSERT INTO notifications (user_id, kind, board_id, comment_id, actor_id, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000b1', 'MENTION', '0199a000-0000-7000-8000-000000000001',
                    '0199a000-0000-7000-8000-000000000201', '0199a000-0000-7000-8000-0000000000a1', now())
            """,
        ).update()

        assertEquals(1, flyway("12").migrate().migrationsExecuted)

        assertEquals(1, count("notifications"))
        val react = { user: String, reaction: String ->
            jdbcClient.sql(
                """
                INSERT INTO comment_reactions (comment_id, user_id, reaction, created_at)
                VALUES ('0199a000-0000-7000-8000-000000000201', :user::uuid, :reaction, now())
                """,
            ).param("user", user).param("reaction", reaction).update()
        }
        val alice = "0199a000-0000-7000-8000-0000000000a1"
        val guest = "0199a000-0000-7000-8000-0000000000b1"
        react(alice, "THUMBS_UP")
        react(alice, "HEART")
        react(guest, "THUMBS_UP")
        assertFailsWith<DataIntegrityViolationException> { react(alice, "THUMBS_UP") }
        assertFailsWith<DataIntegrityViolationException> { react(alice, "FIRE") }

        jdbcClient.sql("UPDATE comment_threads SET assignee_id = :guest::uuid").param("guest", guest).update()
        val notification = { kind: String, thread: String?, comment: String? ->
            jdbcClient.sql(
                """
                INSERT INTO notifications (user_id, kind, board_id, comment_id, thread_id, actor_id, created_at)
                VALUES (:guest::uuid, :kind, '0199a000-0000-7000-8000-000000000001', :comment::uuid, :thread::uuid,
                        :alice::uuid, now())
                """,
            ).param("guest", guest).param("alice", alice).param("kind", kind).param("thread", thread).param("comment", comment)
                .update()
        }
        val thread = "0199a000-0000-7000-8000-000000000101"
        notification("ASSIGNED", thread, null)
        // A second notification about the thread to the same recipient.
        assertFailsWith<DataIntegrityViolationException> { notification("ASSIGNED", thread, null) }
        assertFailsWith<DataIntegrityViolationException> { notification("ASSIGNED", null, null) }
        assertFailsWith<DataIntegrityViolationException> { notification("OWNERSHIP", thread, null) }
        assertFailsWith<DataIntegrityViolationException> { notification("ASSIGNED", thread, "0199a000-0000-7000-8000-000000000201") }

        // The guest goes: their reaction goes, the thread stays without its assignee, and so do their notifications.
        jdbcClient.sql("DELETE FROM users WHERE id = :guest::uuid").param("guest", guest).update()
        assertEquals(2, count("comment_reactions"))
        val assigned = jdbcClient.sql("SELECT count(*) FROM comment_threads WHERE assignee_id IS NOT NULL").query(Int::class.java)
        assertEquals(0, assigned.single())
        assertEquals(0, count("notifications"))

        jdbcClient.sql("UPDATE comment_threads SET assignee_id = :alice::uuid").param("alice", alice).update()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000b1', 'guest', '2', 'Гость 1', now())
            """,
        ).update()
        notification("ASSIGNED", thread, null)
        // A deleted thread takes its notifications and the reactions to its comments with it.
        jdbcClient.sql("DELETE FROM comment_threads").update()
        assertEquals(0, count("notifications"))
        assertEquals(0, count("comment_reactions"))
    }

    @Test
    fun `U12 drops reactions, assignees and notifications of assigned threads, and keeps threads and other notifications`() {
        flyway("12").migrate()
        jdbcClient.sql(
            """
            INSERT INTO users (id, provider, provider_user_id, name, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000a1', 'github', '1', 'Alice', now()),
                   ('0199a000-0000-7000-8000-0000000000b1', 'github', '2', 'Bob', now());
            INSERT INTO boards (id, title, owner_id, created_at, updated_at)
            VALUES ('0199a000-0000-7000-8000-000000000001', 'Доска', '0199a000-0000-7000-8000-0000000000a1', now(), now());
            INSERT INTO comment_threads (id, board_id, page_id, assignee_id, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000101', '0199a000-0000-7000-8000-000000000001', 'page-1',
                    '0199a000-0000-7000-8000-0000000000b1', now());
            INSERT INTO comments (id, thread_id, author_id, body, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000201', '0199a000-0000-7000-8000-000000000101',
                    '0199a000-0000-7000-8000-0000000000a1', 'Привет', now());
            INSERT INTO comment_reactions (comment_id, user_id, reaction, created_at)
            VALUES ('0199a000-0000-7000-8000-000000000201', '0199a000-0000-7000-8000-0000000000b1', 'EYES', now());
            INSERT INTO notifications (user_id, kind, board_id, comment_id, thread_id, actor_id, created_at)
            VALUES ('0199a000-0000-7000-8000-0000000000b1', 'MENTION', '0199a000-0000-7000-8000-000000000001',
                    '0199a000-0000-7000-8000-000000000201', NULL, '0199a000-0000-7000-8000-0000000000a1', now()),
                   ('0199a000-0000-7000-8000-0000000000b1', 'ASSIGNED', '0199a000-0000-7000-8000-000000000001',
                    NULL, '0199a000-0000-7000-8000-000000000101', '0199a000-0000-7000-8000-0000000000a1', now())
            """,
        ).update()

        revert("U12__claude_epic_lovelace_pwi6v4_comment_reactions_and_assignees.sql")

        assertEquals(1, count("comment_threads"))
        assertEquals(1, count("comments"))
        assertEquals(listOf("MENTION"), jdbcClient.sql("SELECT kind FROM notifications").query(String::class.java).list())
        assertFailsWith<DataIntegrityViolationException> {
            jdbcClient.sql("UPDATE notifications SET kind = 'ASSIGNED'").update()
        }
        assertEquals(1, flyway("12").migrate().migrationsExecuted)
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

    private fun boardColumns(): Set<String> = columns("boards")

    private fun columns(table: String): Set<String> = jdbcClient.sql(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = :table",
    ).param("table", table).query(String::class.java).list().filterNotNull().toSet()

    private fun appTables(): Set<String> = jdbcClient.sql(
        "SELECT table_name FROM information_schema.tables " +
            "WHERE table_schema = 'public' AND table_name <> 'flyway_schema_history'",
    ).query(String::class.java).list().filterNotNull().toSet()
}
