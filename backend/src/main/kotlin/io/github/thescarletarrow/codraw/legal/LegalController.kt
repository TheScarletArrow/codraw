package io.github.thescarletarrow.codraw.legal

import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.BoardVersionService
import io.github.thescarletarrow.codraw.issue.IssueProperties
import io.github.thescarletarrow.codraw.notification.NotificationProperties
import io.github.thescarletarrow.codraw.schemaimport.SchemaImportProperties
import io.github.thescarletarrow.codraw.security.CodrawClientRegistrations
import io.github.thescarletarrow.codraw.user.GuestLoginController
import io.github.thescarletarrow.codraw.user.GuestProperties
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Who provides this installation of CoDraw to its users, for the privacy policy and the terms of use: CoDraw is
 * deployed by others, so the operator is a setting of the deployment.
 */
@ConfigurationProperties("codraw.legal")
data class LegalProperties(
    /** The name of the operator, e.g. a company or a person. */
    val operator: String = "",
    /** Where users write about their data and the service. */
    val contactEmail: String = "",
)

/**
 * The operator of the installation, `null` for what the deployment does not set, and how long the installation keeps
 * data: the privacy policy states the settings in force, not the defaults.
 */
data class LegalResponse(
    val operator: String?,
    val contactEmail: String?,
    /** A board of a guest who can no longer come back is deleted once nobody worked on it for this many days. */
    val guestBoardRetentionDays: Long,
    /** A guest who does not come back for this many days can no longer come back. */
    val guestSessionDays: Long,
    /** The most versions kept of a board. */
    val versionsPerBoard: Int,
    /** A notification is deleted once it is this many days old. */
    val notificationRetentionDays: Long,
    /** The most notifications kept of a user. */
    val notificationsPerUser: Int,
    /** The most closed proposals of changes kept of a board. */
    val closedProposalsPerBoard: Int,
    /** Whether users may read schemas of databases through the server, with the user and the password of a database. */
    val schemaImport: Boolean,
    /** Whether users may connect GitHub with a token of theirs and link its issues to elements and threads of boards. */
    val issues: Boolean,
    /** The providers that users of this installation sign in through: they learn of every sign-in. */
    val signInProviders: List<LegalSignInProvider>,
    /** Whether «Продолжить без входа» creates guests. */
    val guests: Boolean,
)

data class LegalSignInProvider(
    val name: String,
    /** A provider of OpenID Connect that the operator chose, not GitHub or Google. */
    val corporate: Boolean,
)

@RestController
class LegalController(
    private val legal: LegalProperties,
    private val guests: GuestProperties,
    private val notifications: NotificationProperties,
    private val limits: LimitProperties,
    private val schemaImport: SchemaImportProperties,
    private val issues: IssueProperties,
    private val registrations: CodrawClientRegistrations,
) {

    /** Open without a sign-in: the privacy policy and the terms of use are read before signing in. */
    @GetMapping(PATH)
    fun legal() = LegalResponse(
        operator = legal.operator.trim().ifEmpty { null },
        contactEmail = legal.contactEmail.trim().ifEmpty { null },
        guestBoardRetentionDays = guests.boardRetention.toDays(),
        guestSessionDays = GuestLoginController.SESSION_TIMEOUT.toDays(),
        versionsPerBoard = BoardVersionService.LIMIT,
        notificationRetentionDays = notifications.retention.toDays(),
        notificationsPerUser = limits.notificationsPerUser,
        closedProposalsPerBoard = limits.closedProposalsPerBoard,
        schemaImport = schemaImport.enabled,
        issues = issues.github.apiUrl.isNotBlank(),
        signInProviders = registrations.providers.map { LegalSignInProvider(it.name, it.corporate) },
        guests = guests.enabled,
    )

    companion object {
        const val PATH = "/api/legal"
    }
}
