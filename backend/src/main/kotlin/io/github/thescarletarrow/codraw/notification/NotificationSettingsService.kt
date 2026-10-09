package io.github.thescarletarrow.codraw.notification

import io.github.thescarletarrow.codraw.AddressRateLimiter
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.Tokens
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.participated
import io.github.thescarletarrow.codraw.user.UserRepository
import io.github.thescarletarrow.codraw.user.guest
import jakarta.mail.internet.AddressException
import jakarta.mail.internet.InternetAddress
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * The channels of notifications outside of CoDraw of the signed-in user and the boards they muted. Only users of
 * GitHub and Google have them: a guest has no lasting account to send to. Every method works on the channels of the
 * user who asks; the address of a webhook never leaves the backend.
 */
@Service
class NotificationSettingsService(
    private val channels: NotificationChannels,
    private val users: UserRepository,
    private val boards: BoardService,
    private val messages: NotificationMessages,
    private val email: EmailTransport,
    private val webhooks: WebhookSender,
    private val properties: NotificationProperties,
    limits: LimitProperties,
    private val clock: Clock,
) {

    private val confirmationLetters = AddressRateLimiter(Duration.ofHours(1), { limits.confirmationEmailsPerUserPerHour }, clock)

    /** Whether letters can go: there is an SMTP server, a sender and an address of the app to link to. */
    val emailAvailable: Boolean
        get() = email.available && properties.appUrl.isNotBlank()

    /** Whether messages can go to chats: the administrator allowed hosts of webhooks, and there is an address of the app. */
    val webhookAvailable: Boolean
        get() = webhooks.available && properties.appUrl.isNotBlank()

    fun settings(userId: UUID): NotificationSettings {
        requireAccount(userId)
        val own = channels.list(userId).associateBy { it.kind }
        return NotificationSettings(
            email = EmailSettings(emailAvailable, own[ChannelKind.EMAIL]?.let(::emailView)),
            webhook = WebhookSettings(webhookAvailable, webhooks.hosts, own[ChannelKind.WEBHOOK]?.let(::webhookView)),
            mutedBoards = channels.mutedBoards(userId).map { muted ->
                val access = muted.board.roleOf(userId, muted.memberRole, muted.workspaceRole) != null
                MutedBoardView(muted.board.id!!, muted.board.title.takeIf { access }, muted.mutedAt)
            },
        )
    }

    /**
     * Sets the email channel of the user. A new address waits for its confirmation: a letter with a link goes to it at
     * once, and a failure to send it leaves the address saved with the error. Throws [ConfirmationLimitException] before
     * changing anything when the user had as many letters in the last hour as the limit allows.
     */
    fun saveEmail(userId: UUID, address: String, enabled: Boolean, events: Set<NotificationEvent>): EmailChannelView {
        requireAccount(userId)
        if (!emailAvailable) throw ChannelUnavailableException(ChannelKind.EMAIL)
        val normalized = validEmail(address)
        val existing = channels.find(userId, ChannelKind.EMAIL)
        if (existing != null && existing.address.equals(normalized, ignoreCase = true)) {
            return emailView(checkNotNull(channels.update(userId, ChannelKind.EMAIL, enabled, events)))
        }
        acquireLetter(userId)
        val token = Tokens.next()
        val channel = channels.save(userId, ChannelKind.EMAIL, normalized, enabled, events, null, hash(token), now())
        return emailView(sendConfirmation(channel, token))
    }

    /** Sends a new letter with a new link to the unconfirmed address of the user; the earlier link no longer works. */
    fun resendConfirmation(userId: UUID): EmailChannelView {
        requireAccount(userId)
        if (!emailAvailable) throw ChannelUnavailableException(ChannelKind.EMAIL)
        val channel = channels.find(userId, ChannelKind.EMAIL)?.takeIf { it.verifiedAt == null }
            ?: throw ChannelNotFoundException()
        acquireLetter(userId)
        val token = Tokens.next()
        if (!channels.newToken(userId, hash(token))) throw ChannelNotFoundException()
        return emailView(sendConfirmation(channel, token))
    }

    /** Confirms the email address of the user with the [token] of the link of their letter. */
    fun confirmEmail(userId: UUID, token: String) {
        requireAccount(userId)
        val now = now()
        if (!channels.confirm(userId, hash(token), now - properties.email.confirmationTtl, now)) throw InvalidTokenException()
    }

    /**
     * Sets the chat channel of the user: a new [url] of a webhook, checked against the allowed hosts, or, without it,
     * what the saved one sends.
     */
    fun saveWebhook(userId: UUID, url: String?, enabled: Boolean, events: Set<NotificationEvent>): WebhookChannelView {
        requireAccount(userId)
        if (!webhookAvailable) throw ChannelUnavailableException(ChannelKind.WEBHOOK)
        if (url == null) {
            val updated = channels.update(userId, ChannelKind.WEBHOOK, enabled, events)
                ?: throw InvalidWebhookUrlException(WebhookUrlProblem.INVALID)
            return webhookView(updated)
        }
        val checked = webhooks.check(url).toString()
        val now = now()
        return webhookView(channels.save(userId, ChannelKind.WEBHOOK, checked, enabled, events, now, null, now))
    }

    /** Posts a test message to the webhook of the user at once; throws [DeliveryException] when it did not go. */
    fun testWebhook(userId: UUID) {
        requireAccount(userId)
        if (!webhookAvailable) throw ChannelUnavailableException(ChannelKind.WEBHOOK)
        val channel = channels.find(userId, ChannelKind.WEBHOOK) ?: throw ChannelNotFoundException()
        try {
            webhooks.send(channel.address, messages.chatTest())
        } catch (exception: DeliveryException) {
            channels.failed(channel.id, exception.error, now())
            throw exception
        }
        channels.delivered(channel.id, now())
    }

    /** Deletes the channel of the user and the messages it has not sent; nothing happens without one. */
    fun delete(userId: UUID, kind: ChannelKind) {
        requireAccount(userId)
        channels.delete(userId, kind)
    }

    /** Stops the notifications of the board [boardId], which the user may open, from going to their channels. */
    fun mute(userId: UUID, boardId: String) {
        requireAccount(userId)
        val (board, _) = boards.participated(boardId, userId)
        channels.mute(userId, board.id!!, now())
    }

    /** Lets the notifications of the board go to the channels of the user again. */
    fun unmute(userId: UUID, boardId: UUID) {
        requireAccount(userId)
        channels.unmute(userId, boardId)
    }

    private fun sendConfirmation(channel: NotificationChannel, token: String): NotificationChannel {
        try {
            email.send(messages.confirmation(channel.address, token))
        } catch (exception: DeliveryException) {
            channels.failed(channel.id, exception.error, now())
            return checkNotNull(channels.findById(channel.id))
        }
        channels.verificationSent(channel.id, now())
        return checkNotNull(channels.findById(channel.id))
    }

    private fun acquireLetter(userId: UUID) {
        confirmationLetters.acquire(userId.toString())?.let { wait -> throw ConfirmationLimitException(wait) }
    }

    private fun requireAccount(userId: UUID) {
        val user = users.findById(userId) ?: throw GuestNotAllowedException()
        if (user.guest) throw GuestNotAllowedException()
    }

    /** The address of [address] as the channel keeps it: trimmed, one address without a name, at most 254 characters. */
    private fun validEmail(address: String): String {
        val trimmed = address.trim()
        if (trimmed.length > MAX_EMAIL_LENGTH) throw InvalidEmailException()
        val parsed = try {
            InternetAddress(trimmed, true)
        } catch (_: AddressException) {
            throw InvalidEmailException()
        }
        if (parsed.address != trimmed || parsed.personal != null || !trimmed.contains('@')) throw InvalidEmailException()
        return trimmed
    }

    private fun emailView(channel: NotificationChannel) = EmailChannelView(
        address = channel.address,
        verified = channel.verifiedAt != null,
        verificationSentAt = channel.verificationSentAt,
        enabled = channel.enabled,
        events = channel.events.sorted(),
        lastDeliveredAt = channel.lastDeliveredAt,
        lastError = channel.lastError,
        lastErrorAt = channel.lastErrorAt,
    )

    private fun webhookView(channel: NotificationChannel) = WebhookChannelView(
        // A host that the administrator no longer allows is shown all the same: the user sees what to replace.
        addressHint = runCatching { webhooks.hint(channel.address) }.getOrElse { "…" + channel.address.takeLast(4) },
        enabled = channel.enabled,
        events = channel.events.sorted(),
        lastDeliveredAt = channel.lastDeliveredAt,
        lastError = channel.lastError,
        lastErrorAt = channel.lastErrorAt,
    )

    private fun hash(token: String): ByteArray = MessageDigest.getInstance("SHA-256").digest(token.toByteArray())

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private companion object {
        const val MAX_EMAIL_LENGTH = 254
    }
}

/** What the page of the settings of notifications outside of CoDraw shows. */
data class NotificationSettings(
    val email: EmailSettings,
    val webhook: WebhookSettings,
    /** The boards whose notifications go to no channel, most recently muted first. */
    val mutedBoards: List<MutedBoardView>,
)

data class EmailSettings(
    /** Whether the installation sends letters. */
    val available: Boolean,
    val channel: EmailChannelView?,
)

data class WebhookSettings(
    /** Whether the installation sends messages to chats. */
    val available: Boolean,
    /** The hosts of webhooks that the administrator allows. */
    val hosts: List<String>,
    val channel: WebhookChannelView?,
)

data class EmailChannelView(
    val address: String,
    /** Whether the owner of the address confirmed it; letters go only to a confirmed address. */
    val verified: Boolean,
    /** When the letter with the link that confirms the address went, `null` when it did not go. */
    val verificationSentAt: Instant?,
    val enabled: Boolean,
    val events: List<NotificationEvent>,
    val lastDeliveredAt: Instant?,
    val lastError: DeliveryError?,
    val lastErrorAt: Instant?,
)

data class WebhookChannelView(
    /** The host and the last characters of the address, never the secret address itself. */
    val addressHint: String,
    val enabled: Boolean,
    val events: List<NotificationEvent>,
    val lastDeliveredAt: Instant?,
    val lastError: DeliveryError?,
    val lastErrorAt: Instant?,
)

data class MutedBoardView(
    val boardId: UUID,
    /** `null` when the user can no longer open the board. */
    val boardTitle: String?,
    val mutedAt: Instant,
)

/** Guests have no channels outside of CoDraw. */
class GuestNotAllowedException : RuntimeException("Notifications outside of CoDraw need a sign-in through GitHub or Google")

/** The installation does not send through this kind of channel. */
class ChannelUnavailableException(val kind: ChannelKind) : RuntimeException("The installation does not send to ${kind.value}")

/** The user has no such channel. */
class ChannelNotFoundException : RuntimeException("No such channel")

class InvalidEmailException : RuntimeException("The email address is not valid")

/** The link of a letter does not confirm an address of the user: another user's, used, expired or replaced. */
class InvalidTokenException : RuntimeException("The link does not confirm an address of the user")

/** The user had as many letters that confirm addresses in the last hour as the limit allows. */
class ConfirmationLimitException(val wait: Duration) : RuntimeException("Too many letters that confirm addresses")
