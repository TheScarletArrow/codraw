package io.github.thescarletarrow.codraw.notification

import jakarta.mail.MessagingException
import jakarta.mail.SendFailedException
import jakarta.mail.internet.AddressException
import jakarta.mail.internet.InternetAddress
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.mail.MailException
import org.springframework.mail.MailSendException
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.MimeMessageHelper
import org.springframework.stereotype.Component

/** A letter of CoDraw: plain text in UTF-8. */
data class Email(
    val to: String,
    val subject: String,
    val text: String,
    /** The page where the recipient turns such letters off, for the `List-Unsubscribe` header. */
    val unsubscribeUrl: String,
)

/** A message did not go; [error] tells whether trying again may help. */
class DeliveryException(val error: DeliveryError, message: String, cause: Throwable? = null) : RuntimeException(message, cause)

/** Sends letters. The e2e profile and the tests record them instead. */
interface EmailTransport {

    /** Whether letters can go at all: the installation set up an SMTP server and the sender. */
    val available: Boolean

    /** Sends the [email]; throws [DeliveryException] when it did not go. */
    fun send(email: Email)
}

/** Letters through the SMTP server of `spring.mail.*`, from `codraw.notifications.email.from`. */
@Component
class SmtpEmailTransport(
    private val mailSender: ObjectProvider<JavaMailSender>,
    @Value("\${spring.mail.host:}") private val host: String,
    private val properties: NotificationProperties,
) : EmailTransport {

    override val available: Boolean
        get() = host.isNotBlank() && properties.email.from.isNotBlank() && mailSender.ifAvailable != null

    override fun send(email: Email) {
        val sender = mailSender.ifAvailable ?: throw DeliveryException(DeliveryError.UNAVAILABLE, "No SMTP server is set up")
        val to = try {
            InternetAddress(email.to, true)
        } catch (exception: AddressException) {
            throw DeliveryException(DeliveryError.REJECTED, "The address is not valid", exception)
        }
        // A sender that the administrator mistyped refuses no address of a user: their letters wait for a fix.
        val from = try {
            InternetAddress(properties.email.from)
        } catch (exception: AddressException) {
            throw DeliveryException(DeliveryError.UNAVAILABLE, "The sender is not a valid address", exception)
        }
        try {
            val message = sender.createMimeMessage()
            MimeMessageHelper(message, false, Charsets.UTF_8.name()).apply {
                setFrom(from)
                setTo(to)
                setSubject(email.subject)
                setText(email.text)
            }
            // Mail servers and clients do not answer automatic letters with automatic ones, e.g. «out of office».
            message.setHeader("Auto-Submitted", "auto-generated")
            message.setHeader("List-Unsubscribe", "<${email.unsubscribeUrl}>")
            sender.send(message)
        } catch (exception: MessagingException) {
            throw DeliveryException(DeliveryError.UNAVAILABLE, "The letter could not be made", exception)
        } catch (exception: MailException) {
            throw DeliveryException(errorOf(exception), "The mail server did not take the letter", exception)
        }
    }

    /** A refused address is refused again; anything else, e.g. no connection or a sign-in that failed, may pass later. */
    private fun errorOf(exception: MailException): DeliveryError =
        if (exception is MailSendException && exception.messageExceptions.any { it.refusesAddress() }) {
            DeliveryError.REJECTED
        } else {
            DeliveryError.UNAVAILABLE
        }

    private fun Exception.refusesAddress(): Boolean =
        generateSequence(this as Throwable) { it.cause }.any { it is SendFailedException && !it.invalidAddresses.isNullOrEmpty() }
}
