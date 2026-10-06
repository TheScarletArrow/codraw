package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.internal.BoardDocumentController
import io.github.thescarletarrow.codraw.internal.InternalTokenInterceptor
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.ProviderProfile
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.hasSize
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
import java.util.UUID
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals

@IntegrationTest
class BoardVersionApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val members: BoardMembers,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var carol: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
    }

    @Test
    fun `the first stored document of a board makes no version`() {
        val board = createBoard()

        store(board, byteArrayOf(1))

        assertEquals(0, versionCount(board))
    }

    @Test
    fun `a change after a pause keeps the document from before it as a version`() {
        val board = createBoard()
        store(board, byteArrayOf(1, 1))
        clock.advance(Duration.ofHours(1))
        val changedAt = clock.instant()

        store(board, byteArrayOf(2))

        versions(board, alice).andExpect {
            jsonPath("$") { value(hasSize<Any>(1)) }
            jsonPath("$[0].reason") { value("auto") }
            jsonPath("$[0].createdAt") { value(changedAt.toString()) }
        }
        assertContentEquals(byteArrayOf(1, 1), versionState(board, onlyVersion(board)))
    }

    @Test
    fun `continuous work makes a version at least every 10 minutes, not on every change`() {
        val board = createBoard()

        repeat(31) { minute ->
            store(board, byteArrayOf(minute.toByte()))
            clock.advance(Duration.ofMinutes(1))
        }

        // Stores at minutes 0 to 30: the first has nothing to keep, then versions at minutes 1, 11 and 21.
        val states = versionIds(board).map { versionState(board, it).single().toInt() }
        assertEquals(listOf(20, 10, 0), states)
    }

    @Test
    fun `a board keeps its 100 most recent versions`() {
        val board = createBoard()
        val first = save(board, byteArrayOf(0), "manual")
        repeat(100) { index ->
            clock.advance(Duration.ofSeconds(1))
            save(board, byteArrayOf((index + 1).toByte()), "manual")
        }

        val ids = versionIds(board)
        assertEquals(100, ids.size)
        assertEquals(false, first in ids)
    }

    @Test
    fun `the owner lists the versions most recent first`() {
        val board = createBoard()
        val older = save(board, byteArrayOf(1), "manual")
        clock.advance(Duration.ofHours(1))
        val newer = save(board, byteArrayOf(2), "restore")

        versions(board, alice).andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(newer) }
            jsonPath("$[0].reason") { value("restore") }
            jsonPath("$[0].createdAt") { value(clock.instant().toString()) }
            jsonPath("$[0].name") { value(nullValue()) }
            jsonPath("$[0].authors") { value(empty<Any>()) }
            jsonPath("$[1].id") { value(older) }
            jsonPath("$[1].reason") { value("manual") }
        }
    }

    @Test
    fun `the owner gets the state of a version`() {
        val board = createBoard()
        val version = save(board, byteArrayOf(7, 0, -1), "manual")

        mockMvc.get("/api/boards/$board/versions/$version") { with(alice.session()) }.andExpect {
            status { isOk() }
            content { contentType(MediaType.APPLICATION_OCTET_STREAM) }
        }
        assertContentEquals(byteArrayOf(7, 0, -1), versionState(board, version))
    }

    @Test
    fun `a version of another board or an unknown version is not found`() {
        val board = createBoard()
        val other = createBoard()
        val versionOfOther = save(other, byteArrayOf(1), "manual")

        mockMvc.get("/api/boards/$board/versions/$versionOfOther") { with(alice.session()) }
            .andExpect { status { isNotFound() } }
        mockMvc.get("/api/boards/$board/versions/not-a-uuid") { with(alice.session()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `nobody who only views the board sees or saves versions`() {
        val board = createBoard()
        val version = save(board, byteArrayOf(1), "manual")
        changeLinkAccess(board, "view")

        versions(board, bob).andExpect { status { isForbidden() } }
        mockMvc.get("/api/boards/$board/versions/$version") { with(bob.session()) }
            .andExpect { status { isForbidden() } }
        post(board, bob, byteArrayOf(2), "manual").andExpect { status { isForbidden() } }
        rename(board, version, bob, "Моя").andExpect { status { isForbidden() } }
        assertEquals(1, versionCount(board))
        versions(board, alice).andExpect { jsonPath("$[0].name") { value(nullValue()) } }
    }

    @Test
    fun `a version names those who changed the board since the version before, in the order of their first change`() {
        val board = createBoard()
        store(board, byteArrayOf(1), bob)
        clock.advance(Duration.ofMinutes(1))
        // The first change after the first store keeps that store as a version; Alice starts the next one.
        store(board, byteArrayOf(2), alice)
        clock.advance(Duration.ofMinutes(1))
        store(board, byteArrayOf(3), bob, alice)
        clock.advance(Duration.ofHours(1))

        // The document from before this store becomes a version; Carol's change is in the stored document, not in it.
        store(board, byteArrayOf(4), carol)
        clock.advance(Duration.ofMinutes(1))
        save(board, byteArrayOf(5), "manual")
        clock.advance(Duration.ofMinutes(1))
        save(board, byteArrayOf(6), "restore")

        versions(board, alice).andExpect {
            jsonPath("$[*].reason") { value(contains("restore", "manual", "auto", "auto")) }
            jsonPath("$[0].authors") { value(empty<Any>()) }
            jsonPath("$[1].authors[*].name") { value(contains("Carol")) }
            jsonPath("$[2].authors[*].name") { value(contains("Alice", "Bob")) }
            jsonPath("$[2].authors[0].id") { value(alice.id.toString()) }
            jsonPath("$[2].authors[0].avatarUrl") { value("https://avatars.example.com/Alice.png") }
            jsonPath("$[3].authors[*].name") { value(contains("Bob")) }
        }
        assertEquals(listOf(1, 3, 5, 6), versionIds(board).reversed().map { versionState(board, it).single().toInt() })
    }

    @Test
    fun `a store after an automatic version starts the authors of the next one anew`() {
        val board = createBoard()
        store(board, byteArrayOf(1), alice)
        clock.advance(Duration.ofHours(1))
        store(board, byteArrayOf(2), bob)

        clock.advance(Duration.ofHours(1))
        store(board, byteArrayOf(3))

        versions(board, alice).andExpect {
            jsonPath("$[0].authors[*].name") { value(contains("Bob")) }
            jsonPath("$[1].authors[*].name") { value(contains("Alice")) }
        }
    }

    @Test
    fun `authors who are gone are left out, and the changes of a guest pass to the account they sign in with`() {
        val board = createBoard()
        val guest = users.createGuest()
        val gone = users.createGuest()
        store(board, byteArrayOf(1), guest, gone)
        save(board, byteArrayOf(1), "manual")
        clock.advance(Duration.ofMinutes(1))
        store(board, byteArrayOf(2), carol, guest)

        jdbcClient.sql("DELETE FROM users WHERE id = :id").param("id", gone.id).update()
        users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Carol", "Carol", null), guest.id)
        save(board, byteArrayOf(2), "manual")

        versions(board, alice).andExpect {
            // Carol changed the board both as herself and as the guest: she shows once.
            jsonPath("$[0].authors[*].name") { value(contains("Carol")) }
            jsonPath("$[1].authors[*].name") { value(contains("Carol")) }
        }
    }

    @Test
    fun `the owner saves a version with a name`() {
        val board = createBoard()

        post(board, alice, byteArrayOf(1), "manual", name = "  Схема v1 ").andExpect {
            status { isCreated() }
            jsonPath("$.name") { value("Схема v1") }
        }
        post(board, alice, byteArrayOf(2), "manual", name = " ").andExpect {
            status { isCreated() }
            jsonPath("$.name") { value(nullValue()) }
        }

        versions(board, alice).andExpect { jsonPath("$[*].name") { value(contains(null, "Схема v1")) } }
    }

    @Test
    fun `the owner renames a version and takes its name away`() {
        val board = createBoard()
        val version = save(board, byteArrayOf(1), "manual")

        rename(board, version, alice, "Схема v2").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(version) }
            jsonPath("$.name") { value("Схема v2") }
            jsonPath("$.reason") { value("manual") }
        }
        versions(board, alice).andExpect { jsonPath("$[0].name") { value("Схема v2") } }

        rename(board, version, alice, "").andExpect { jsonPath("$.name") { value(nullValue()) } }
        rename(board, version, alice, "Снова").andExpect { status { isOk() } }
        rename(board, version, alice, null).andExpect { jsonPath("$.name") { value(nullValue()) } }
    }

    @Test
    fun `rejects a name longer than 100 characters`() {
        val board = createBoard()
        val version = save(board, byteArrayOf(1), "manual", name = "Релиз")

        post(board, alice, byteArrayOf(2), "manual", name = "я".repeat(101)).andExpect { status { isBadRequest() } }
        rename(board, version, alice, "я".repeat(101)).andExpect { status { isBadRequest() } }
        rename(board, version, alice, "я".repeat(100)).andExpect { status { isOk() } }

        assertEquals(1, versionCount(board))
    }

    @Test
    fun `renaming a version of another board or an unknown version is not found`() {
        val board = createBoard()
        val versionOfOther = save(createBoard(), byteArrayOf(1), "manual")

        rename(board, versionOfOther, alice, "Чужая").andExpect { status { isNotFound() } }
        rename(board, "not-a-uuid", alice, "Чужая").andExpect { status { isNotFound() } }
    }

    @Test
    fun `a board keeps its versions with a name longer than those without`() {
        val board = createBoard()
        val named = listOf(save(board, byteArrayOf(0), "manual", name = "Релиз 1"), save(board, byteArrayOf(0), "manual", name = "Релиз 2"))
        clock.advance(Duration.ofSeconds(1))
        val oldestUnnamed = save(board, byteArrayOf(1), "manual")
        repeat(97) {
            clock.advance(Duration.ofSeconds(1))
            save(board, byteArrayOf(2), "manual")
        }

        clock.advance(Duration.ofSeconds(1))
        save(board, byteArrayOf(3), "manual")

        val ids = versionIds(board)
        assertEquals(100, ids.size)
        assertEquals(false, oldestUnnamed in ids)
        assertEquals(true, ids.containsAll(named))
    }

    @Test
    fun `whoever edits the board sees, saves, names and restores versions, a member when the link is closed too`() {
        val board = createBoard()
        val version = save(board, byteArrayOf(1), "manual")

        // Editing through the link.
        versions(board, bob).andExpect {
            status { isOk() }
            jsonPath("$[*].id") { value(hasSize<Any>(1)) }
        }
        rename(board, version, bob, "Схема v1").andExpect { jsonPath("$.name") { value("Схема v1") } }

        changeLinkAccess(board, "none")
        versions(board, bob).andExpect { status { isForbidden() } }
        rename(board, version, bob, "Схема v2").andExpect { status { isForbidden() } }
        members.put(UUID.fromString(board), bob.id, MemberRole.EDITOR, clock.instant())
        mockMvc.get("/api/boards/$board/versions/$version") { with(bob.session()) }.andExpect { status { isOk() } }
        post(board, bob, byteArrayOf(2), "restore").andExpect { status { isCreated() } }
        post(board, bob, byteArrayOf(3), "manual", name = "Схема v2").andExpect { jsonPath("$.name") { value("Схема v2") } }
        rename(board, version, bob, "").andExpect { jsonPath("$.name") { value(nullValue()) } }
        assertEquals(3, versionCount(board))
    }

    @Test
    fun `a guest who is a member passes both the membership and the changes that versions name to their account`() {
        val board = createBoard()
        changeLinkAccess(board, "none")
        val guest = users.createGuest()
        members.put(UUID.fromString(board), guest.id, MemberRole.EDITOR, clock.instant())
        store(board, byteArrayOf(1), guest)
        save(board, byteArrayOf(1), "manual")

        val account = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Dave", "Dave", null), guest.id)

        assertEquals(MemberRole.EDITOR, members.roleOf(UUID.fromString(board), account.id))
        versions(board, account).andExpect {
            status { isOk() }
            jsonPath("$[0].authors[*].name") { value(contains("Dave")) }
        }
    }

    @Test
    fun `versions of an unknown board are not found`() {
        versions("0199a000-0000-7000-8000-000000000000", alice).andExpect { status { isNotFound() } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["auto", "proposal", "MANUAL", ""])
    fun `rejects other reasons`(reason: String) {
        val board = createBoard()

        post(board, alice, byteArrayOf(1), reason).andExpect { status { isBadRequest() } }

        assertEquals(0, versionCount(board))
    }

    @Test
    fun `rejects an empty state`() {
        val board = createBoard()

        post(board, alice, byteArrayOf(), "manual").andExpect { status { isBadRequest() } }

        assertEquals(0, versionCount(board))
    }

    @Test
    fun `versions go with their board`() {
        val board = createBoard()
        save(board, byteArrayOf(1), "manual")

        mockMvc.delete("/api/boards/$board") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM board_versions").query(Int::class.java).single())
    }

    /** Stores the document as collab does, with the users who changed it since the previous store. */
    private fun store(board: String, state: ByteArray, vararg editors: User) {
        mockMvc.put("/internal/boards/$board/document") {
            header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
            if (editors.isNotEmpty()) header(BoardDocumentController.EDITORS_HEADER, editors.joinToString(", ") { it.id.toString() })
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = state
        }.andExpect { status { isNoContent() } }
    }

    private fun post(board: String, user: User, state: ByteArray, reason: String, name: String? = null): ResultActionsDsl =
        mockMvc.post("/api/boards/$board/versions") {
            with(user.session())
            with(csrf())
            param("reason", reason)
            if (name != null) param("name", name)
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = state
        }

    /** Saves a version as the owner and returns its id. */
    private fun save(board: String, state: ByteArray, reason: String, name: String? = null): String {
        val response = post(board, alice, state, reason, name).andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    private fun changeLinkAccess(board: String, linkAccess: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$linkAccess"}"""
        }.andExpect { status { isOk() } }
    }

    private fun rename(board: String, version: String, user: User, name: String?): ResultActionsDsl =
        mockMvc.patch("/api/boards/$board/versions/$version") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = if (name == null) """{"name": null}""" else """{"name": "$name"}"""
        }

    private fun versions(board: String, user: User): ResultActionsDsl =
        mockMvc.get("/api/boards/$board/versions") { with(user.session()) }

    private fun versionIds(board: String): List<String> = jdbcClient.sql(
        "SELECT id::text FROM board_versions WHERE board_id = :board::uuid ORDER BY created_at DESC, id DESC",
    ).param("board", board).query(String::class.java).list().filterNotNull()

    private fun onlyVersion(board: String): String = versionIds(board).single()

    private fun versionCount(board: String) = versionIds(board).size

    private fun versionState(board: String, version: String): ByteArray =
        mockMvc.get("/api/boards/$board/versions/$version") { with(alice.session()) }
            .andExpect { status { isOk() } }
            .andReturn().response.contentAsByteArray

    private fun createBoard(): String {
        val response = mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Доска"}"""
        }.andExpect { status { isCreated() } }.andReturn().response

        return response.getHeader("Location")!!.substringAfterLast('/')
    }
}
