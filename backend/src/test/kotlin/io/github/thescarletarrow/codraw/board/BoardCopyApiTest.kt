package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.image.ImageCleanup
import io.github.thescarletarrow.codraw.image.ImageFormatsTest.Companion.encoded
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.github.thescarletarrow.codraw.workspace.WorkspaceApi
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import tools.jackson.databind.json.JsonMapper
import java.util.UUID
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@IntegrationTest
class BoardCopyApiTest(
    @Autowired private val mvc: MockMvc,
    @Autowired private val jdbc: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val boards: BoardService,
    @Autowired private val documents: BoardDocumentService,
    @Autowired private val members: BoardMembers,
    @Autowired private val organization: BoardOrganization,
    @Autowired private val imageCleanup: ImageCleanup,
    @Autowired private val clock: MutableClock,
    @Autowired private val limits: LimitProperties,
    @Autowired private val json: JsonMapper,
) {
    private val workspaces = WorkspaceApi(mvc)
    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var carol: User

    @BeforeEach
    fun reset() {
        jdbc.sql("DELETE FROM boards").update()
        jdbc.sql("DELETE FROM board_images").update()
        jdbc.sql("DELETE FROM workspaces").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
    }

    @Test
    fun `a viewer copies the document and the images, which outlive the original deleted for good`() {
        val original = boards.create("Схема", alice.id)
        val id = checkNotNull(original.id)
        boards.changeLinkAccess(original, LinkAccess.VIEW)
        members.put(id, carol.id, MemberRole.EDITOR, clock.instant())
        val file = encoded("png", 30, 20)
        val image = field(addImage(alice, id, file), "id")
        // The backend does not read the state: any bytes with the address of the image stand for a document of Yjs.
        documents.save(id, "shape:/api/boards/$id/images/$image;".toByteArray())
        jdbc.sql("UPDATE board_documents SET search_text = 'Схема платежей' WHERE board_id = :id").param("id", id).update()

        val response = copy(bob, id).andExpect {
            status { isCreated() }
            jsonPath("$.title") { value("Схема (копия)") }
            jsonPath("$.owner.id") { value(bob.id.toString()) }
            jsonPath("$.role") { value("owner") }
            jsonPath("$.workspace") { value(null) }
        }.andReturn().response
        val copy = UUID.fromString(field(response.contentAsString, "id"))
        assertEquals("/api/boards/$copy", response.getHeader("Location"))

        val copiedImage = imageIds(copy).single()
        assertTrue(copiedImage != UUID.fromString(image))
        assertEquals("shape:/api/boards/$copy/images/$copiedImage;", String(state(copy)))
        assertEquals(0, jdbc.sql("SELECT count(*) FROM board_members WHERE board_id = :id").param("id", copy).query(Int::class.java).single())
        mvc.get("/api/boards/search?q=платежей") { with(bob.session()) }.andExpect { jsonPath("$[0].boardId") { value(copy.toString()) } }

        // Changes of either do not reach the other.
        documents.save(copy, byteArrayOf(9))
        assertEquals("shape:/api/boards/$id/images/$image;", String(state(id)))

        boards.moveToTrash(checkNotNull(boards.find(id)))
        mvc.delete("/api/boards/trash/$id") { with(alice.session()); with(csrf()) }.andExpect { status { isNoContent() } }
        imageCleanup.cleanUp()
        val bytes = mvc.get("/api/boards/$copy/images/$copiedImage") { with(bob.session()) }
            .andExpect { status { isOk() } }.andReturn().response.contentAsByteArray
        assertContentEquals(file, bytes)
    }

    @Test
    fun `a board never stored is copied empty, and a title too long for the suffix is shortened`() {
        val original = boards.create("Д".repeat(200), alice.id)

        val copy = UUID.fromString(field(copy(alice, checkNotNull(original.id)).andExpect { status { isCreated() } }, "id"))

        assertEquals("Д".repeat(192) + " (копия)", checkNotNull(boards.find(copy)).title)
        assertEquals(StoredDocument.Empty, documents.load(copy))
    }

    @Test
    fun `the copy names itself in the language of the user`() {
        val original = boards.create("Payments", alice.id)

        mvc.post("/api/boards/${original.id}/copy") {
            with(alice.session())
            with(csrf())
            header("Accept-Language", "en-US,en;q=0.9")
        }.andExpect {
            status { isCreated() }
            jsonPath("$.title") { value("Payments (copy)") }
        }
    }

    @Test
    fun `without a role on the board, or for a board in the trash, there is no copy`() {
        val original = boards.create("Схема", alice.id)
        boards.changeLinkAccess(original, LinkAccess.NONE)

        copy(bob, checkNotNull(original.id)).andExpect { status { isForbidden() } }
        boards.moveToTrash(original)
        copy(alice, checkNotNull(original.id)).andExpect { status { isNotFound() } }
        copy(alice, UUID.randomUUID()).andExpect { status { isNotFound() } }
        assertEquals(listOf(original.id), jdbc.sql("SELECT id FROM boards").query(UUID::class.java).list())
    }

    @Test
    fun `a copy counts against the limit of boards of the user who copies`() {
        val original = boards.create("Схема", alice.id)
        repeat(limits.boardsPerUser) { boards.create("Доска $it", bob.id) }

        copy(bob, checkNotNull(original.id)).andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Board limit reached") }
            jsonPath("$.limit") { value(limits.boardsPerUser) }
        }
        assertEquals(limits.boardsPerUser, boards.list(bob.id).size)
    }

    @Test
    fun `images beyond the room of a board are not copied, and an image the storage lost is left out`() {
        val original = boards.create("Схема", alice.id)
        val id = checkNotNull(original.id)
        // A row without an object in the storage: the storage lost its bytes.
        insertImage(id, 10)

        val copy = UUID.fromString(field(copy(alice, id).andExpect { status { isCreated() } }, "id"))
        assertEquals(emptyList(), imageIds(copy))

        insertImage(id, limits.imagesSizePerBoard.toBytes())
        copy(alice, id).andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Image quota reached") }
        }
        assertEquals(2, boards.list(alice.id).size)
    }

    @Test
    fun `an editor of the workspace copies into its project, anybody else into their own boards`() {
        val workspace = workspaces.workspace(alice)
        val project = field(workspaces.createProject(alice, workspace, "Платежи").andExpect { status { isCreated() } }, "id")
        val board = workspaces.newBoard(alice, workspace, "Схема", project)
        workspaces.join(alice, workspace, bob, "editor")
        workspaces.join(alice, workspace, carol, "viewer")

        copy(bob, UUID.fromString(board)).andExpect {
            status { isCreated() }
            jsonPath("$.workspace.id") { value(workspace) }
            jsonPath("$.projectId") { value(project) }
            jsonPath("$.linkAccess") { value("none") }
            jsonPath("$.owner.id") { value(bob.id.toString()) }
        }
        copy(carol, UUID.fromString(board)).andExpect {
            status { isCreated() }
            jsonPath("$.workspace") { value(null) }
            jsonPath("$.projectId") { value(null) }
        }
    }

    @Test
    fun `the copy is in the folder of the user and has their tags of the original`() {
        val original = boards.create("Схема", alice.id)
        val id = checkNotNull(original.id)
        val folder = organization.addFolder(alice.id, "Архитектура", clock.instant())
        organization.place(alice.id, id, folder.id)
        organization.setTags(alice.id, id, listOf("платежи", "черновик"))
        organization.setTags(bob.id, id, listOf("чужой"))

        val copy = UUID.fromString(field(copy(alice, id).andExpect { status { isCreated() } }, "id"))

        assertEquals(folder.id, organization.of(alice.id).folderOf(copy))
        assertEquals(listOf("платежи", "черновик"), organization.tagsOf(alice.id, copy))
        assertFalse(organization.users(copy).contains(bob.id))
    }

    private fun copy(user: User, board: UUID): ResultActionsDsl = mvc.post("/api/boards/$board/copy") {
        with(user.session())
        with(csrf())
    }

    private fun addImage(user: User, board: UUID, bytes: ByteArray): ResultActionsDsl = mvc.post("/api/boards/$board/images") {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_OCTET_STREAM
        content = bytes
    }.andExpect { status { isCreated() } }

    private fun insertImage(board: UUID, size: Long) {
        jdbc.sql(
            """
            INSERT INTO board_images (board_id, sha256, content_type, size, width, height, created_at)
            VALUES (:board, :sha256, 'image/png', :size, 1, 1, now())
            """,
        )
            .param("board", board)
            .param("sha256", ByteArray(32) { size.toByte() })
            .param("size", size)
            .update()
    }

    private fun imageIds(board: UUID): List<UUID> =
        jdbc.sql("SELECT id FROM board_images WHERE board_id = :board").param("board", board).query(UUID::class.java).list().filterNotNull()

    private fun state(board: UUID): ByteArray = (documents.load(board) as StoredDocument.State).bytes

    private fun field(result: ResultActionsDsl, name: String): String = field(result.andReturn().response.contentAsString, name)

    private fun field(body: String, name: String): String = json.readTree(body)[name].asString()
}
