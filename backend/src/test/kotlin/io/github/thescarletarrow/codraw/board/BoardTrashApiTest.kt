package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.internal.InternalTokenInterceptor
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertContentEquals

@IntegrationTest
class BoardTrashApiTest(
    @Autowired private val mvc: MockMvc,
    @Autowired private val jdbc: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val boards: BoardService,
    @Autowired private val documents: BoardDocumentService,
    @Autowired private val members: BoardMembers,
    @Autowired private val cleanup: BoardTrashCleanup,
    @Autowired private val clock: MutableClock,
    @Autowired private val limits: LimitProperties,
) {
    private lateinit var alice: User
    private lateinit var bob: User

    @BeforeEach
    fun reset() {
        jdbc.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
    }

    @Test
    fun `trash hides access and search while restoring returns the document and membership`() {
        val board = boards.create("Схема", alice.id)
        val id = checkNotNull(board.id)
        val bytes = byteArrayOf(1, 2, 3)
        members.put(id, bob.id, MemberRole.VIEWER, clock.instant())
        documents.save(id, bytes)
        jdbc.sql("UPDATE board_documents SET search_text = 'секрет' WHERE board_id = :id").param("id", id).update()
        boards.moveToTrash(board)

        mvc.get("/api/boards/trash") { with(alice.session()) }.andExpect {
            status { isOk() }; jsonPath("$[0].id") { value(id.toString()) }
            jsonPath("$[0].expiresAt") { value(clock.instant().plus(Duration.ofDays(30)).toString()) }
        }
        mvc.get("/api/boards/trash") { with(bob.session()) }.andExpect { content { json("[]") } }
        for (user in listOf(alice, bob)) {
            mvc.get("/api/boards/$id") { with(user.session()) }.andExpect { status { isNotFound() } }
            mvc.get("/api/boards/search?q=секрет") { with(user.session()) }.andExpect { content { json("[]") } }
        }
        mvc.get("/api/boards/shared") { with(bob.session()) }.andExpect { content { json("[]") } }
        mvc.get("/internal/boards/$id/access") { header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN) }
            .andExpect { status { isNotFound() } }
        assertEquals(false, documents.save(id, byteArrayOf(9)))

        mvc.post("/api/boards/trash/$id/restore") { with(alice.session()); with(csrf()) }.andExpect {
            status { isOk() }; jsonPath("$.role") { value("owner") }
        }
        assertContentEquals(bytes, (documents.load(id) as StoredDocument.State).bytes)
        mvc.get("/api/boards/$id") { with(bob.session()) }.andExpect { status { isOk() } }
        mvc.get("/api/boards/trash") { with(alice.session()) }.andExpect { content { json("[]") } }
    }

    @Test
    fun `only owner restores or permanently deletes and active boards cannot be purged`() {
        val board = boards.create("Схема", alice.id)
        val id = checkNotNull(board.id)
        mvc.delete("/api/boards/trash/$id") { with(alice.session()); with(csrf()) }.andExpect { status { isNotFound() } }
        boards.moveToTrash(board)
        mvc.post("/api/boards/trash/$id/restore") { with(bob.session()); with(csrf()) }.andExpect { status { isForbidden() } }
        mvc.delete("/api/boards/trash/$id") { with(bob.session()); with(csrf()) }.andExpect { status { isForbidden() } }
        mvc.delete("/api/boards/trash/$id") { with(alice.session()); with(csrf()) }.andExpect { status { isNoContent() } }
        mvc.post("/api/boards/trash/$id/restore") { with(alice.session()); with(csrf()) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `restore respects the active board limit and trash releases a slot`() {
        val board = boards.create("Удалённая", alice.id)
        boards.moveToTrash(board)
        repeat(limits.boardsPerUser) { boards.create("Активная $it", alice.id) }
        mvc.post("/api/boards/trash/${board.id}/restore") { with(alice.session()); with(csrf()) }.andExpect {
            status { isConflict() }; jsonPath("$.limit") { value(limits.boardsPerUser) }
        }
        boards.moveToTrash(boards.list(alice.id).first())
        mvc.post("/api/boards/trash/${board.id}/restore") { with(alice.session()); with(csrf()) }.andExpect { status { isOk() } }
    }

    @Test
    fun `expiry is enforced before cleanup and cleanup removes preserved data`() {
        val board = boards.create("Схема", alice.id)
        val id = checkNotNull(board.id)
        documents.save(id, byteArrayOf(1))
        boards.moveToTrash(board)
        clock.advance(Duration.ofDays(30))
        mvc.get("/api/boards/trash") { with(alice.session()) }.andExpect { content { json("[]") } }
        mvc.post("/api/boards/trash/$id/restore") { with(alice.session()); with(csrf()) }.andExpect { status { isNotFound() } }
        assertEquals(1, cleanup.run())
        assertEquals(0, jdbc.sql("SELECT count(*) FROM board_documents").query(Int::class.java).single())
        assertEquals(0, cleanup.run())
    }

    @Test
    fun `a stale trash record cannot purge a restored board`() {
        val board = boards.create("Схема", alice.id)
        boards.moveToTrash(board)
        val stale = checkNotNull(boards.deleted(checkNotNull(board.id)))
        boards.restore(stale)
        org.junit.jupiter.api.assertThrows<org.springframework.web.server.ResponseStatusException> { boards.purgeTrash(stale) }
        assertEquals("Схема", boards.find(board.id)?.title)
    }
}
