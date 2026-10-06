package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.internal.InternalTokenInterceptor
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.hasSize
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
import java.util.UUID
import kotlin.test.assertEquals

@IntegrationTest
class BoardApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val boards: BoardService,
    @Autowired private val members: BoardMembers,
) {

    private val uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    private lateinit var alice: User
    private lateinit var bob: User

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
    }

    @Test
    fun `creates a board with a valid title`() {
        mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Архитектура"}"""
        }.andExpect {
            status { isCreated() }
            header { string("Location", matchesPattern("/api/boards/$uuidPattern")) }
            jsonPath("$.id") { value(matchesPattern(uuidPattern)) }
            jsonPath("$.title") { value("Архитектура") }
            jsonPath("$.createdAt") { value(clock.instant().toString()) }
            jsonPath("$.owner.id") { value(alice.id.toString()) }
            jsonPath("$.role") { value("owner") }
        }
    }

    @Test
    fun `makes the creator the owner of the board`() {
        val id = createBoard("Своя", alice)

        val owner = jdbcClient.sql("SELECT owner_id FROM boards WHERE id = :id::uuid").param("id", id)
            .query(String::class.java).single()
        assertEquals(alice.id.toString(), owner)
        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect {
            jsonPath("$[*].id") { value(contains(id)) }
        }
    }

    @Test
    fun `trims the title`() {
        mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "  Схема  "}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.title") { value("Схема") }
        }
    }

    @ParameterizedTest
    @ValueSource(strings = ["""{"title": ""}""", """{"title": "   "}""", """{}""", """{"title": null}"""])
    fun `rejects a missing or blank title`(body: String) {
        assertBadRequest(body)
    }

    @Test
    fun `rejects a title longer than 200 characters`() {
        assertBadRequest("""{"title": "${"a".repeat(201)}"}""")
    }

    @Test
    fun `accepts a title of exactly 200 characters`() {
        mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "${"a".repeat(200)}"}"""
        }.andExpect { status { isCreated() } }
    }

    @Test
    fun `lists recently changed boards first`() {
        val first = createBoard("A", alice)
        clock.advance(Duration.ofMinutes(1))
        val second = createBoard("B", alice)

        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].id") { value(second) }
            jsonPath("$[1].id") { value(first) }
        }
    }

    @Test
    fun `returns an empty list when the user has no boards`() {
        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect {
            status { isOk() }
            content { json("[]") }
        }
    }

    @Test
    fun `does not list boards of other users`() {
        createBoard("Доска Алисы", alice)
        val bobBoard = createBoard("Доска Боба", bob)

        mockMvc.get("/api/boards") { with(bob.session()) }.andExpect {
            status { isOk() }
            jsonPath("$[*].id") { value(contains(bobBoard)) }
        }
    }

    @Test
    fun `returns an own board`() {
        val id = createBoard("Сеть", alice)

        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(id) }
            jsonPath("$.title") { value("Сеть") }
            jsonPath("$.createdAt") { value(clock.instant().toString()) }
            jsonPath("$.updatedAt") { value(clock.instant().toString()) }
        }
    }

    @Test
    fun `returns a board of another user by its id, as a link gives access`() {
        val id = createBoard("Доска Алисы", alice)

        mockMvc.get("/api/boards/$id") { with(bob.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Доска Алисы") }
        }
        mockMvc.get("/api/boards") { with(bob.session()) }.andExpect { content { json("[]") } }
    }

    @Test
    fun `returns the owner of a board and the role of the user who asks`() {
        val id = createBoard("Доска Алисы", alice)

        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect {
            jsonPath("$.owner.id") { value(alice.id.toString()) }
            jsonPath("$.owner.name") { value("Alice") }
            jsonPath("$.owner.avatarUrl") { value("https://avatars.example.com/Alice.png") }
            jsonPath("$.role") { value("owner") }
        }
        mockMvc.get("/api/boards/$id") { with(bob.session()) }.andExpect {
            jsonPath("$.owner.id") { value(alice.id.toString()) }
            jsonPath("$.owner.name") { value("Alice") }
            jsonPath("$.role") { value("editor") }
        }
    }

    @Test
    fun `a new board is editable through its link`() {
        mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Доска"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.linkAccess") { value("edit") }
        }
    }

    @Test
    fun `the link access sets the role of other users, and the owner stays the owner`() {
        val id = createBoard("Доска Алисы", alice)

        changeLinkAccess(id, alice, "view").andExpect { status { isOk() } }

        mockMvc.get("/api/boards/$id") { with(bob.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.role") { value("viewer") }
            jsonPath("$.linkAccess") { value("view") }
        }
        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect { jsonPath("$.role") { value("owner") } }
    }

    @Test
    fun `a closed link answers 403 to other users and does not record their visit`() {
        val id = createBoard("Доска Алисы", alice)
        changeLinkAccess(id, alice, "none").andExpect { status { isOk() } }

        mockMvc.get("/api/boards/$id") { with(bob.session()) }.andExpect { status { isForbidden() } }

        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.role") { value("owner") }
            jsonPath("$.linkAccess") { value("none") }
        }
        mockMvc.get("/api/boards/shared") { with(bob.session()) }.andExpect { content { json("[]") } }
    }

    @Test
    fun `a member opens a board whose link is closed, with their role of their own`() {
        val id = createBoard("Доска Алисы", alice)
        changeLinkAccess(id, alice, "none").andExpect { status { isOk() } }
        members.put(UUID.fromString(id), bob.id, MemberRole.VIEWER, clock.instant())

        mockMvc.get("/api/boards/$id") { with(bob.session()) }.andExpect {
            status { isOk() }
            jsonPath("$.role") { value("viewer") }
        }
    }

    @ParameterizedTest
    @ValueSource(strings = ["none:EDITOR:editor", "view:EDITOR:editor", "edit:VIEWER:editor", "view:VIEWER:viewer"])
    fun `a member gets the higher of their role and what the link gives`(case: String) {
        val (linkAccess, memberRole, role) = case.split(':')
        val id = createBoard("Доска Алисы", alice)
        changeLinkAccess(id, alice, linkAccess).andExpect { status { isOk() } }
        members.put(UUID.fromString(id), bob.id, MemberRole.valueOf(memberRole), clock.instant())

        mockMvc.get("/api/boards/$id") { with(bob.session()) }.andExpect { jsonPath("$.role") { value(role) } }
    }

    @Test
    fun `the owner changes the link access, which does not mark the board as changed`() {
        val id = createBoard("Доска", alice)
        val createdAt = clock.instant()
        clock.advance(Duration.ofMinutes(1))

        changeLinkAccess(id, alice, "view").andExpect {
            status { isOk() }
            jsonPath("$.linkAccess") { value("view") }
            jsonPath("$.title") { value("Доска") }
            jsonPath("$.updatedAt") { value(createdAt.toString()) }
            jsonPath("$.role") { value("owner") }
        }
        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect {
            jsonPath("$.linkAccess") { value("view") }
            jsonPath("$.updatedAt") { value(createdAt.toString()) }
        }
    }

    @Test
    fun `the owner renames a board and changes its link access at once`() {
        val id = createBoard("Доска", alice)

        rename(id, alice, """{"title": "Платежи", "linkAccess": "none"}""").andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Платежи") }
            jsonPath("$.linkAccess") { value("none") }
        }
        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect {
            jsonPath("$.title") { value("Платежи") }
            jsonPath("$.linkAccess") { value("none") }
        }
    }

    @ParameterizedTest
    @ValueSource(strings = ["public", "VIEW", ""])
    fun `rejects an unknown link access`(access: String) {
        val id = createBoard("Доска", alice)

        changeLinkAccess(id, alice, access).andExpect { status { isBadRequest() } }

        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect { jsonPath("$.linkAccess") { value("edit") } }
    }

    @Test
    fun `only the owner changes the link access`() {
        val id = createBoard("Доска Алисы", alice)

        changeLinkAccess(id, bob, "none").andExpect { status { isForbidden() } }

        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect { jsonPath("$.linkAccess") { value("edit") } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["0199a000-0000-7000-8000-000000000000", "not-a-uuid", "1-1-1-1-1"])
    fun `returns 404 for an unknown board`(id: String) {
        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `the owner renames a board, which trims the title and marks the board as changed`() {
        val id = createBoard("Новая доска", alice)
        clock.advance(Duration.ofMinutes(1))

        rename(id, alice, """{"title": "  Платежи  "}""").andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Платежи") }
            jsonPath("$.updatedAt") { value(clock.instant().toString()) }
            jsonPath("$.role") { value("owner") }
        }
        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect {
            jsonPath("$.title") { value("Платежи") }
            jsonPath("$.updatedAt") { value(clock.instant().toString()) }
        }
    }

    @Test
    fun `renaming keeps a link access that changed after the board was read`() {
        val id = UUID.fromString(createBoard("Новая доска", alice))
        val read = checkNotNull(boards.find(id))

        boards.changeLinkAccess(read, LinkAccess.NONE)
        boards.rename(read, "Платежи")

        val stored = checkNotNull(boards.find(id))
        assertEquals("Платежи", stored.title)
        assertEquals(LinkAccess.NONE, stored.linkAccess)
    }

    @Test
    fun `accepts a new title of exactly 200 characters`() {
        val id = createBoard("Доска", alice)

        rename(id, alice, """{"title": " ${"a".repeat(200)} "}""").andExpect { status { isOk() } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["{}", """{"title": null}""", """{"title": ""}""", """{"title": "   "}"""])
    fun `rejects a missing or blank new title`(body: String) {
        val id = createBoard("Доска", alice)

        rename(id, alice, body).andExpect { status { isBadRequest() } }

        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect { jsonPath("$.title") { value("Доска") } }
    }

    @Test
    fun `rejects a new title longer than 200 characters`() {
        val id = createBoard("Доска", alice)

        rename(id, alice, """{"title": "${"a".repeat(201)}"}""").andExpect { status { isBadRequest() } }

        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect { jsonPath("$.title") { value("Доска") } }
    }

    @Test
    fun `only the owner renames a board`() {
        val id = createBoard("Доска Алисы", alice)

        rename(id, bob, """{"title": "Доска Боба"}""").andExpect { status { isForbidden() } }

        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect { jsonPath("$.title") { value("Доска Алисы") } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["0199a000-0000-7000-8000-000000000000", "not-a-uuid"])
    fun `renaming an unknown board answers 404`(id: String) {
        rename(id, alice, """{"title": "Схема"}""").andExpect { status { isNotFound() } }
    }

    @Test
    fun `the owner deletes a board with its document`() {
        val id = createBoard("Черновик", alice)
        mockMvc.put("/internal/boards/$id/document") {
            header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN)
            contentType = MediaType.APPLICATION_OCTET_STREAM
            content = byteArrayOf(1, 2, 3)
        }.andExpect { status { isNoContent() } }

        delete(id, alice).andExpect { status { isNoContent() } }

        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect { status { isNotFound() } }
        mockMvc.get("/api/boards") { with(alice.session()) }.andExpect { content { json("[]") } }
        mockMvc.get("/internal/boards/$id/document") { header(InternalTokenInterceptor.HEADER, IntegrationTest.INTERNAL_TOKEN) }
            .andExpect { status { isNotFound() } }
        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM board_documents").query(Int::class.java).single())
    }

    @Test
    fun `only the owner deletes a board`() {
        val id = createBoard("Доска Алисы", alice)

        delete(id, bob).andExpect { status { isForbidden() } }

        mockMvc.get("/api/boards/$id") { with(alice.session()) }.andExpect { status { isOk() } }
    }

    @ParameterizedTest
    @ValueSource(strings = ["0199a000-0000-7000-8000-000000000000", "not-a-uuid"])
    fun `deleting an unknown board answers 404`(id: String) {
        delete(id, alice).andExpect { status { isNotFound() } }
    }

    @Test
    fun `lists boards of other users opened through their links, most recently opened first`() {
        val x = createBoard("X", alice)
        val y = createBoard("Y", alice)
        open(x, bob)
        clock.advance(Duration.ofMinutes(1))
        open(y, bob)

        mockMvc.get("/api/boards/shared") { with(bob.session()) }.andExpect {
            status { isOk() }
            jsonPath("$[*].id") { value(contains(y, x)) }
            jsonPath("$[0].title") { value("Y") }
            jsonPath("$[0].owner.id") { value(alice.id.toString()) }
            jsonPath("$[0].owner.name") { value("Alice") }
            jsonPath("$[0].owner.avatarUrl") { value("https://avatars.example.com/Alice.png") }
            jsonPath("$[0].role") { value("editor") }
            jsonPath("$[0].openedAt") { value(clock.instant().toString()) }
        }
        mockMvc.get("/api/boards") { with(bob.session()) }.andExpect { content { json("[]") } }
    }

    @Test
    fun `opening a board again moves it to the top of the boards opened through links`() {
        val x = createBoard("X", alice)
        val y = createBoard("Y", alice)
        open(x, bob)
        clock.advance(Duration.ofMinutes(1))
        open(y, bob)
        clock.advance(Duration.ofMinutes(1))

        open(x, bob)

        mockMvc.get("/api/boards/shared") { with(bob.session()) }.andExpect {
            jsonPath("$[*].id") { value(contains(x, y)) }
        }
    }

    @Test
    fun `own boards are not among the boards opened through links`() {
        val own = createBoard("Своя", alice)

        open(own, alice)

        mockMvc.get("/api/boards/shared") { with(alice.session()) }.andExpect { content { json("[]") } }
    }

    @Test
    fun `a deleted board leaves the boards opened through links`() {
        val x = createBoard("X", alice)
        open(x, bob)

        delete(x, alice).andExpect { status { isNoContent() } }

        mockMvc.get("/api/boards/shared") { with(bob.session()) }.andExpect { content { json("[]") } }
    }

    @Test
    fun `a board with a closed link leaves the boards opened through links and comes back when it opens again`() {
        val id = createBoard("Доска Алисы", alice)
        open(id, bob)

        changeLinkAccess(id, alice, "none").andExpect { status { isOk() } }
        mockMvc.get("/api/boards/shared") { with(bob.session()) }.andExpect { content { json("[]") } }

        changeLinkAccess(id, alice, "view").andExpect { status { isOk() } }
        mockMvc.get("/api/boards/shared") { with(bob.session()) }.andExpect {
            jsonPath("$[*].id") { value(contains(id)) }
            jsonPath("$[0].role") { value("viewer") }
            jsonPath("$[0].linkAccess") { value("view") }
        }
    }

    @Test
    fun `a board of a member is among the shared boards before they open it, and stays when its link is closed`() {
        val opened = createBoard("Открытая", alice)
        open(opened, bob)
        clock.advance(Duration.ofMinutes(1))
        val joined = createBoard("Общая", alice)
        members.put(UUID.fromString(joined), bob.id, MemberRole.VIEWER, clock.instant())

        mockMvc.get("/api/boards/shared") { with(bob.session()) }.andExpect {
            jsonPath("$[*].id") { value(contains(joined, opened)) }
            jsonPath("$[0].role") { value("editor") }
            jsonPath("$[0].openedAt") { value(nullValue()) }
        }

        changeLinkAccess(joined, alice, "none").andExpect { status { isOk() } }
        changeLinkAccess(opened, alice, "none").andExpect { status { isOk() } }
        mockMvc.get("/api/boards/shared") { with(bob.session()) }.andExpect {
            jsonPath("$[*].id") { value(contains(joined)) }
            jsonPath("$[0].role") { value("viewer") }
        }
    }

    @Test
    fun `a board that a member opens lists once, ordered by the later of joining and opening`() {
        val joined = createBoard("Общая", alice)
        members.put(UUID.fromString(joined), bob.id, MemberRole.EDITOR, clock.instant())
        clock.advance(Duration.ofMinutes(1))
        val other = createBoard("Другая", alice)
        open(other, bob)
        clock.advance(Duration.ofMinutes(1))

        open(joined, bob)

        mockMvc.get("/api/boards/shared") { with(bob.session()) }.andExpect {
            jsonPath("$[*].id") { value(contains(joined, other)) }
            jsonPath("$[0].openedAt") { value(clock.instant().toString()) }
        }
    }

    @Test
    fun `lists at most 50 boards opened through links`() {
        val ids = (1..51).map { index ->
            createBoard("Доска $index", alice).also {
                open(it, bob)
                clock.advance(Duration.ofSeconds(1))
            }
        }

        mockMvc.get("/api/boards/shared") { with(bob.session()) }.andExpect {
            jsonPath("$") { value(hasSize<Any>(50)) }
            jsonPath("$[0].id") { value(ids.last()) }
            jsonPath("$[49].id") { value(ids[1]) }
        }
    }

    private fun assertBadRequest(body: String) {
        mockMvc.post("/api/boards") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isBadRequest() } }

        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM boards").query(Int::class.java).single())
    }

    private fun rename(id: String, user: User, body: String): ResultActionsDsl = mockMvc.patch("/api/boards/$id") {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private fun changeLinkAccess(id: String, user: User, access: String): ResultActionsDsl =
        rename(id, user, """{"linkAccess": "$access"}""")

    private fun delete(id: String, user: User): ResultActionsDsl = mockMvc.delete("/api/boards/$id") {
        with(user.session())
        with(csrf())
    }

    private fun open(id: String, user: User) {
        mockMvc.get("/api/boards/$id") { with(user.session()) }.andExpect { status { isOk() } }
    }

    private fun createBoard(title: String, owner: User): String {
        val response = mockMvc.post("/api/boards") {
            with(owner.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "$title"}"""
        }.andExpect { status { isCreated() } }.andReturn().response

        return response.getHeader("Location")!!.substringAfterLast('/')
    }
}
