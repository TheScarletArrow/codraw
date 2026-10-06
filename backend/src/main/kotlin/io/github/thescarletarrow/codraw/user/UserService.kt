package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.BoardVersionService
import io.github.thescarletarrow.codraw.comment.CommentService
import io.github.thescarletarrow.codraw.notification.NotificationService
import io.github.thescarletarrow.codraw.proposal.ProposalService
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.random.Random

@Service
class UserService(
    private val users: UserRepository,
    private val boards: BoardService,
    private val versions: BoardVersionService,
    private val comments: CommentService,
    private val notifications: NotificationService,
    private val proposals: ProposalService,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    /**
     * Returns the user signing in with [profile]. The first sign-in through a provider creates the user,
     * later sign-ins through the same provider find that user and update the name and the avatar.
     */
    @Transactional
    fun signIn(profile: ProviderProfile): User = users.upsert(
        provider = profile.provider,
        providerUserId = profile.providerUserId,
        name = profile.name,
        avatarUrl = profile.avatarUrl,
        createdAt = clock.instant().truncatedTo(ChronoUnit.MICROS),
    )

    /**
     * Signs in with [profile] in a session where the user [previousUserId] was signed in. When that was a guest,
     * the boards of the guest, the boards the guest opened through links or is a member of, the changes of the guest
     * that versions of boards name, the comments, the notifications and the proposals of changes of the guest pass to
     * the user signing in.
     */
    @Transactional
    fun signIn(profile: ProviderProfile, previousUserId: UUID?): User {
        val user = signIn(profile)
        val guest = previousUserId?.let(users::findById)?.takeIf { it.guest }
        if (guest != null && guest.id != user.id) {
            boards.transfer(guest.id, user.id)
            versions.transfer(guest.id, user.id)
            comments.transfer(guest.id, user.id)
            notifications.transfer(guest.id, user.id)
            proposals.transfer(guest.id, user.id)
        }
        return user
    }

    /** Creates a guest named «Гость N» for working without a sign-in provider. */
    @Transactional
    fun createGuest(): User =
        signIn(ProviderProfile(ProviderProfile.GUEST, UUID.randomUUID().toString(), "Гость ${Random.nextInt(1, 1000)}", null))
            .also { metrics.guestCreated() }

    fun find(id: UUID): User? = users.findById(id)
}
