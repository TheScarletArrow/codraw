package io.github.thescarletarrow.codraw

import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.DistributionSummary
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.binder.BaseUnits
import org.springframework.stereotype.Component

/** A limit of the installation, see [LimitProperties]; the tag of [CodrawMetrics.limitReached]. */
enum class Limit(val tag: String) {
    BOARDS("boards"),
    GUESTS("guests"),
    DOCUMENT("document"),
    VERSION("version"),
    CLIENT_ERRORS("client-errors"),
    COMMENTS("comments"),
    DECISIONS("decisions"),
    EMBED("embed"),
    MEMBERS("members"),
    INVITES("invites"),
    ACCESS_REQUESTS("access-requests"),
    PROPOSALS("proposals"),
    AUTHOR_PROPOSALS("proposals-per-author"),
    TAGS("tags"),
    FOLDERS("folders"),
    REVIEW_REQUESTS("review-requests"),
    SCHEMA_IMPORTS("schema-imports"),
    IMAGE("image"),
    IMAGES("images"),
    LIBRARIES("libraries"),
    LIBRARY_COMPONENTS("library-components"),
    LIBRARY_COMPONENT("library-component"),
    LIBRARIES_SIZE("libraries-size"),
    CONFIRMATION_EMAILS("confirmation-emails"),
    WORKSPACES("workspaces"),
    WORKSPACE_MEMBERS("workspace-members"),
    WORKSPACE_INVITES("workspace-invites"),
    WORKSPACE_PROJECTS("workspace-projects"),
    WORKSPACE_BOARDS("workspace-boards"),
}

/** How an attempt to send a message of a notification to a channel ended; the tag of [CodrawMetrics.notificationDelivery]. */
enum class DeliveryResult(val tag: String) {
    SENT("sent"),

    /** It did not go and is tried again later. */
    RETRIED("retried"),

    /** The recipient refused it, or it did not go in all the attempts. */
    FAILED("failed"),

    /** Not sent: the notification was read, or the settings or the access of the recipient changed meanwhile. */
    SKIPPED("skipped"),
}

/** Where an error in a browser came from; the tag of [CodrawMetrics.clientError]. */
enum class ClientErrorKind(val tag: String) {
    /** An error the page did not handle. */
    ERROR("error"),

    /** A rejected promise nobody handled. */
    UNHANDLED_REJECTION("unhandledrejection"),

    /** An error while React drew the page. */
    RENDER("render"),
}

/**
 * How an import of the schema of a database ended; the tag of [CodrawMetrics.schemaImport] and, but for [SUCCESS], the
 * `reason` of the answer.
 */
enum class SchemaImportResult(val tag: String) {
    SUCCESS("success"),

    /** The host is not among the hosts and networks that the administrator allowed. */
    HOST_NOT_ALLOWED("host-not-allowed"),

    /** No connection to a PostgreSQL server: refused, no answer, another protocol, SSL or a name that does not resolve. */
    CONNECTION_FAILED("connection-failed"),

    /** The server refused the user, the password or the database. */
    AUTHENTICATION_FAILED("authentication-failed"),

    SCHEMA_NOT_FOUND("schema-not-found"),

    /** The server did not answer the queries of the catalog in time. */
    TIMEOUT("timeout"),

    /** More tables or a longer DDL than an import reads. */
    TOO_LARGE("too-large"),

    /** A server older than PostgreSQL 12. */
    UNSUPPORTED_SERVER("unsupported-server"),
}

/** Metrics of what CoDraw does, next to those of HTTP, the JVM and the database pool that Micrometer collects. */
@Component
class CodrawMetrics(registry: MeterRegistry) {

    private val boardsCreated = Counter.builder("codraw.board.creations")
        .description("Boards created by users")
        .register(registry)

    private val guestsCreated = Counter.builder("codraw.guest.creations")
        .description("Guests created by continuing without a sign-in")
        .register(registry)

    private val documentsStored = DistributionSummary.builder("codraw.documents.stored")
        .description("Sizes of the board documents that collab stored")
        .baseUnit(BaseUnits.BYTES)
        .register(registry)

    // Registered up front, so that every limit and kind shows with 0 before it first happens.
    private val limitsReached = Limit.entries.associateWith { limit ->
        Counter.builder("codraw.limits.reached")
            .description("Requests refused because they reached a limit")
            .tag("limit", limit.tag)
            .register(registry)
    }

    private val cleanupDeleted = listOf("boards", "guests").associateWith { kind ->
        Counter.builder("codraw.guests.cleanup.deleted")
            .description("Boards and guests deleted by the cleanup of gone guests")
            .tag("kind", kind)
            .register(registry)
    }

    private val imagesStored = DistributionSummary.builder("codraw.images.stored")
        .description("Sizes of the images that participants put on boards, the same file of a board once")
        .baseUnit(BaseUnits.BYTES)
        .register(registry)

    private val imagesDeleted = Counter.builder("codraw.images.cleanup.deleted")
        .description("Images of deleted boards removed from the storage")
        .register(registry)

    private val clientErrors = ClientErrorKind.entries.associateWith { kind ->
        Counter.builder("codraw.client.errors")
            .description("Errors that browsers of participants reported")
            .tag("kind", kind.tag)
            .register(registry)
    }

    private val schemaImports = SchemaImportResult.entries.associateWith { result ->
        Counter.builder("codraw.schema.imports")
            .description("Imports of the schema of a database by users, by how they ended")
            .tag("result", result.tag)
            .register(registry)
    }

    private val notificationDeliveries = listOf("email", "webhook").associateWith { channel ->
        DeliveryResult.entries.associateWith { result ->
            Counter.builder("codraw.notifications.deliveries")
                .description("Attempts to send messages of notifications to email addresses and chats of users")
                .tag("channel", channel)
                .tag("result", result.tag)
                .register(registry)
        }
    }

    fun boardCreated() = boardsCreated.increment()

    fun guestCreated() = guestsCreated.increment()

    fun documentStored(size: Int) = documentsStored.record(size.toDouble())

    fun limitReached(limit: Limit) = limitsReached.getValue(limit).increment()

    fun clientError(kind: ClientErrorKind) = clientErrors.getValue(kind).increment()

    fun schemaImport(result: SchemaImportResult) = schemaImports.getValue(result).increment()

    /** An attempt to send a message to a channel, `email` or `webhook`, ended with the [result]. */
    fun notificationDelivery(channel: String, result: DeliveryResult) =
        notificationDeliveries.getValue(channel).getValue(result).increment()

    fun imageStored(size: Long) = imagesStored.record(size.toDouble())

    fun imagesDeleted(count: Int) = imagesDeleted.increment(count.toDouble())

    fun guestCleanupDeleted(boards: Int, guests: Int) {
        cleanupDeleted.getValue("boards").increment(boards.toDouble())
        cleanupDeleted.getValue("guests").increment(guests.toDouble())
    }
}
