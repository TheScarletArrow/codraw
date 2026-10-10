package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.account.Accounts
import io.github.thescarletarrow.codraw.user.UserRepository
import jakarta.validation.Valid
import jakarta.validation.constraints.Size
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

data class UserChecksRequest(
    @field:Size(max = UserChecksController.MAX_USERS)
    val userIds: List<String>,
)

/** Which of the users that collab asked about may connect no more. */
data class UserChecksResponse(
    /** Users who are gone, e.g. deleted their accounts; ids that are no UUIDs name nobody, so they are gone too. */
    val missing: List<String>,
    /** Users whom an administrator of the installation blocked. */
    val blocked: List<String>,
)

/**
 * Internal API for collab: which of the users of its connections are gone or blocked, so that it refuses them and closes
 * their connections. Collab asks about all its connections at once, from time to time and when a user connects.
 */
@RestController
class UserChecksController(private val accounts: Accounts, private val users: UserRepository) {

    @PostMapping("/internal/users/check")
    fun check(@Valid @RequestBody request: UserChecksRequest): UserChecksResponse {
        val parsed = request.userIds.associateWith { runCatching { UUID.fromString(it) }.getOrNull() }
        val ids = parsed.values.filterNotNull()
        val missing = accounts.missing(ids).toSet()
        val blocked = if (ids.isEmpty()) emptySet() else users.blockedAmong(ids.toSet()).toSet()
        return UserChecksResponse(
            missing = parsed.filter { (_, id) -> id == null || id in missing }.keys.toList(),
            blocked = parsed.filter { (_, id) -> id != null && id in blocked }.keys.toList(),
        )
    }

    companion object {
        /** The most users one request asks about; collab sends the users of all its connections at once. */
        const val MAX_USERS = 10_000
    }
}
