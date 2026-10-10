package io.github.thescarletarrow.codraw.notification

/** The words of notifications in one language of the interface; [NotificationMessages] puts them together. */
internal sealed class NotificationWords {
    /** What happened, as a notification about a board the user can no longer open says it. */
    abstract val labels: Map<NotificationKind, String>

    /** The names of the events in the settings. */
    abstract val events: Map<NotificationEvent, String>

    abstract val boardUnavailable: String
    abstract val deletedUser: String

    /** What the actor did on the board titled [title], after their name. */
    abstract fun action(kind: NotificationKind, title: String): String

    /** What a notification without a comment means for the user; [editing] is about the role of a request of access. */
    abstract fun detail(kind: NotificationKind, editing: Boolean): String?

    abstract fun open(link: String): String

    /** Why the letter came: the user turned on letters about the [event]. */
    abstract fun why(event: String): String

    abstract fun settings(link: String): String

    abstract val mute: String
    abstract val confirmSubject: String

    abstract fun confirmText(link: String, ttl: String): String

    /** «1 час», «24 часа», «48 часов». */
    abstract fun hours(count: Long): String

    abstract fun chatTest(settingsLink: String): String

    data object RU : NotificationWords() {
        override val labels = mapOf(
            NotificationKind.MENTION to "Упоминание",
            NotificationKind.REPLY to "Ответ в ветке",
            NotificationKind.ASSIGNED to "Назначение ветки",
            NotificationKind.ACCESS_REQUEST to "Запрос доступа",
            NotificationKind.ACCESS_GRANTED to "Доступ к доске",
            NotificationKind.ACCESS_DECLINED to "Отказ в доступе",
            NotificationKind.OWNERSHIP to "Передача владения",
            NotificationKind.PROPOSAL_CREATED to "Предложение изменений",
            NotificationKind.PROPOSAL_ACCEPTED to "Предложение принято",
            NotificationKind.PROPOSAL_DECLINED to "Предложение отклонено",
            NotificationKind.REVIEW_REQUEST to "Запрос ревью",
        )

        override val events = mapOf(
            NotificationEvent.MENTIONS to "Упоминания",
            NotificationEvent.REPLIES to "Ответы в ветках",
            NotificationEvent.ASSIGNMENTS to "Назначенные ветки",
            NotificationEvent.ACCESS to "Доступ к доскам",
            NotificationEvent.REVIEWS to "Ревью",
        )

        override val boardUnavailable = "Доска недоступна"
        override val deletedUser = "Удалённый пользователь"

        override fun action(kind: NotificationKind, title: String): String {
            val board = "«$title»"
            return when (kind) {
                NotificationKind.MENTION -> "упоминание в $board"
                NotificationKind.REPLY -> "ответ в ветке на $board"
                NotificationKind.ASSIGNED -> "вам назначена ветка в $board"
                NotificationKind.ACCESS_REQUEST -> "запрос доступа к $board"
                NotificationKind.ACCESS_GRANTED -> "доступ к $board"
                NotificationKind.ACCESS_DECLINED -> "отказ в доступе к $board"
                NotificationKind.OWNERSHIP -> "передача владения $board"
                NotificationKind.PROPOSAL_CREATED -> "предложение изменений к $board"
                NotificationKind.PROPOSAL_ACCEPTED -> "ваше предложение к $board принято"
                NotificationKind.PROPOSAL_DECLINED -> "ваше предложение к $board отклонено"
                NotificationKind.REVIEW_REQUEST -> "запрос ревью на $board"
            }
        }

        override fun detail(kind: NotificationKind, editing: Boolean): String? = when (kind) {
            NotificationKind.ACCESS_REQUEST -> if (editing) "Просит редактирование" else "Просит просмотр"
            NotificationKind.ACCESS_GRANTED -> if (editing) "Теперь можно редактировать" else "Теперь можно смотреть"
            NotificationKind.ACCESS_DECLINED -> if (editing) "Вы просили редактирование" else "Вы просили просмотр"
            NotificationKind.OWNERSHIP -> "Теперь вы владелец доски"
            NotificationKind.REVIEW_REQUEST -> "Элемент отмечен «Нужно ревью»"
            else -> null
        }

        override fun open(link: String) = "Открыть в CoDraw: $link"

        override fun why(event: String) = "Письмо пришло, потому что в CoDraw включены письма о событиях «$event»."

        override fun settings(link: String) = "Настроить или отключить уведомления: $link"

        override val mute = "Не присылать уведомления об одной доске: меню доски → «Не присылать уведомления»."
        override val confirmSubject = "Подтвердите адрес для уведомлений CoDraw"

        override fun confirmText(link: String, ttl: String) = buildString {
            appendLine("Этот адрес указали в CoDraw, чтобы получать на него уведомления о досках.")
            appendLine().appendLine("Подтвердить адрес: $link")
            appendLine().appendLine("Ссылка действует $ttl.")
            append("Если вы не указывали этот адрес, просто не открывайте ссылку: писем больше не будет.")
        }

        override fun hours(count: Long): String {
            val word = when {
                count % 100 in 11..14 -> "часов"
                count % 10 == 1L -> "час"
                count % 10 in 2..4 -> "часа"
                else -> "часов"
            }
            return "$count $word"
        }

        override fun chatTest(settingsLink: String) =
            "CoDraw: уведомления будут приходить сюда. Настроить или отключить их: $settingsLink"
    }

    data object EN : NotificationWords() {
        override val labels = mapOf(
            NotificationKind.MENTION to "Mention",
            NotificationKind.REPLY to "Reply in a thread",
            NotificationKind.ASSIGNED to "Thread assigned",
            NotificationKind.ACCESS_REQUEST to "Access request",
            NotificationKind.ACCESS_GRANTED to "Access to a board",
            NotificationKind.ACCESS_DECLINED to "Access declined",
            NotificationKind.OWNERSHIP to "Ownership transfer",
            NotificationKind.PROPOSAL_CREATED to "Change proposal",
            NotificationKind.PROPOSAL_ACCEPTED to "Proposal accepted",
            NotificationKind.PROPOSAL_DECLINED to "Proposal declined",
            NotificationKind.REVIEW_REQUEST to "Review request",
        )

        override val events = mapOf(
            NotificationEvent.MENTIONS to "Mentions",
            NotificationEvent.REPLIES to "Replies in threads",
            NotificationEvent.ASSIGNMENTS to "Assigned threads",
            NotificationEvent.ACCESS to "Access to boards",
            NotificationEvent.REVIEWS to "Reviews",
        )

        override val boardUnavailable = "The board is unavailable"
        override val deletedUser = "Deleted user"

        override fun action(kind: NotificationKind, title: String): String {
            val board = "“$title”"
            return when (kind) {
                NotificationKind.MENTION -> "mention in $board"
                NotificationKind.REPLY -> "reply in a thread on $board"
                NotificationKind.ASSIGNED -> "a thread in $board is assigned to you"
                NotificationKind.ACCESS_REQUEST -> "access request to $board"
                NotificationKind.ACCESS_GRANTED -> "access to $board"
                NotificationKind.ACCESS_DECLINED -> "access to $board declined"
                NotificationKind.OWNERSHIP -> "ownership transfer of $board"
                NotificationKind.PROPOSAL_CREATED -> "change proposal to $board"
                NotificationKind.PROPOSAL_ACCEPTED -> "your proposal to $board is accepted"
                NotificationKind.PROPOSAL_DECLINED -> "your proposal to $board is declined"
                NotificationKind.REVIEW_REQUEST -> "review request on $board"
            }
        }

        override fun detail(kind: NotificationKind, editing: Boolean): String? = when (kind) {
            NotificationKind.ACCESS_REQUEST -> if (editing) "Asks to edit" else "Asks to view"
            NotificationKind.ACCESS_GRANTED -> if (editing) "You can edit now" else "You can view now"
            NotificationKind.ACCESS_DECLINED -> if (editing) "You asked to edit" else "You asked to view"
            NotificationKind.OWNERSHIP -> "You are the owner of the board now"
            NotificationKind.REVIEW_REQUEST -> "The element is marked “Needs review”"
            else -> null
        }

        override fun open(link: String) = "Open in CoDraw: $link"

        override fun why(event: String) = "You got this letter because letters about “$event” are on in CoDraw."

        override fun settings(link: String) = "Change or turn off notifications: $link"

        override val mute = "To stop notifications about one board: board menu → “Mute notifications”."
        override val confirmSubject = "Confirm the address for CoDraw notifications"

        override fun confirmText(link: String, ttl: String) = buildString {
            appendLine("This address was entered in CoDraw to receive notifications about boards.")
            appendLine().appendLine("Confirm the address: $link")
            appendLine().appendLine("The link is valid for $ttl.")
            append("If you did not enter this address, just do not open the link: no more letters will come.")
        }

        override fun hours(count: Long) = if (count == 1L) "1 hour" else "$count hours"

        override fun chatTest(settingsLink: String) =
            "CoDraw: notifications will come here. Change or turn them off: $settingsLink"
    }
}
