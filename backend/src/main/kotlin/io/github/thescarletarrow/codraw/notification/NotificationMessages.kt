package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.board.MemberRole
import org.springframework.stereotype.Component
import java.net.URLEncoder

/** A notification in words, as the bell of the app tells it, with the link to what it is about. */
data class NotificationMessage(
    /** «Аня: упоминание в «Схема БД»», or what happened without a name for a board the user can no longer open. */
    val title: String,
    /** The start of the comment, or what the notification means for the user. */
    val detail: String?,
    val link: String,
)

/**
 * Words of letters and of messages in chats. They are those of the bell of the app (`notifications/notifications.ts`
 * of the frontend) and do not depend on the gender of the actor: «Аня: упоминание», not «Аня упомянула».
 */
@Component
class NotificationMessages(private val properties: NotificationProperties) {

    private val appUrl: String
        get() = properties.appUrl.trim().trimEnd('/')

    /** The page of the settings of notifications, which every message names. */
    val settingsLink: String
        get() = "$appUrl$SETTINGS_PATH"

    /** The [notification] as its recipient may see it now. */
    fun of(notification: Notification): NotificationMessage {
        val label = LABELS.getValue(notification.kind)
        val link = appUrl + path(notification)
        if (!notification.access) return NotificationMessage(label, "Доска недоступна", link)
        val board = "«${notification.boardTitle}»"
        val editing = notification.role == MemberRole.EDITOR
        val (action, detail) = when (notification.kind) {
            NotificationKind.MENTION -> "упоминание в $board" to notification.snippet
            NotificationKind.REPLY -> "ответ в ветке на $board" to notification.snippet
            NotificationKind.ASSIGNED -> "вам назначена ветка в $board" to notification.snippet
            NotificationKind.ACCESS_REQUEST ->
                "запрос доступа к $board" to if (editing) "Просит редактирование" else "Просит просмотр"
            NotificationKind.ACCESS_GRANTED ->
                "доступ к $board" to if (editing) "Теперь можно редактировать" else "Теперь можно смотреть"
            NotificationKind.ACCESS_DECLINED ->
                "отказ в доступе к $board" to if (editing) "Вы просили редактирование" else "Вы просили просмотр"
            NotificationKind.OWNERSHIP -> "передача владения $board" to "Теперь вы владелец доски"
            NotificationKind.PROPOSAL_CREATED -> "предложение изменений к $board" to notification.snippet
            NotificationKind.PROPOSAL_ACCEPTED -> "ваше предложение к $board принято" to notification.snippet
            NotificationKind.PROPOSAL_DECLINED -> "ваше предложение к $board отклонено" to notification.snippet
            NotificationKind.REVIEW_REQUEST -> "запрос ревью на $board" to "Элемент отмечен «Нужно ревью»"
        }
        val actor = notification.actor?.name ?: "Удалённый пользователь"
        return NotificationMessage("$actor: $action", detail, link)
    }

    /** The letter about the [message], which came through the [event] the user chose. */
    fun email(to: String, message: NotificationMessage, event: NotificationEvent): Email = Email(
        to = to,
        subject = oneLine(message.title),
        text = buildString {
            appendLine(message.title)
            message.detail?.let { appendLine().appendLine(it) }
            appendLine().appendLine("Открыть в CoDraw: ${message.link}")
            appendLine().appendLine("—")
            appendLine("Письмо пришло, потому что в CoDraw включены письма о событиях «${EVENT_NAMES.getValue(event)}».")
            appendLine("Настроить или отключить уведомления: $settingsLink")
            append("Не присылать уведомления об одной доске: меню доски → «Не присылать уведомления».")
        },
        unsubscribeUrl = settingsLink,
    )

    /** The letter with the link that confirms the address [to]. */
    fun confirmation(to: String, token: String): Email = Email(
        to = to,
        subject = "Подтвердите адрес для уведомлений CoDraw",
        text = buildString {
            appendLine("Этот адрес указали в CoDraw, чтобы получать на него уведомления о досках.")
            appendLine().appendLine("Подтвердить адрес: $settingsLink?confirm=${encode(token)}")
            appendLine().appendLine("Ссылка действует ${hours(properties.email.confirmationTtl.toHours())}.")
            append("Если вы не указывали этот адрес, просто не открывайте ссылку: писем больше не будет.")
        },
        unsubscribeUrl = settingsLink,
    )

    /** The message about the [message] in a chat. */
    fun chat(message: NotificationMessage): String = buildString {
        appendLine(chatText(message.title))
        message.detail?.let { appendLine(chatText(it)) }
        append(message.link)
    }

    /** The message that «Проверить» posts to a webhook. */
    fun chatTest(): String =
        "CoDraw: уведомления будут приходить сюда. Настроить или отключить их: $settingsLink"

    /** Where the [notification] leads in the app, as in the bell. */
    private fun path(notification: Notification): String {
        val board = "/boards/${notification.boardId}"
        if (!notification.access) return board
        if (notification.kind in THREAD_KINDS && notification.threadId != null) {
            return board + query(listOfNotNull(notification.pageId?.let { "page" to it }, "thread" to notification.threadId.toString()))
        }
        if (notification.kind == NotificationKind.ACCESS_REQUEST) return "$board?share=requests"
        if (notification.kind == NotificationKind.REVIEW_REQUEST && notification.pageId != null && notification.cellId != null) {
            return board + query(listOf("page" to notification.pageId, "cell" to notification.cellId))
        }
        notification.proposalId?.let { return board + query(listOf("proposal" to it.toString())) }
        return board
    }

    private fun query(parameters: List<Pair<String, String>>): String =
        parameters.joinToString("&", prefix = "?") { (name, value) -> "$name=${encode(value)}" }

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8)

    /** «1 час», «24 часа», «48 часов». */
    private fun hours(count: Long): String {
        val word = when {
            count % 100 in 11..14 -> "часов"
            count % 10 == 1L -> "час"
            count % 10 in 2..4 -> "часа"
            else -> "часов"
        }
        return "$count $word"
    }

    companion object {
        const val SETTINGS_PATH = "/settings/notifications"

        /** What happened, as a notification about a board the user can no longer open says it. */
        private val LABELS = mapOf(
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

        /** The names of the events in the settings. */
        val EVENT_NAMES = mapOf(
            NotificationEvent.MENTIONS to "Упоминания",
            NotificationEvent.REPLIES to "Ответы в ветках",
            NotificationEvent.ASSIGNMENTS to "Назначенные ветки",
            NotificationEvent.ACCESS to "Доступ к доскам",
            NotificationEvent.REVIEWS to "Ревью",
        )

        /** The kinds of notifications about a thread, which lead to it. */
        private val THREAD_KINDS = setOf(NotificationKind.MENTION, NotificationKind.REPLY, NotificationKind.ASSIGNED)

        /** Breaks a mention of a chat («@channel», «@here», «@Аня») without changing how the text reads. */
        private const val ZERO_WIDTH_SPACE = '​'

        /** A subject of a letter is one line, whatever the title of the board holds. */
        private fun oneLine(text: String) = text.replace(Regex("\\s+"), " ").trim()

        /**
         * Text of users in a message of a chat: `&`, `<` and `>` are the control characters of Slack (`<!channel>`,
         * `<url|text>`), and `@` mentions people and whole channels in Slack and Mattermost.
         */
        fun chatText(text: String): String = text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("@", "@$ZERO_WIDTH_SPACE")
    }
}
