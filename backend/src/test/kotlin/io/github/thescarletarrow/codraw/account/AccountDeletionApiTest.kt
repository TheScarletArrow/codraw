package io.github.thescarletarrow.codraw.account

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.signedIn
import io.github.thescarletarrow.codraw.user.DELETED_USER_ID
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
import jakarta.servlet.http.Cookie
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.containsInAnyOrder
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.session.SessionRepository
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull

@IntegrationTest
class AccountDeletionApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val sessions: SessionRepository<*>,
    @Autowired private val registry: MeterRegistry,
) {

    private lateinit var alice: User
    private lateinit var bob: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM workspaces").update()
        jdbcClient.sql("DELETE FROM personal_templates").update()
        jdbcClient.sql("DELETE FROM spring_session").update()
        jdbcClient.sql("DELETE FROM users").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
    }

    @Test
    fun `leaves no row of any table that refers to the deleted user, and keeps what they gave to boards of others`() {
        val bobsBoard = board(bob, "Схема Боба")
        val own = board(alice, "Черновик")
        val shared = board(alice, "Общая")
        val trashed = board(alice, "В корзине", deleted = true)
        sql("INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (:board, :user, 'EDITOR', now())", "board" to shared, "user" to bob.id)
        val image = UUID.randomUUID()
        sql(
            """
            INSERT INTO board_images (id, board_id, sha256, content_type, size, width, height, created_at)
            VALUES (:id, :board, sha256('png'::bytea), 'image/png', 3, 1, 1, now())
            """,
            "id" to image, "board" to own,
        )
        val comment = seedEverything(alice, bobsBoard)
        val cookie = sessions.signedIn(alice)
        val deletedBefore = registry.counter("codraw.accounts.deleted").count()

        // A new foreign key to users fails here until seedEverything gives the user a row in it.
        assertEquals(referencesToUsers(), columnsReferring(alice.id).keys)
        deleteAccount(cookie, """{"boards": [{"boardId": "$shared", "action": "transfer", "newOwnerId": "${bob.id}"}]}""")
            .andExpect { status { isNoContent() } }

        assertEquals(emptyMap(), columnsReferring(alice.id))
        assertEquals(0, count("SELECT count(*) FROM board_documents WHERE editors @> ARRAY[:id::uuid]", "id" to alice.id))
        assertEquals(0, count("SELECT count(*) FROM board_versions WHERE authors @> ARRAY[:id::uuid]", "id" to alice.id))
        assertEquals(0, count("SELECT count(*) FROM spring_session WHERE principal_name = :id", "id" to alice.id.toString()))
        assertNull(users.find(alice.id))
        // Her boards are gone, but not the one she gave to Bob, nor the one of the workspace, which passed to him.
        assertEquals(3, count("SELECT count(*) FROM boards WHERE owner_id = :id", "id" to bob.id))
        assertEquals(bob.id, uuid("SELECT owner_id FROM boards WHERE id = :id", "id" to shared))
        assertEquals(0, count("SELECT count(*) FROM boards WHERE id IN (:own, :trashed)", "own" to own, "trashed" to trashed))
        assertEquals(0, count("SELECT count(*) FROM board_images WHERE id = :id", "id" to image))
        // What she wrote on the board of Bob stays, without its author.
        assertEquals(1, count("SELECT count(*) FROM comments WHERE id = :id AND author_id IS NULL", "id" to comment))
        assertEquals(1, count("SELECT count(*) FROM decisions WHERE author_id IS NULL"))
        assertEquals(1, count("SELECT count(*) FROM issue_links WHERE linked_by IS NULL"))
        assertEquals(listOf(DELETED_USER_ID, bob.id), uuids("SELECT unnest(authors) FROM board_versions"))
        assertEquals(listOf(DELETED_USER_ID), uuids("SELECT unnest(editors) FROM board_documents"))
        assertEquals(deletedBefore + 1, registry.counter("codraw.accounts.deleted").count())
        mockMvc.get("/api/me") { cookie(cookie) }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `a version names a deleted author as a deleted user`() {
        val bobsBoard = board(bob, "Схема Боба")
        sql(
            "INSERT INTO board_versions (board_id, state, reason, created_at, authors) VALUES (:board, '\\x00', 'MANUAL', now(), :authors::uuid[])",
            "board" to bobsBoard, "authors" to arrayOf(alice.id, bob.id),
        )

        deleteAccount(sessions.signedIn(alice)).andExpect { status { isNoContent() } }

        mockMvc.get("/api/boards/$bobsBoard/versions") { with(bob.session()) }.andExpect {
            status { isOk() }
            jsonPath("$[0].authors[*].name") { value(contains("Удалённый пользователь", "Bob")) }
        }
    }

    @Test
    fun `describes the boards to decide on, the workspaces in the way and the boards that go`() {
        val shared = board(alice, "Общая")
        board(alice, "Черновик")
        board(alice, "В корзине", deleted = true)
        val visited = board(alice, "По ссылке")
        sql("INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (:board, :user, 'VIEWER', now())", "board" to shared, "user" to bob.id)
        sql("INSERT INTO board_visits (user_id, board_id, visited_at) VALUES (:user, :board, now())", "user" to bob.id, "board" to visited)
        val workspace = workspace("Платформа", alice to "OWNER", bob to "EDITOR")
        workspace("Одна", alice to "OWNER")

        mockMvc.get("/api/me/deletion") { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.sharedBoards[*].title") { value(containsInAnyOrder("Общая", "По ссылке")) }
            jsonPath("$.sharedBoards[?(@.title == 'Общая')].members[0].name") { value(contains("Bob")) }
            jsonPath("$.sharedBoards[?(@.title == 'Общая')].members[0].role") { value(contains("viewer")) }
            jsonPath("$.sharedBoards[?(@.title == 'По ссылке')].visitors") { value(contains(1)) }
            jsonPath("$.blockingWorkspaces[*].id") { value(contains(workspace.toString())) }
            jsonPath("$.deletedBoards") { value(2) }
        }
    }

    @Test
    fun `refuses to delete while a board with others has no decision, and changes nothing`() {
        val shared = board(alice, "Общая")
        board(alice, "Черновик")
        sql("INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (:board, :user, 'EDITOR', now())", "board" to shared, "user" to bob.id)

        deleteAccount(sessions.signedIn(alice)).andExpect {
            status { isConflict() }
            jsonPath("$.reason") { value("decisions-required") }
            jsonPath("$.boards") { value(contains(shared.toString())) }
        }

        assertEquals(2, count("SELECT count(*) FROM boards WHERE owner_id = :id", "id" to alice.id))
        assertEquals(alice, users.find(alice.id))
    }

    @Test
    fun `deletes a board with others when its owner decides so`() {
        val shared = board(alice, "Общая")
        sql("INSERT INTO board_visits (user_id, board_id, visited_at) VALUES (:user, :board, now())", "user" to bob.id, "board" to shared)

        deleteAccount(sessions.signedIn(alice), """{"boards": [{"boardId": "$shared", "action": "delete"}]}""")
            .andExpect { status { isNoContent() } }

        assertEquals(0, count("SELECT count(*) FROM boards"))
    }

    @Test
    fun `refuses to pass a board to a user who is not its member`() {
        val shared = board(alice, "Общая")
        sql("INSERT INTO board_visits (user_id, board_id, visited_at) VALUES (:user, :board, now())", "user" to bob.id, "board" to shared)

        deleteAccount(
            sessions.signedIn(alice),
            """{"boards": [{"boardId": "$shared", "action": "transfer", "newOwnerId": "${bob.id}"}]}""",
        ).andExpect { status { isBadRequest() } }

        assertEquals(alice, users.find(alice.id))
    }

    @Test
    fun `refuses to delete the only owner of a workspace with other members`() {
        val workspace = workspace("Платформа", alice to "OWNER", bob to "EDITOR")

        deleteAccount(sessions.signedIn(alice)).andExpect {
            status { isConflict() }
            jsonPath("$.reason") { value("sole-workspace-owner") }
            jsonPath("$.workspaces[*].name") { value(contains("Платформа")) }
        }

        assertEquals(alice, users.find(alice.id))
        assertEquals(2, count("SELECT count(*) FROM workspace_members WHERE workspace_id = :id", "id" to workspace))
    }

    @Test
    fun `passes boards of workspaces to another owner and deletes the workspaces where the user is alone`() {
        val team = workspace("Платформа", alice to "OWNER", bob to "OWNER")
        val alone = workspace("Одна", alice to "OWNER")
        val teamBoard = board(alice, "Командная", workspace = team)
        board(alice, "Своя", workspace = alone)

        deleteAccount(sessions.signedIn(alice)).andExpect { status { isNoContent() } }

        assertEquals(listOf(teamBoard), ids("SELECT id FROM boards"))
        assertEquals(bob.id, uuid("SELECT owner_id FROM boards WHERE id = :id", "id" to teamBoard))
        assertEquals(listOf(team), ids("SELECT id FROM workspaces"))
    }

    @Test
    fun `signing in again after the deletion creates a new empty account`() {
        board(alice, "Черновик")

        deleteAccount(sessions.signedIn(alice)).andExpect { status { isNoContent() } }
        val again = users.gitHubUser("Alice")

        assertNotEquals(alice.id, again.id)
        mockMvc.get("/api/boards") { with(again.session()) }.andExpect { content { json("[]") } }
    }

    @Test
    fun `a guest deletes their account too`() {
        val guest = users.createGuest()
        board(guest, "Гостевая")

        deleteAccount(sessions.signedIn(guest)).andExpect { status { isNoContent() } }

        assertNull(users.find(guest.id))
    }

    @Test
    fun `every foreign key to users has an index that starts with it`() {
        val unindexed = jdbcClient.sql(
            """
            SELECT c.conrelid::regclass::text || '.' || a.attname
            FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
            WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
              AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])
            """,
        ).query(String::class.java).list()

        assertEquals(emptyList(), unindexed)
    }

    /**
     * Gives the [user] a row in every table that refers to users, on the [board] of somebody else where the table needs
     * a board; returns the id of a comment of the user.
     */
    private fun seedEverything(user: User, board: UUID): UUID {
        val other = if (user.id == bob.id) alice else bob
        sql("INSERT INTO board_documents (board_id, state, updated_at, editors) VALUES (:board, '\\x00', now(), :editors::uuid[])", "board" to board, "editors" to arrayOf(user.id))
        sql(
            "INSERT INTO board_versions (board_id, state, reason, created_at, authors) VALUES (:board, '\\x00', 'MANUAL', now(), :authors::uuid[])",
            "board" to board, "authors" to arrayOf(user.id, other.id),
        )
        sql("INSERT INTO board_visits (user_id, board_id, visited_at) VALUES (:user, :board, now())", "user" to user.id, "board" to board)
        sql("INSERT INTO board_reads (user_id, board_id, seen_at, present) VALUES (:user, :board, now(), false)", "user" to user.id, "board" to board)
        sql("INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (:board, :user, 'EDITOR', now())", "board" to board, "user" to user.id)
        sql("INSERT INTO board_access_requests (board_id, user_id, role, created_at) VALUES (:board, :user, 'EDITOR', now())", "board" to board, "user" to user.id)
        sql("INSERT INTO board_tags (user_id, board_id, tag) VALUES (:user, :board, 'Бэкенд')", "user" to user.id, "board" to board)
        val folder = uuid("INSERT INTO board_folders (user_id, name, created_at) VALUES (:id, 'Работа', now()) RETURNING id", "id" to user.id)
        sql("INSERT INTO board_placements (user_id, board_id, folder_id) VALUES (:user, :board, :folder)", "user" to user.id, "board" to board, "folder" to folder)
        sql("INSERT INTO notification_board_mutes (user_id, board_id, created_at) VALUES (:user, :board, now())", "user" to user.id, "board" to board)
        val thread = uuid(
            """
            INSERT INTO comment_threads (board_id, page_id, resolved_at, resolved_by, assignee_id, created_at)
            VALUES (:board, 'page', now(), :user, :user, now()) RETURNING id
            """,
            "board" to board, "user" to user.id,
        )
        val comment = uuid("INSERT INTO comments (thread_id, author_id, body, created_at) VALUES (:thread, :user, 'Моё', now()) RETURNING id", "thread" to thread, "user" to user.id)
        val answer = uuid("INSERT INTO comments (thread_id, author_id, body, created_at) VALUES (:thread, :user, 'Ответ', now()) RETURNING id", "thread" to thread, "user" to other.id)
        sql("INSERT INTO comment_mentions (comment_id, user_id) VALUES (:comment, :user)", "comment" to answer, "user" to user.id)
        sql("INSERT INTO comment_reactions (comment_id, user_id, reaction, created_at) VALUES (:comment, :user, 'HEART', now())", "comment" to answer, "user" to user.id)
        sql(
            "INSERT INTO notifications (user_id, kind, board_id, actor_id, created_at) VALUES (:user, 'OWNERSHIP', :board, :actor, now())",
            "user" to user.id, "board" to board, "actor" to other.id,
        )
        sql(
            "INSERT INTO notifications (user_id, kind, board_id, actor_id, created_at) VALUES (:user, 'OWNERSHIP', :board, :actor, now())",
            "user" to other.id, "board" to board, "actor" to user.id,
        )
        sql("INSERT INTO proposals (board_id, author_id, title, created_at) VALUES (:board, :user, 'Моё', now())", "board" to board, "user" to user.id)
        sql(
            """
            INSERT INTO proposals (board_id, author_id, title, status, created_at, decided_at, decided_by)
            VALUES (:board, :other, 'Чужое', 'DECLINED', now(), now(), :user)
            """,
            "board" to board, "other" to other.id, "user" to user.id,
        )
        sql(
            """
            INSERT INTO decisions (board_id, number, title, status, decided_on, author_id, context, options, outcome, consequences, created_at, updated_at)
            VALUES (:board, 1, 'Решение', 'PROPOSED', current_date, :user, '', '', '', '', now(), now())
            """,
            "board" to board, "user" to user.id,
        )
        val link = uuid(
            """
            INSERT INTO issue_links (board_id, page_id, cell_id, tracker, external_id, repository, number, title, state, url,
                                     private, issue_updated_at, sync_status, synced_at, linked_by, created_here, created_at)
            VALUES (:board, 'page', 'cell', 'GITHUB', 1, 'team/app', 1, 'Задача', 'OPEN', 'https://github.com/team/app/issues/1',
                    false, now(), 'OK', now(), :user, true, now())
            RETURNING id
            """,
            "board" to board, "user" to user.id,
        )
        sql("INSERT INTO issue_creations (user_id, request_id, link_id, created_at) VALUES (:user, gen_random_uuid(), :link, now())", "user" to user.id, "link" to link)
        sql("INSERT INTO issue_tracker_connections (user_id, tracker, token, login, created_at) VALUES (:id, 'GITHUB', 'ghp_secret', 'alice', now())", "id" to user.id)
        sql(
            """
            INSERT INTO notification_channels (user_id, kind, address, enabled, events, verified_at, created_at)
            VALUES (:id, 'WEBHOOK', 'https://chat.example.com/hook', true, '{MENTIONS}', now(), now())
            """,
            "id" to user.id,
        )
        sql("INSERT INTO shape_libraries (user_id, name, created_at) VALUES (:id, 'Мои фигуры', now())", "id" to user.id)
        sql(
            "INSERT INTO personal_templates (owner_id, title, description, drawio, created_at, updated_at) VALUES (:id, 'Шаблон', '', '<mxfile/>', now(), now())",
            "id" to user.id,
        )
        val workspace = workspace("Платформа", other to "OWNER", user to "EDITOR")
        sql("INSERT INTO boards (title, owner_id, created_at, updated_at, workspace_id) VALUES ('Своя в пространстве', :user, now(), now(), :workspace)", "user" to user.id, "workspace" to workspace)
        return comment
    }

    /** The columns of all foreign keys to users, as `table.column`. */
    private fun referencesToUsers(): Set<String> = jdbcClient.sql(
        """
        SELECT c.conrelid::regclass::text || '.' || a.attname
        FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
        """,
    ).query(String::class.java).list().filterNotNull().toSet()

    /** How many rows refer to the user [id] in each column of a foreign key to users that has any. */
    private fun columnsReferring(id: UUID): Map<String, Int> = referencesToUsers()
        .associateWith { column ->
            val (table, name) = column.split('.')
            count("SELECT count(*) FROM $table WHERE $name = :id", "id" to id)
        }
        .filterValues { it > 0 }

    private fun deleteAccount(cookie: Cookie, body: String = """{"boards": []}"""): ResultActionsDsl = mockMvc.delete("/api/me") {
        cookie(cookie)
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private fun board(owner: User, title: String, deleted: Boolean = false, workspace: UUID? = null): UUID = uuid(
        """
        INSERT INTO boards (title, owner_id, created_at, updated_at, deleted_at, workspace_id)
        VALUES (:title, :owner, now(), now(), CASE WHEN :deleted THEN now() END, :workspace) RETURNING id
        """,
        "title" to title, "owner" to owner.id, "deleted" to deleted, "workspace" to workspace,
    )

    private fun workspace(name: String, vararg members: Pair<User, String>): UUID {
        val id = uuid("INSERT INTO workspaces (name, created_at) VALUES (:name, now()) RETURNING id", "name" to name)
        for ((member, role) in members) {
            sql(
                "INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (:workspace, :user, :role, now())",
                "workspace" to id, "user" to member.id, "role" to role,
            )
        }
        return id
    }

    private fun spec(sql: String, params: Array<out Pair<String, Any?>>) =
        params.fold(jdbcClient.sql(sql)) { spec, (name, value) -> spec.param(name, value) }

    private fun sql(sql: String, vararg params: Pair<String, Any?>) {
        spec(sql, params).update()
    }

    private fun count(sql: String, vararg params: Pair<String, Any?>): Int = spec(sql, params).query(Int::class.java).single()

    private fun uuid(sql: String, vararg params: Pair<String, Any?>): UUID = spec(sql, params).query(UUID::class.java).single()

    private fun uuids(sql: String): List<UUID> = jdbcClient.sql(sql).query(UUID::class.java).list().filterNotNull()

    private fun ids(sql: String): List<UUID> = uuids(sql).sorted()
}
