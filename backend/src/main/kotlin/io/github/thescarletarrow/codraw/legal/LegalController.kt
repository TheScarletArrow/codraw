package io.github.thescarletarrow.codraw.legal

import io.github.thescarletarrow.codraw.board.BoardVersionService
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
)

@RestController
class LegalController(private val legal: LegalProperties, private val guests: GuestProperties) {

    /** Open without a sign-in: the privacy policy and the terms of use are read before signing in. */
    @GetMapping(PATH)
    fun legal() = LegalResponse(
        operator = legal.operator.trim().ifEmpty { null },
        contactEmail = legal.contactEmail.trim().ifEmpty { null },
        guestBoardRetentionDays = guests.boardRetention.toDays(),
        guestSessionDays = GuestLoginController.SESSION_TIMEOUT.toDays(),
        versionsPerBoard = BoardVersionService.LIMIT,
    )

    companion object {
        const val PATH = "/api/legal"
    }
}
