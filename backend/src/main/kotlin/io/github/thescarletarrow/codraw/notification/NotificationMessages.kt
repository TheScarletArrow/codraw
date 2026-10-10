package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.board.MemberRole
import io.github.thescarletarrow.codraw.user.Language
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
 * Words of letters and of messages in chats, in the language of the recipient. They are those of the bell of the app
 * (`notifications/messages.ts` of the frontend) and do not depend on the gender of the actor: «Аня: упоминание», not
 * «Аня упомянула».
 */
@Component
class NotificationMessages(private val properties: NotificationProperties) {

    private val appUrl: String
        get() = properties.appUrl.trim().trimEnd('/')

    /** The page of the settings of notifications, which every message names. */
    val settingsLink: String
        get() = "$appUrl$SETTINGS_PATH"

    /** The [notification] as its recipient may see it now, in their [language]. */
    fun of(notification: Notification, language: Language = Language.RU): NotificationMessage {
        val words = WORDS.getValue(language)
        val label = words.labels.getValue(notification.kind)
        val link = appUrl + path(notification)
        if (!notification.access) return NotificationMessage(label, words.boardUnavailable, link)
        val action = words.action(notification.kind, notification.boardTitle.orEmpty())
        val detail = when (notification.kind) {
            NotificationKind.ACCESS_REQUEST, NotificationKind.ACCESS_GRANTED, NotificationKind.ACCESS_DECLINED,
            NotificationKind.OWNERSHIP, NotificationKind.REVIEW_REQUEST,
            -> words.detail(notification.kind, notification.role == MemberRole.EDITOR)
            else -> notification.snippet
        }
        val actor = notification.actor?.name ?: words.deletedUser
        return NotificationMessage("$actor: $action", detail, link)
    }

    /** The letter about the [message], which came through the [event] the user chose, in their [language]. */
    fun email(to: String, message: NotificationMessage, event: NotificationEvent, language: Language = Language.RU): Email {
        val words = WORDS.getValue(language)
        return Email(
            to = to,
            subject = oneLine(message.title),
            text = buildString {
                appendLine(message.title)
                message.detail?.let { appendLine().appendLine(it) }
                appendLine().appendLine(words.open(message.link))
                appendLine().appendLine("—")
                appendLine(words.why(words.events.getValue(event)))
                appendLine(words.settings(settingsLink))
                append(words.mute)
            },
            unsubscribeUrl = settingsLink,
        )
    }

    /** The letter with the link that confirms the address [to], in the [language] of the user. */
    fun confirmation(to: String, token: String, language: Language = Language.RU): Email {
        val words = WORDS.getValue(language)
        return Email(
            to = to,
            subject = words.confirmSubject,
            text = words.confirmText(
                "$settingsLink?confirm=${encode(token)}",
                words.hours(properties.email.confirmationTtl.toHours()),
            ),
            unsubscribeUrl = settingsLink,
        )
    }

    /** The message about the [message] in a chat. */
    fun chat(message: NotificationMessage): String = buildString {
        appendLine(chatText(message.title))
        message.detail?.let { appendLine(chatText(it)) }
        append(message.link)
    }

    /** The message that «Проверить» posts to a webhook, in the [language] of the user. */
    fun chatTest(language: Language = Language.RU): String = WORDS.getValue(language).chatTest(settingsLink)

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

    companion object {
        const val SETTINGS_PATH = "/settings/notifications"

        private val WORDS = mapOf(Language.RU to NotificationWords.RU, Language.EN to NotificationWords.EN)

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
