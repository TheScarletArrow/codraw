package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.matchesPattern
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.Duration
import kotlin.test.assertEquals

@IntegrationTest
class BoardOrganizationApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
) {

    private val unknownBoard = "0199a000-0000-7000-8000-000000000000"
    private lateinit var alice: User
    private lateinit var bob: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM board_folders").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
    }

    @Test
    fun `tags of a board are trimmed, once regardless of case and listed with the board`() {
        val board = createBoard(alice)

        setTags(board, alice, """["  Бэкенд ", "бэкенд", "Архив", "Два   слова"]""").andExpect {
            status { isOk() }
            jsonPath("$.tags") { value(contains("Бэкенд", "Архив", "Два слова")) }
        }

        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect {
            jsonPath("$[0].tags") { value(containsInAnyOrder("Бэкенд", "Архив", "Два слова")) }
            jsonPath("$[0].folderId") { value(nullValue()) }
        }
        setTags(board, alice, "[]").andExpect { jsonPath("$.tags") { value(empty<Any>()) } }
        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect { jsonPath("$[0].tags") { value(empty<Any>()) } }
    }

    @Test
    fun `a tag that the user has on another board is written as there`() {
        val first = createBoard(alice)
        val second = createBoard(alice)
        setTags(first, alice, """["API"]""")

        setTags(second, alice, """["api", "Новый"]""").andExpect { jsonPath("$.tags") { value(contains("API", "Новый")) } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["""{"tags": [""]}""", """{"tags": ["   "]}""", """{"tags": [null]}""", """{}"""])
    fun `rejects a missing or blank tag`(body: String) {
        val board = createBoard(alice)

        mockMvc.put("/api/boards/$board/tags") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a tag has at most 30 characters`() {
        val board = createBoard(alice)

        setTags(board, alice, """["${"я".repeat(31)}"]""").andExpect { status { isBadRequest() } }
        setTags(board, alice, """["${"я".repeat(30)}"]""").andExpect { status { isOk() } }
    }

    @Test
    fun `a participant tags a shared board for themselves, and neither sees the tags of the other`() {
        val board = createBoard(alice)
        open(board, bob)

        setTags(board, alice, """["Срочно"]""").andExpect { status { isOk() } }
        setTags(board, bob, """["Моё"]""").andExpect { status { isOk() } }

        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect {
            jsonPath("$[0].tags") { value(contains("Срочно")) }
        }
        mockMvc.get("/api/boards/shared") { with(bob.session()) }.andExpect {
            jsonPath("$[0].id") { value(board) }
            jsonPath("$[0].tags") { value(contains("Моё")) }
            jsonPath("$[0].folderId") { value(nullValue()) }
        }
    }

    @Test
    fun `boards that are not in the list of the user cannot be tagged or put into folders`() {
        val board = createBoard(alice)
        val folder = createFolder(bob, "Чужие")

        // Bob never opened it.
        setTags(board, bob, """["Моё"]""").andExpect { status { isForbidden() } }
        place(board, bob, folder).andExpect { status { isForbidden() } }
        // Its owner closed its link after Bob opened it.
        open(board, bob)
        changeLinkAccess(board, "none")
        setTags(board, bob, """["Моё"]""").andExpect { status { isForbidden() } }
        place(board, bob, folder).andExpect { status { isForbidden() } }
        setTags(unknownBoard, bob, """["Моё"]""").andExpect { status { isNotFound() } }
        setTags("not-a-uuid", bob, """["Моё"]""").andExpect { status { isNotFound() } }
        assertEquals(0, count("board_tags"))
        assertEquals(0, count("board_placements"))
    }

    @Test
    fun `a member tags a board even when its link is closed`() {
        val board = createBoard(alice)
        open(board, bob)
        addMember(board, bob, "viewer")
        changeLinkAccess(board, "none")

        setTags(board, bob, """["Читаю"]""").andExpect { status { isOk() } }
    }

    @Test
    fun `folders are created trimmed, listed by name and named once regardless of case`() {
        createFolder(alice, "Работа")
        mockMvc.post("/api/boards/folders") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"name": "  Архив  "}"""
        }.andExpect {
            status { isCreated() }
            header { string("Location", matchesPattern("/api/boards/folders/[0-9a-f-]{36}")) }
            jsonPath("$.name") { value("Архив") }
        }

        folderRequest(alice, "работа").andExpect {
            status { isConflict() }
            jsonPath("$.title") { value("Folder name taken") }
        }
        folderRequest(alice, "   ").andExpect { status { isBadRequest() } }
        folderRequest(alice, "я".repeat(61)).andExpect { status { isBadRequest() } }
        // Names are per user.
        folderRequest(bob, "Работа").andExpect { status { isCreated() } }

        mockMvc.get("/api/boards/folders") { with(alice.session()) }.andExpect {
            jsonPath("$[*].name") { value(contains("Архив", "Работа")) }
        }
    }

    @Test
    fun `a folder is renamed, to the same name in another case too, but not to the name of another folder`() {
        val work = createFolder(alice, "Работа")
        createFolder(alice, "Архив")

        renameFolder(work, alice, "РАБОТА").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(work) }
            jsonPath("$.name") { value("РАБОТА") }
        }
        renameFolder(work, alice, " архив ").andExpect { status { isConflict() } }
        renameFolder(work, alice, "").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a board goes into one folder of the user at a time, and out of it`() {
        val board = createBoard(alice)
        val work = createFolder(alice, "Работа")
        val archive = createFolder(alice, "Архив")

        place(board, alice, work).andExpect { status { isNoContent() } }
        place(board, alice, archive).andExpect { status { isNoContent() } }
        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect { jsonPath("$[0].folderId") { value(archive) } }

        place(board, alice, null).andExpect { status { isNoContent() } }
        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect { jsonPath("$[0].folderId") { value(nullValue()) } }
    }

    @Test
    fun `the folders of another user do not exist for the user`() {
        val board = createBoard(alice)
        val foreign = createFolder(bob, "Чужая")

        place(board, alice, foreign).andExpect { status { isNotFound() } }
        renameFolder(foreign, alice, "Моя").andExpect { status { isNotFound() } }
        mockMvc.delete("/api/boards/folders/$foreign") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNotFound() } }
        mockMvc.delete("/api/boards/folders/not-a-uuid") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNotFound() } }
        mockMvc.get("/api/boards/folders") { with(alice.session()) }.andExpect { content { json("[]") } }
    }

    @Test
    fun `deleting a folder keeps its boards, in no folder`() {
        val first = createBoard(alice)
        val second = createBoard(alice)
        val work = createFolder(alice, "Работа")
        place(first, alice, work)
        place(second, alice, work)

        mockMvc.delete("/api/boards/folders/$work") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect {
            jsonPath("$.length()") { value(2) }
            jsonPath("$[*].folderId") { value(contains(nullValue(), nullValue())) }
        }
    }

    @Test
    fun `the own list tells when the user was last on each board`() {
        val opened = createBoard(alice)
        clock.advance(Duration.ofMinutes(1))
        val other = createBoard(alice)
        mockMvc.post("/api/boards/$opened/visit") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isOk() } }

        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect {
            jsonPath("$[0].id") { value(other) }
            jsonPath("$[0].openedAt") { value(nullValue()) }
            jsonPath("$[1].id") { value(opened) }
            jsonPath("$[1].openedAt") { value(clock.instant().toString()) }
        }
    }

    @Test
    fun `a user who loses access to a shared board loses their tags and folder of it`() {
        val board = createBoard(alice)
        open(board, bob)
        setTags(board, bob, """["Моё"]""")
        place(board, bob, createFolder(bob, "Чужие"))
        setTags(board, alice, """["Своё"]""")

        changeLinkAccess(board, "none")
        assertEquals(1, count("board_tags"))
        assertEquals(0, count("board_placements"))

        // The link opens again, but the board forgot Bob.
        changeLinkAccess(board, "view")
        mockMvc.get("/api/boards/shared") { with(bob.session()) }.andExpect {
            jsonPath("$[0].id") { value(board) }
            jsonPath("$[0].tags") { value(empty<Any>()) }
            jsonPath("$[0].folderId") { value(nullValue()) }
        }
    }

    @Test
    fun `a removed member loses their tags of a board whose link gives them nothing, and keeps them while it does`() {
        val closed = createBoard(alice)
        val open = createBoard(alice)
        for (board in listOf(closed, open)) {
            open(board, bob)
            addMember(board, bob, "editor")
            setTags(board, bob, """["Моё"]""")
        }
        changeLinkAccess(closed, "none")

        for (board in listOf(closed, open)) {
            mockMvc.delete("/api/boards/$board/members/${bob.id}") {
                with(alice.session())
                with(csrf())
            }.andExpect { status { isNoContent() } }
        }

        assertEquals(listOf(open), jdbcClient.sql("SELECT board_id::text FROM board_tags").query(String::class.java).list())
    }

    @Test
    fun `tags and folders of a deleted board go, and the folders stay`() {
        val board = createBoard(alice)
        open(board, bob)
        setTags(board, alice, """["Своё"]""")
        setTags(board, bob, """["Моё"]""")
        place(board, alice, createFolder(alice, "Работа"))
        place(board, bob, createFolder(bob, "Чужие"))

        mockMvc.delete("/api/boards/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        assertEquals(0, count("board_tags"))
        assertEquals(0, count("board_placements"))
        assertEquals(2, count("board_folders"))
    }

    @Test
    fun `a guest who signs in passes their folders and tags, which merge with those of the account`() {
        val dave = users.gitHubUser("Dave")
        val work = createFolder(dave, "Работа")
        val owned = createBoard(dave)
        setTags(owned, dave, """["API"]""")
        val guest = users.createGuest()
        val guestBoard = createBoard(guest)
        val shared = createBoard(alice)
        open(shared, guest)
        open(shared, dave)
        place(shared, dave, work)
        setTags(guestBoard, guest, """["api", "Черновик"]""")
        place(guestBoard, guest, createFolder(guest, "работа"))
        place(shared, guest, createFolder(guest, "Идеи"))
        setTags(shared, guest, """["Чужое"]""")

        users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Dave", "Dave", null), guest.id)

        mockMvc.get("/api/boards/folders") { with(dave.session()) }.andExpect {
            jsonPath("$[*].name") { value(contains("Идеи", "Работа")) }
        }
        mockMvc.get("/api/boards") { with(dave.session()) }.andExpect {
            jsonPath("$[?(@.id == '$guestBoard')].folderId") { value(contains(work)) }
            jsonPath("$[?(@.id == '$guestBoard')].tags[*]") { value(containsInAnyOrder("API", "Черновик")) }
        }
        // Dave put the shared board into a folder before: it stays there.
        mockMvc.get("/api/boards/shared") { with(dave.session()) }.andExpect {
            jsonPath("$[0].id") { value(shared) }
            jsonPath("$[0].folderId") { value(work) }
            jsonPath("$[0].tags") { value(contains("Чужое")) }
        }
        assertEquals(
            0,
            jdbcClient.sql("SELECT count(*) FROM board_folders WHERE user_id = :id").param("id", guest.id)
                .query(Int::class.java).single(),
        )
        assertEquals(
            0,
            jdbcClient.sql("SELECT count(*) FROM board_tags WHERE user_id = :id").param("id", guest.id)
                .query(Int::class.java).single(),
        )
    }

    @Test
    fun `changes of tags and folders require the CSRF token`() {
        val board = createBoard(alice)

        mockMvc.put("/api/boards/$board/tags") {
            with(alice.session())
            contentType = MediaType.APPLICATION_JSON
            content = """{"tags": ["Тег"]}"""
        }.andExpect { status { isForbidden() } }
        mockMvc.post("/api/boards/folders") {
            with(alice.session())
            contentType = MediaType.APPLICATION_JSON
            content = """{"name": "Папка"}"""
        }.andExpect { status { isForbidden() } }
    }

    private fun setTags(board: String, user: User, tags: String): ResultActionsDsl =
        mockMvc.put("/api/boards/$board/tags") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"tags": $tags}"""
        }

    private fun place(board: String, user: User, folder: String?): ResultActionsDsl =
        mockMvc.put("/api/boards/$board/folder") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"folderId": ${folder?.let { "\"$it\"" }}}"""
        }

    private fun folderRequest(user: User, name: String): ResultActionsDsl = mockMvc.post("/api/boards/folders") {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"name": "$name"}"""
    }

    private fun createFolder(user: User, name: String): String {
        val response = folderRequest(user, name).andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    private fun renameFolder(folder: String, user: User, name: String): ResultActionsDsl =
        mockMvc.patch("/api/boards/folders/$folder") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"name": "$name"}"""
        }

    private fun changeLinkAccess(board: String, access: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$access"}"""
        }.andExpect { status { isOk() } }
    }

    private fun addMember(board: String, user: User, role: String) {
        mockMvc.put("/api/boards/$board/members/${user.id}") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "$role"}"""
        }.andExpect { status { isOk() } }
    }

    private fun open(board: String, user: User) {
        mockMvc.get("/api/boards/$board") { with(user.session()) }.andExpect { status { isOk() } }
    }

    private fun count(table: String) = jdbcClient.sql("SELECT count(*) FROM $table").query(Int::class.java).single()

    private fun createBoard(owner: User): String {
        val response = mockMvc.post("/api/boards") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Доска"}"""
        }.andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }
}
