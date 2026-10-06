package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.board.AccessRequests
import io.github.thescarletarrow.codraw.board.BoardDocumentService
import io.github.thescarletarrow.codraw.board.BoardMembers
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.BoardVersionService
import io.github.thescarletarrow.codraw.board.MemberRole
import io.github.thescarletarrow.codraw.board.VersionReason
import io.github.thescarletarrow.codraw.comment.CommentService
import io.github.thescarletarrow.codraw.comment.Reaction
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.notification.NotificationService
import io.github.thescarletarrow.codraw.signedIn
import io.micrometer.core.instrument.MeterRegistry
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.session.SessionRepository
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import java.time.Duration
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

@IntegrationTest
class GuestCleanupTest(
    @Autowired private val cleanup: GuestCleanup,
    @Autowired private val users: UserService,
    @Autowired private val boards: BoardService,
    @Autowired private val documents: BoardDocumentService,
    @Autowired private val versions: BoardVersionService,
    @Autowired private val sessions: SessionRepository<*>,
    @Autowired private val jdbcClient: JdbcClient,
    @Autowired private val clock: MutableClock,
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val registry: MeterRegistry,
    @Autowired private val members: BoardMembers,
    @Autowired private val requests: AccessRequests,
    @Autowired private val notifications: NotificationService,
    @Autowired private val comments: CommentService,
) {

    @BeforeEach
    fun cleanDatabase() {
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM users WHERE provider = 'guest'").update()
        jdbcClient.sql("DELETE FROM spring_session").update()
        cleanup.batchSize = GuestCleanup.BATCH_SIZE
    }

    @Test
    fun `deletes a board of a guest whose session has expired once nobody worked on it for 30 days, then the guest`() {
        val guest = users.createGuest()
        val board = boards.create("Черновик", guest.id)
        documents.save(board.id!!, byteArrayOf(1, 2, 3))
        documents.save(board.id!!, byteArrayOf(4, 5, 6))
        clock.advance(Duration.ofDays(29))
        assertEquals(GuestCleanup.Result(boards = 0, guests = 0), cleanup.cleanUp())

        clock.advance(Duration.ofDays(2))

        assertEquals(GuestCleanup.Result(boards = 1, guests = 1), cleanup.cleanUp())
        assertNull(boards.find(board.id!!))
        assertNull(users.find(guest.id))
        assertEquals(0, count("board_documents"))
        assertEquals(0, count("board_versions"))
    }

    @Test
    fun `finds the session of a guest who continued without a sign-in by the id of the guest`() {
        mockMvc.post("/api/guest") { with(csrf()) }.andExpect { status { isNoContent() } }

        val guest = jdbcClient.sql("SELECT id FROM users WHERE provider = 'guest'").query(UUID::class.java).single()
        val principals = jdbcClient.sql("SELECT principal_name FROM spring_session").query(String::class.java).list()
        assertEquals(listOf(guest.toString()), principals)
    }

    @Test
    fun `keeps a board of a gone guest that others opened through its link lately, and the guest with it`() {
        val guest = users.createGuest()
        val board = boards.create("Общая", guest.id)
        clock.advance(Duration.ofDays(25))
        boards.recordVisit(board, users.gitHubUser("Bob").id)

        clock.advance(Duration.ofDays(10))

        assertEquals(GuestCleanup.Result(boards = 0, guests = 0), cleanup.cleanUp())
        assertNotNull(boards.find(board.id!!))
        assertNotNull(users.find(guest.id))
    }

    @Test
    fun `deletes a gone guest who is a member of boards of others or asks for access to them, with their memberships and requests`() {
        val alice = users.gitHubUser("Alice")
        val board = boards.create("Общая", alice.id)
        val closed = boards.create("Закрытая", alice.id)
        val guest = users.createGuest()
        members.put(board.id!!, guest.id, MemberRole.EDITOR, clock.instant())
        requests.put(closed.id!!, guest.id, MemberRole.VIEWER, "Пустите", clock.instant())

        clock.advance(Duration.ofDays(2))

        assertEquals(GuestCleanup.Result(boards = 0, guests = 1), cleanup.cleanUp())
        assertNull(users.find(guest.id))
        assertNotNull(boards.find(board.id!!))
        assertNotNull(boards.find(closed.id!!))
        assertEquals(0, count("board_members"))
        assertEquals(0, count("board_access_requests"))
    }

    @Test
    fun `deletes the notifications of a gone guest, and those the guest caused others stay without them`() {
        val alice = users.gitHubUser("Alice")
        val board = boards.create("Общая", alice.id)
        val guest = users.createGuest()
        notifications.accessRequested(board, guest.id, MemberRole.EDITOR)
        notifications.accessGranted(board, guest.id, MemberRole.EDITOR)

        clock.advance(Duration.ofDays(2))

        assertEquals(GuestCleanup.Result(boards = 0, guests = 1), cleanup.cleanUp())
        assertEquals(1, count("notifications"))
        val left = notifications.page(alice.id, before = null).notifications.single()
        assertNull(left.actor)
        assertEquals(board.id, left.boardId)
    }

    @Test
    fun `deletes the reactions of a gone guest and leaves the threads assigned to them without an assignee`() {
        val alice = users.gitHubUser("Alice")
        val board = boards.create("Общая", alice.id)
        val guest = users.createGuest()
        members.put(board.id!!, guest.id, MemberRole.VIEWER, clock.instant())
        val thread = comments.start(board, alice.id, "page-1", cellId = null, point = null, "Поправь связь", emptyList())
        val comment = thread.comments.single().id
        comments.addReaction(board, thread.id, comment, guest.id, Reaction.EYES)
        comments.addReaction(board, thread.id, comment, alice.id, Reaction.EYES)
        comments.assign(board, thread.id, alice.id, guest.id)

        clock.advance(Duration.ofDays(2))

        assertEquals(GuestCleanup.Result(boards = 0, guests = 1), cleanup.cleanUp())
        val left = comments.thread(board, thread.id)
        assertNull(left.assignee)
        assertEquals(listOf(alice.id), left.comments.single().reactions.single().people.map { it.id })
    }

    @Test
    fun `keeps a guest with a live session and their boards, however long they did not change them`() {
        val guest = users.createGuest()
        val board = boards.create("Старая", guest.id)
        clock.advance(Duration.ofDays(60))
        liveSession(guest)

        assertEquals(GuestCleanup.Result(boards = 0, guests = 0), cleanup.cleanUp())
        assertNotNull(boards.find(board.id!!))
    }

    @Test
    fun `takes a guest whose session has expired, but is still stored, for gone`() {
        val guest = users.createGuest()
        boards.create("Старая", guest.id)
        clock.advance(Duration.ofDays(31))
        liveSession(guest)
        jdbcClient.sql("UPDATE spring_session SET expiry_time = :past").param("past", clock.millis() - 1).update()

        assertEquals(GuestCleanup.Result(boards = 1, guests = 1), cleanup.cleanUp())
    }

    @Test
    fun `leaves a guest created less than a day ago alone`() {
        val guest = users.createGuest()
        clock.advance(Duration.ofHours(23))
        assertEquals(GuestCleanup.Result(boards = 0, guests = 0), cleanup.cleanUp())

        clock.advance(Duration.ofHours(2))

        assertEquals(GuestCleanup.Result(boards = 0, guests = 1), cleanup.cleanUp())
        assertNull(users.find(guest.id))
    }

    @Test
    fun `deletes a guest who signed in through a provider, whose boards stay with the user`() {
        val guest = users.createGuest()
        val board = boards.create("Перенесённая", guest.id)
        val alice = users.signIn(ProviderProfile(ProviderProfile.GITHUB, "id-Alice", "Alice", null), guest.id)
        liveSession(alice)

        clock.advance(Duration.ofDays(40))

        assertEquals(GuestCleanup.Result(boards = 0, guests = 1), cleanup.cleanUp())
        assertEquals(alice.id, boards.find(board.id!!)!!.ownerId)
    }

    @Test
    fun `a gone guest who changed a board of another user is left out of the authors of its versions`() {
        val alice = users.gitHubUser("Alice")
        val guest = users.createGuest()
        val board = boards.create("Общая", alice.id).id!!
        documents.save(board, byteArrayOf(1), listOf(guest.id, alice.id))
        versions.save(board, byteArrayOf(1), VersionReason.MANUAL)

        clock.advance(Duration.ofDays(2))

        assertEquals(GuestCleanup.Result(boards = 0, guests = 1), cleanup.cleanUp())
        assertEquals(listOf("Alice"), versions.list(board).single().authors.map { it.name })
    }

    @Test
    fun `never deletes users of providers`() {
        val alice = users.gitHubUser("Alice")
        val board = boards.create("Давняя", alice.id)

        clock.advance(Duration.ofDays(400))

        assertEquals(GuestCleanup.Result(boards = 0, guests = 0), cleanup.cleanUp())
        assertNotNull(boards.find(board.id!!))
        assertNotNull(users.find(alice.id))
    }

    @Test
    fun `deletes in batches until nothing is left`() {
        cleanup.batchSize = 2
        val guests = List(3) { users.createGuest() }
        guests.forEach { guest -> repeat(2) { boards.create("Доска", guest.id) } }

        clock.advance(Duration.ofDays(31))
        val deleted = { kind: String -> registry.get("codraw.guests.cleanup.deleted").tag("kind", kind).counter().count() }
        val (boardsBefore, guestsBefore) = deleted("boards") to deleted("guests")

        assertEquals(GuestCleanup.Result(boards = 6, guests = 3), cleanup.cleanUp())
        assertEquals(boardsBefore + 6, deleted("boards"))
        assertEquals(guestsBefore + 3, deleted("guests"))
    }

    /** Stores a session of the [user] that lasts an hour from now on the clock of the backend. */
    private fun liveSession(user: User) {
        sessions.signedIn(user)
        jdbcClient.sql("UPDATE spring_session SET expiry_time = :expiry WHERE principal_name = :name")
            .param("expiry", clock.millis() + Duration.ofHours(1).toMillis())
            .param("name", user.id.toString())
            .update()
    }

    private fun count(table: String): Int = jdbcClient.sql("SELECT count(*) FROM $table").query(Int::class.java).single()
}
