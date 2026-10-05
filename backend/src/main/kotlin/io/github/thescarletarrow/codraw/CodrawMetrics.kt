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
    EMBED("embed"),
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

    private val clientErrors = ClientErrorKind.entries.associateWith { kind ->
        Counter.builder("codraw.client.errors")
            .description("Errors that browsers of participants reported")
            .tag("kind", kind.tag)
            .register(registry)
    }

    fun boardCreated() = boardsCreated.increment()

    fun guestCreated() = guestsCreated.increment()

    fun documentStored(size: Int) = documentsStored.record(size.toDouble())

    fun limitReached(limit: Limit) = limitsReached.getValue(limit).increment()

    fun clientError(kind: ClientErrorKind) = clientErrors.getValue(kind).increment()

    fun guestCleanupDeleted(boards: Int, guests: Int) {
        cleanupDeleted.getValue("boards").increment(boards.toDouble())
        cleanupDeleted.getValue("guests").increment(guests.toDouble())
    }
}
