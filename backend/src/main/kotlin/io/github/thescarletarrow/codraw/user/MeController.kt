package io.github.thescarletarrow.codraw.user

import io.github.thescarletarrow.codraw.admin.AdminAccess
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
class MeController(private val users: UserService, private val admins: AdminAccess) {

    @GetMapping("/api/me")
    fun me(@AuthenticationPrincipal principal: OAuth2User): MeResponse {
        val user = checkNotNull(users.find(principal.userId)) { "Signed-in user ${principal.userId} does not exist" }
        return MeResponse(
            id = user.id,
            name = user.name,
            avatarUrl = user.avatarUrl,
            guest = user.guest,
            language = user.language.tag,
            admin = admins.isAdmin(user),
        )
    }

    /** The app tells the language it shows, in which letters and messages of notifications of the user go then. */
    @PutMapping("/api/me/language")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun setLanguage(@AuthenticationPrincipal principal: OAuth2User, @RequestBody body: LanguageRequest) {
        val language = Language.of(body.language)
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown language ${body.language}")
        users.setLanguage(principal.userId, language)
    }
}

data class MeResponse(
    val id: UUID,
    val name: String,
    val avatarUrl: String?,
    val guest: Boolean,
    /** `ru` or `en`. */
    val language: String,
    /** The configuration of the installation makes the user its administrator. */
    val admin: Boolean,
)

data class LanguageRequest(val language: String)
