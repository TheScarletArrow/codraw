package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.board.MemberRole
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NotificationMessagesTest {

    private val messages = NotificationMessages(
        NotificationProperties(appUrl = "https://codraw.example.com/", email = NotificationProperties.Email(confirmationTtl = Duration.ofDays(2))),
    )
    private val board = UUID.fromString("0199a000-0000-7000-8000-000000000001")
    private val thread = UUID.fromString("0199a000-0000-7000-8000-000000000002")
    private val proposal = UUID.fromString("0199a000-0000-7000-8000-000000000003")

    @Test
    fun `tells each kind in the words of the bell and leads where the bell leads`() {
        assertEquals(
            NotificationMessage(
                "Аня: вам назначена ветка в «Схема БД»",
                "Поправь связь",
                "https://codraw.example.com/boards/$board?page=page+2&thread=$thread",
            ),
            messages.of(notification(NotificationKind.ASSIGNED, pageId = "page 2", threadId = thread, snippet = "Поправь связь")),
        )
        assertEquals(
            NotificationMessage("Аня: запрос доступа к «Схема БД»", "Просит редактирование", "https://codraw.example.com/boards/$board?share=requests"),
            messages.of(notification(NotificationKind.ACCESS_REQUEST, role = MemberRole.EDITOR)),
        )
        assertEquals(
            NotificationMessage("Аня: доступ к «Схема БД»", "Теперь можно смотреть", "https://codraw.example.com/boards/$board"),
            messages.of(notification(NotificationKind.ACCESS_GRANTED, role = MemberRole.VIEWER)),
        )
        assertEquals(
            NotificationMessage(
                "Аня: запрос ревью на «Схема БД»",
                "Элемент отмечен «Нужно ревью»",
                "https://codraw.example.com/boards/$board?page=p2&cell=orders",
            ),
            messages.of(notification(NotificationKind.REVIEW_REQUEST, pageId = "p2", cellId = "orders")),
        )
        assertEquals(
            NotificationMessage(
                "Аня: ваше предложение к «Схема БД» принято",
                "Добавить очередь",
                "https://codraw.example.com/boards/$board?proposal=$proposal",
            ),
            messages.of(notification(NotificationKind.PROPOSAL_ACCEPTED, proposalId = proposal, snippet = "Добавить очередь")),
        )
    }

    @Test
    fun `names nobody without access, and an actor who is gone as such`() {
        assertEquals(
            NotificationMessage("Отказ в доступе", "Доска недоступна", "https://codraw.example.com/boards/$board"),
            messages.of(notification(NotificationKind.ACCESS_DECLINED, role = MemberRole.EDITOR).copy(access = false, boardTitle = null, actor = null)),
        )
        assertEquals(
            "Удалённый пользователь: передача владения «Схема БД»",
            messages.of(notification(NotificationKind.OWNERSHIP).copy(actor = null)).title,
        )
    }

    @Test
    fun `a letter has a one-line subject, says why it came and how to stop it`() {
        val message = NotificationMessage("Аня: упоминание в «Схема\nБД»", "@Боб <посмотри>", "https://codraw.example.com/boards/$board")

        val letter = messages.email("bob@example.com", message, NotificationEvent.MENTIONS)

        assertEquals("Аня: упоминание в «Схема БД»", letter.subject)
        assertTrue(letter.text.contains("\n\n@Боб <посмотри>\n"), letter.text)
        assertTrue(letter.text.contains("включены письма о событиях «Упоминания»"), letter.text)
        assertTrue(letter.text.contains("https://codraw.example.com/settings/notifications"), letter.text)
        assertEquals("https://codraw.example.com/settings/notifications", letter.unsubscribeUrl)
    }

    @Test
    fun `the letter that confirms an address links to the settings with its token and tells how long it works`() {
        val letter = messages.confirmation("bob@example.com", "abc_DEF-123")

        assertTrue(letter.text.contains("https://codraw.example.com/settings/notifications?confirm=abc_DEF-123"), letter.text)
        assertTrue(letter.text.contains("Ссылка действует 48 часов."), letter.text)
    }

    @Test
    fun `a message of a chat escapes the controls of Slack and breaks mentions`() {
        assertEquals("a &amp; b &lt;!channel&gt; @​here", NotificationMessages.chatText("a & b <!channel> @here"))
        assertEquals(
            "Аня: упоминание в «A&amp;B»\n@​Боб\nhttps://codraw.example.com/boards/$board",
            messages.chat(NotificationMessage("Аня: упоминание в «A&B»", "@Боб", "https://codraw.example.com/boards/$board")),
        )
    }

    @Test
    fun `every kind of notification belongs to exactly one event`() {
        for (kind in NotificationKind.entries) {
            assertEquals(1, NotificationEvent.entries.count { kind in it.kinds }, kind.name)
        }
    }

    @Test
    fun `pauses between attempts grow to two hours`() {
        assertEquals(
            listOf(1L, 5L, 25L, 120L, 120L, 120L),
            (1..6).map { NotificationDelivery.backoff(it).toMinutes() },
        )
        assertEquals(Duration.ofHours(2), NotificationDelivery.backoff(100))
    }

    private fun notification(
        kind: NotificationKind,
        pageId: String? = null,
        cellId: String? = null,
        threadId: UUID? = null,
        proposalId: UUID? = null,
        snippet: String? = null,
        role: MemberRole? = null,
    ) = Notification(
        id = UUID.randomUUID(),
        kind = kind,
        boardId = board,
        access = true,
        boardTitle = "Схема БД",
        pageId = pageId,
        cellId = cellId,
        threadId = threadId,
        commentId = null,
        proposalId = proposalId,
        snippet = snippet,
        actor = Actor(UUID.randomUUID(), "Аня", null),
        role = role,
        createdAt = Instant.parse("2026-10-08T10:00:00Z"),
        readAt = null,
    )
}
