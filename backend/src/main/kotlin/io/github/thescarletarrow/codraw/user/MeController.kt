package io.github.thescarletarrow.codraw.user

import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class MeController(private val users: UserService) {

    @GetMapping("/api/me")
    fun me(@AuthenticationPrincipal principal: OAuth2User): MeResponse {
        val user = checkNotNull(users.find(principal.userId)) { "Signed-in user ${principal.userId} does not exist" }
        return MeResponse(id = user.id, name = user.name, avatarUrl = user.avatarUrl, guest = user.guest)
    }
}

data class MeResponse(
    val id: UUID,
    val name: String,
    val avatarUrl: String?,
    val guest: Boolean,
)
