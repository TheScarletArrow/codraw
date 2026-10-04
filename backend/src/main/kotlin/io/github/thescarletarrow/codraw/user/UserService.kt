package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.board.BoardService
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
     * the boards of the guest pass to the user signing in.
     */
    @Transactional
    fun signIn(profile: ProviderProfile, previousUserId: UUID?): User {
        val user = signIn(profile)
        val guest = previousUserId?.let(users::findById)?.takeIf { it.guest }
        if (guest != null && guest.id != user.id) {
            boards.changeOwner(guest.id, user.id)
        }
        return user
    }

    /** Creates a guest named «Гость N» for working without a sign-in provider. */
    @Transactional
    fun createGuest(): User =
        signIn(ProviderProfile(ProviderProfile.GUEST, UUID.randomUUID().toString(), "Гость ${Random.nextInt(1, 1000)}", null))

    fun find(id: UUID): User? = users.findById(id)
}
