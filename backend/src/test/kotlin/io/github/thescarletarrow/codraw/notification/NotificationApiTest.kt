package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
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
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import kotlin.test.assertEquals

@IntegrationTest
class NotificationApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val users: UserService,
    @Autowired private val json: JsonMapper,
    @Autowired private val cleanup: NotificationCleanup,
) {

    private lateinit var alice: User
    private lateinit var bob: User
    private lateinit var carol: User
    private lateinit var board: String

    @BeforeEach
    fun cleanDatabase() {
        // Every notification is about a board: they go with the boards.
        jdbcClient.sql("DELETE FROM boards").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
        carol = users.gitHubUser("Carol")
        board = createBoard(alice, "Схема БД")
        cleanup.batchSize = NotificationCleanup.BATCH_SIZE
    }

    @Test
    fun `a mention in a new comment notifies the participant mentioned, and not the author mentioning themselves`() {
        open(board, bob)
        val createdAt = clock.instant()

        val thread = start(board, alice, body = "@Bob посмотри @Alice", mentions = listOf(bob, alice), pageId = "page-2")

        unreadCount(bob).andExpect { jsonPath("$.count") { value(1) } }
        notifications(bob).andExpect {
            status { isOk() }
            jsonPath("$.notifications") { value(hasSize<Any>(1)) }
            jsonPath("$.next") { value(nullValue()) }
            jsonPath("$.notifications[0].kind") { value("mention") }
            jsonPath("$.notifications[0].boardId") { value(board) }
            jsonPath("$.notifications[0].access") { value(true) }
            jsonPath("$.notifications[0].boardTitle") { value("Схема БД") }
            jsonPath("$.notifications[0].pageId") { value("page-2") }
            jsonPath("$.notifications[0].threadId") { value(thread) }
            jsonPath("$.notifications[0].commentId") { value(firstComment(thread)) }
            jsonPath("$.notifications[0].snippet") { value("@Bob посмотри @Alice") }
            jsonPath("$.notifications[0].actor.id") { value(alice.id.toString()) }
            jsonPath("$.notifications[0].actor.name") { value("Alice") }
            jsonPath("$.notifications[0].actor.avatarUrl") { value("https://avatars.example.com/Alice.png") }
            jsonPath("$.notifications[0].role") { value(nullValue()) }
            jsonPath("$.notifications[0].createdAt") { value(createdAt.toString()) }
            jsonPath("$.notifications[0].readAt") { value(nullValue()) }
        }
        unreadCount(alice).andExpect { jsonPath("$.count") { value(0) } }
    }

    @Test
    fun `a long comment shows its start`() {
        open(board, bob)

        start(board, alice, body = "@Bob " + "а".repeat(300), mentions = listOf(bob))

        notifications(bob).andExpect { jsonPath("$.notifications[0].snippet") { value("@Bob " + "а".repeat(194) + "…") } }
    }

    @Test
    fun `an answer notifies who wrote in the thread before, but its author, and a mention wins over the answer`() {
        open(board, bob)
        open(board, carol)
        val thread = start(board, alice)
        reply(board, thread, carol, "Согласна")

        reply(board, thread, bob, "@Alice а если так?", mentions = listOf(alice))

        // Алиса heard of the answer of Карл before; the comment of Боб mentions her, which is all she hears of it.
        notifications(alice).andExpect {
            jsonPath("$.notifications[*].kind") { value(contains("mention", "reply")) }
            jsonPath("$.notifications[*].actor.name") { value(contains("Bob", "Carol")) }
        }
        notifications(carol).andExpect {
            jsonPath("$.notifications[*].kind") { value(contains("reply")) }
            jsonPath("$.notifications[0].actor.name") { value("Bob") }
            jsonPath("$.notifications[0].snippet") { value("@Alice а если так?") }
        }
        unreadCount(bob).andExpect { jsonPath("$.count") { value(0) } }
    }

    @Test
    fun `an answer does not reach a writer of the thread who can no longer open the board`() {
        open(board, bob)
        val thread = start(board, bob)
        setLinkAccess(board, "none")

        reply(board, thread, alice, "Ответ")

        unreadCount(bob).andExpect { jsonPath("$.count") { value(0) } }
    }

    @Test
    fun `an edit notifies the participants it mentions anew, once, and turns a notification of an answer into a mention`() {
        open(board, bob)
        open(board, carol)
        val thread = start(board, alice, body = "@Bob", mentions = listOf(bob))
        val answer = replyId(board, thread, carol, "Ответ")
        assertEquals(listOf("reply"), kinds(alice))
        markAllRead(alice)

        edit(board, thread, answer, carol, "@Alice ответ", mentions = listOf(alice))
        edit(board, thread, firstComment(thread), alice, "Без упоминаний")
        edit(board, thread, firstComment(thread), alice, "@Bob @Carol", mentions = listOf(bob, carol))

        notifications(alice).andExpect {
            jsonPath("$.notifications[*].kind") { value(contains("mention")) }
            jsonPath("$.notifications[0].readAt") { value(nullValue()) }
            jsonPath("$.notifications[0].snippet") { value("@Alice ответ") }
        }
        assertEquals(listOf("mention"), kinds(bob))
        assertEquals(listOf("mention"), kinds(carol))
    }

    @Test
    fun `a notification shows the board and the comment as they are now`() {
        open(board, bob)
        val thread = start(board, alice, body = "@Bob старое", mentions = listOf(bob))
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Схема БД v2"}"""
        }.andExpect { status { isOk() } }
        edit(board, thread, firstComment(thread), alice, "@Bob новое", mentions = listOf(bob))

        notifications(bob).andExpect {
            jsonPath("$.notifications") { value(hasSize<Any>(1)) }
            jsonPath("$.notifications[0].boardTitle") { value("Схема БД v2") }
            jsonPath("$.notifications[0].snippet") { value("@Bob новое") }
        }
    }

    @Test
    fun `a notification about a board the user can no longer open tells only what happened and when`() {
        open(board, bob)
        start(board, alice, body = "@Bob секрет", mentions = listOf(bob))
        setLinkAccess(board, "none")

        notifications(bob).andExpect {
            jsonPath("$.notifications[0].kind") { value("mention") }
            jsonPath("$.notifications[0].boardId") { value(board) }
            jsonPath("$.notifications[0].access") { value(false) }
            jsonPath("$.notifications[0].boardTitle") { value(nullValue()) }
            jsonPath("$.notifications[0].pageId") { value(nullValue()) }
            jsonPath("$.notifications[0].threadId") { value(nullValue()) }
            jsonPath("$.notifications[0].commentId") { value(nullValue()) }
            jsonPath("$.notifications[0].snippet") { value(nullValue()) }
            jsonPath("$.notifications[0].actor") { value(nullValue()) }
        }
        unreadCount(bob).andExpect { jsonPath("$.count") { value(1) } }

        setLinkAccess(board, "view")
        notifications(bob).andExpect {
            jsonPath("$.notifications[0].access") { value(true) }
            jsonPath("$.notifications[0].snippet") { value("@Bob секрет") }
        }
    }

    @Test
    fun `a request for access notifies the owner, a replaced one replaces the unread notification, and a cancelled one takes it away`() {
        setLinkAccess(board, "none")

        ask(board, bob, "viewer")
        ask(board, bob, "editor")

        notifications(alice).andExpect {
            jsonPath("$.notifications") { value(hasSize<Any>(1)) }
            jsonPath("$.notifications[0].kind") { value("access-request") }
            jsonPath("$.notifications[0].role") { value("editor") }
            jsonPath("$.notifications[0].actor.name") { value("Bob") }
            jsonPath("$.notifications[0].boardTitle") { value("Схема БД") }
        }

        mockMvc.delete("/api/boards/$board/access-request") {
            with(bob.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        notifications(alice).andExpect { jsonPath("$.notifications") { value(empty<Any>()) } }

        ask(board, bob, "viewer")
        markAllRead(alice)
        ask(board, bob, "editor")
        assertEquals(listOf("access-request", "access-request"), kinds(alice))
    }

    @Test
    fun `the owner gives access, the user hears of it, and the notification of the owner is read`() {
        setLinkAccess(board, "none")
        val request = ask(board, bob, "editor").id()

        grant(board, request, "editor").andExpect { status { isOk() } }

        notifications(bob).andExpect {
            jsonPath("$.notifications[*].kind") { value(contains("access-granted")) }
            jsonPath("$.notifications[0].role") { value("editor") }
            jsonPath("$.notifications[0].actor.name") { value("Alice") }
            jsonPath("$.notifications[0].access") { value(true) }
        }
        notifications(alice).andExpect { jsonPath("$.notifications[0].readAt") { value(clock.instant().toString()) } }
        unreadCount(alice).andExpect { jsonPath("$.count") { value(0) } }
    }

    @Test
    fun `the owner declines, and the user without access hears of it without the board or its owner`() {
        setLinkAccess(board, "none")
        val request = ask(board, bob, "editor").id()

        mockMvc.delete("/api/boards/$board/access-requests/$request") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        notifications(bob).andExpect {
            jsonPath("$.notifications[*].kind") { value(contains("access-declined")) }
            jsonPath("$.notifications[0].access") { value(false) }
            jsonPath("$.notifications[0].boardTitle") { value(nullValue()) }
            jsonPath("$.notifications[0].actor") { value(nullValue()) }
        }
        unreadCount(alice).andExpect { jsonPath("$.count") { value(0) } }
    }

    @Test
    fun `a viewer who asked for editing and is declined hears of it with the board`() {
        setLinkAccess(board, "view")
        val request = ask(board, bob, "editor").id()

        mockMvc.delete("/api/boards/$board/access-requests/$request") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }

        notifications(bob).andExpect {
            jsonPath("$.notifications[0].kind") { value("access-declined") }
            jsonPath("$.notifications[0].role") { value("editor") }
            jsonPath("$.notifications[0].boardTitle") { value("Схема БД") }
        }
    }

    @Test
    fun `an answer that gives a member the role they have is declined`() {
        open(board, bob)
        putMember(board, bob, "viewer")
        markAllRead(bob)
        setLinkAccess(board, "none")
        val request = ask(board, bob, "editor").id()

        grant(board, request, "viewer").andExpect { status { isOk() } }

        notifications(bob).andExpect {
            jsonPath("$.notifications[0].kind") { value("access-declined") }
            jsonPath("$.notifications[0].readAt") { value(nullValue()) }
        }
        unreadCount(bob).andExpect { jsonPath("$.count") { value(1) } }
    }

    @Test
    fun `a new member and a member who gets a higher role hear of it, and nobody hears of a lower role or of an invitation`() {
        open(board, bob)

        putMember(board, bob, "viewer")
        putMember(board, bob, "editor")
        putMember(board, bob, "viewer")
        accept(createInvite(board, "editor"), carol)

        notifications(bob).andExpect {
            jsonPath("$.notifications[*].kind") { value(contains("access-granted", "access-granted")) }
            jsonPath("$.notifications[*].role") { value(contains("editor", "viewer")) }
        }
        unreadCount(carol).andExpect { jsonPath("$.count") { value(0) } }
        unreadCount(alice).andExpect { jsonPath("$.count") { value(0) } }
    }

    @Test
    fun `the new owner of a board hears of it from the previous one`() {
        open(board, bob)
        putMember(board, bob, "editor")

        mockMvc.put("/api/boards/$board/owner") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"userId": "${bob.id}"}"""
        }.andExpect { status { isOk() } }

        notifications(bob).andExpect {
            jsonPath("$.notifications[0].kind") { value("ownership") }
            jsonPath("$.notifications[0].actor.name") { value("Alice") }
            jsonPath("$.notifications[0].role") { value(nullValue()) }
        }
        unreadCount(alice).andExpect { jsonPath("$.count") { value(0) } }
    }

    @Test
    fun `notifications come newest first in pages of 30`() {
        open(board, bob)
        val thread = start(board, alice, body = "Ветка")
        repeat(31) { reply(board, thread, alice, "Комментарий ${it + 1}", mentions = listOf(bob)) }

        val first = page(bob)
        assertEquals((31 downTo 2).map { "Комментарий $it" }, first["notifications"].items().map { it["snippet"].asString() })
        val next = first["next"].asString()
        assertEquals(first["notifications"].items().last()["id"].asString(), next)

        val second = page(bob, before = next)
        assertEquals(listOf("Комментарий 1"), second["notifications"].items().map { it["snippet"].asString() })
        assertEquals(true, second["next"].isNull)

        mockMvc.get("/api/notifications?before=not-an-id") { with(bob.session()) }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `the user reads one notification or all of them, and only their own`() {
        open(board, bob)
        start(board, alice, body = "@Bob раз", mentions = listOf(bob))
        clock.advance(Duration.ofMinutes(1))
        start(board, alice, body = "@Bob два", mentions = listOf(bob))
        val newest = page(bob)["notifications"][0]["id"].asString()

        read(newest, carol).andExpect { status { isNotFound() } }
        read("not-an-id", bob).andExpect { status { isNotFound() } }
        read(newest, bob).andExpect { status { isNoContent() } }
        read(newest, bob).andExpect { status { isNoContent() } }

        unreadCount(bob).andExpect { jsonPath("$.count") { value(1) } }
        notifications(bob).andExpect {
            jsonPath("$.notifications[0].readAt") { value(clock.instant().toString()) }
            jsonPath("$.notifications[1].readAt") { value(nullValue()) }
        }

        markAllRead(bob)
        unreadCount(bob).andExpect { jsonPath("$.count") { value(0) } }
    }

    @Test
    fun `notifications go with their comment, their thread and their board, and stay without an actor who is gone`() {
        open(board, bob)
        val thread = start(board, alice, body = "@Bob ветка", mentions = listOf(bob))
        val answer = replyId(board, thread, alice, "@Bob ответ", mentions = listOf(bob))
        val other = createBoard(alice, "Другая")
        open(other, bob)
        start(other, alice, body = "@Bob там", mentions = listOf(bob))
        open(board, carol)
        start(board, carol, body = "@Bob от Карла", mentions = listOf(bob))
        assertEquals(4, page(bob)["notifications"].size())

        deleteComment(board, thread, answer)
        assertEquals(listOf("@Bob от Карла", "@Bob там", "@Bob ветка"), snippets(bob))
        deleteComment(board, thread, firstComment(thread))
        assertEquals(listOf("@Bob от Карла", "@Bob там"), snippets(bob))
        mockMvc.delete("/api/boards/$other") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
        assertEquals(listOf("@Bob от Карла"), snippets(bob))

        jdbcClient.sql("DELETE FROM users WHERE id = :id").param("id", carol.id).update()
        notifications(bob).andExpect {
            jsonPath("$.notifications[0].actor") { value(nullValue()) }
            jsonPath("$.notifications[0].access") { value(true) }
        }
    }

    @Test
    fun `the cleanup deletes notifications older than the retention, in batches`() {
        open(board, bob)
        repeat(3) { start(board, alice, body = "@Bob старое $it", mentions = listOf(bob)) }
        clock.advance(Duration.ofDays(61))
        start(board, alice, body = "@Bob новое", mentions = listOf(bob))
        clock.advance(Duration.ofDays(30))
        cleanup.batchSize = 2

        assertEquals(3, cleanup.cleanUp())

        assertEquals(listOf("@Bob новое"), snippets(bob))
        assertEquals(0, cleanup.cleanUp())
    }

    @Test
    fun `the notifications of a guest pass to the account they sign in with, but those about the account itself`() {
        val guest = users.createGuest()
        open(board, guest)
        open(board, bob)
        val dave = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Dave", "Dave", null))
        open(board, dave)
        val both = start(board, alice, body = "@Гость @Dave", mentions = listOf(guest, dave))
        start(board, alice, body = "@Гость", mentions = listOf(guest))
        start(board, guest, body = "@Dave от гостя @Bob", mentions = listOf(dave, bob))

        users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Dave", "Dave", null), guest.id)

        assertEquals(listOf("@Гость", "@Гость @Dave"), snippets(dave))
        assertEquals(firstComment(both), page(dave)["notifications"][1]["commentId"].asString())
        notifications(bob).andExpect { jsonPath("$.notifications[0].actor.id") { value(dave.id.toString()) } }
        assertEquals(0, jdbcClient.sql("SELECT count(*) FROM notifications WHERE user_id = :id OR actor_id = :id")
            .param("id", guest.id).query(Int::class.java).single())
    }

    @Test
    fun `reading notifications needs a sign-in and the CSRF token`() {
        mockMvc.get("/api/notifications").andExpect { status { isUnauthorized() } }
        mockMvc.get("/api/notifications/unread-count").andExpect { status { isUnauthorized() } }
        mockMvc.post("/api/notifications/read-all") { with(bob.session()) }.andExpect { status { isForbidden() } }
    }

    private fun notifications(user: User): ResultActionsDsl = mockMvc.get("/api/notifications") { with(user.session()) }

    private fun page(user: User, before: String? = null): JsonNode {
        val path = if (before == null) "/api/notifications" else "/api/notifications?before=$before"
        val response = mockMvc.get(path) { with(user.session()) }.andExpect { status { isOk() } }.andReturn().response
        return json.readTree(response.contentAsString)
    }

    private fun kinds(user: User): List<String> = page(user)["notifications"].items().map { it["kind"].asString() }

    private fun snippets(user: User): List<String> = page(user)["notifications"].items().map { it["snippet"].asString() }

    private fun JsonNode.items(): List<JsonNode> = (0 until size()).map { get(it) }

    private fun unreadCount(user: User): ResultActionsDsl =
        mockMvc.get("/api/notifications/unread-count") { with(user.session()) }.andExpect { status { isOk() } }

    private fun read(id: String, user: User): ResultActionsDsl = mockMvc.post("/api/notifications/$id/read") {
        with(user.session())
        with(csrf())
    }

    private fun markAllRead(user: User) {
        mockMvc.post("/api/notifications/read-all") {
            with(user.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
    }

    private fun createBoard(owner: User, title: String): String {
        val response = post("/api/boards", owner, """{"title": "$title"}""").andExpect { status { isCreated() } }.andReturn().response
        return response.getHeader("Location")!!.substringAfterLast('/')
    }

    /** Opens the board through its link, which makes the user a participant to mention. */
    private fun open(board: String, user: User) {
        mockMvc.get("/api/boards/$board") { with(user.session()) }.andExpect { status { isOk() } }
    }

    private fun setLinkAccess(board: String, linkAccess: String) {
        mockMvc.patch("/api/boards/$board") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"linkAccess": "$linkAccess"}"""
        }.andExpect { status { isOk() } }
    }

    private fun start(
        board: String,
        user: User,
        body: String = "Комментарий",
        mentions: List<User> = emptyList(),
        pageId: String = "page-1",
    ): String {
        val request = mapOf("pageId" to pageId, "cellId" to "cell-1", "body" to body, "mentions" to mentions.map { it.id })
        val response = post("/api/boards/$board/threads", user, json.writeValueAsString(request))
            .andExpect { status { isCreated() } }
            .andReturn().response
        return json.readTree(response.contentAsString)["id"].asString()
    }

    private fun reply(board: String, thread: String, user: User, body: String, mentions: List<User> = emptyList()) {
        replyId(board, thread, user, body, mentions)
    }

    private fun replyId(board: String, thread: String, user: User, body: String, mentions: List<User> = emptyList()): String {
        val request = mapOf("body" to body, "mentions" to mentions.map { it.id })
        val response = post("/api/boards/$board/threads/$thread/comments", user, json.writeValueAsString(request))
            .andExpect { status { isCreated() } }
            .andReturn().response
        return json.readTree(response.contentAsString)["comments"].last()["id"].asString()
    }

    private fun edit(board: String, thread: String, comment: String, user: User, body: String, mentions: List<User> = emptyList()) {
        mockMvc.patch("/api/boards/$board/threads/$thread/comments/$comment") {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = json.writeValueAsString(mapOf("body" to body, "mentions" to mentions.map { it.id }))
        }.andExpect { status { isOk() } }
    }

    private fun deleteComment(board: String, thread: String, comment: String) {
        mockMvc.delete("/api/boards/$board/threads/$thread/comments/$comment") {
            with(alice.session())
            with(csrf())
        }.andExpect { status { isNoContent() } }
    }

    private fun firstComment(thread: String): String = jdbcClient.sql(
        "SELECT id::text FROM comments WHERE thread_id = :thread::uuid ORDER BY created_at, id LIMIT 1",
    ).param("thread", thread).query(String::class.java).single()

    private fun ask(board: String, user: User, role: String): ResultActionsDsl = mockMvc.put("/api/boards/$board/access-request") {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"role": "$role"}"""
    }.andExpect { status { isOk() } }

    private fun grant(board: String, request: String, role: String): ResultActionsDsl =
        post("/api/boards/$board/access-requests/$request/grant", alice, """{"role": "$role"}""")

    private fun putMember(board: String, user: User, role: String) {
        mockMvc.put("/api/boards/$board/members/${user.id}") {
            with(alice.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"role": "$role"}"""
        }.andExpect { status { isOk() } }
    }

    private fun createInvite(board: String, role: String): String {
        val response = post("/api/boards/$board/invites", alice, """{"role": "$role"}""")
            .andExpect { status { isCreated() } }
            .andReturn().response.contentAsString
        return json.readTree(response)["path"].asString().substringAfterLast('/')
    }

    private fun accept(token: String, user: User) {
        mockMvc.post("/api/invites/$token/accept") {
            with(user.session())
            with(csrf())
        }.andExpect { status { isOk() } }
    }

    private fun post(path: String, user: User, body: String): ResultActionsDsl = mockMvc.post(path) {
        with(user.session())
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private fun ResultActionsDsl.id(): String = json.readTree(andReturn().response.contentAsString)["id"].asString()
}
