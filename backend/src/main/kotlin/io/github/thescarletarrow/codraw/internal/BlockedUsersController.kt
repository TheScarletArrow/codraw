package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.user.UserRepository
import jakarta.validation.Valid
import jakarta.validation.constraints.Size
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

data class BlockedUsersRequest(
    @field:Size(max = BlockedUsersController.MAX_USERS)
    val userIds: List<UUID>,
)

data class BlockedUsersResponse(val blocked: List<UUID>)

/**
 * Internal API for collab: which of the users it has connected an administrator blocked, to refuse them and to close
 * their connections. Collab asks about all its connections at once, from time to time and when a user connects.
 */
@RestController
class BlockedUsersController(private val users: UserRepository) {

    @PostMapping("/internal/users/blocked")
    fun blocked(@Valid @RequestBody request: BlockedUsersRequest): BlockedUsersResponse =
        BlockedUsersResponse(if (request.userIds.isEmpty()) emptyList() else users.blockedAmong(request.userIds.toSet()))

    companion object {
        const val MAX_USERS = 1000
    }
}
