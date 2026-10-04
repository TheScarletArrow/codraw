package io.github.thescarletarrow.codraw.user

import org.springframework.security.core.authority.AuthorityUtils
import org.springframework.security.oauth2.core.user.DefaultOAuth2User
import org.springframework.security.oauth2.core.user.OAuth2User
import java.util.UUID

private const val USER_ID = "userId"

/** Principal kept in the session of the signed-in user. Its name is the user id, provider attributes are not kept. */
fun User.toPrincipal(): OAuth2User =
    DefaultOAuth2User(AuthorityUtils.createAuthorityList("ROLE_USER"), mapOf(USER_ID to id.toString()), USER_ID)

/** Id of the signed-in user. */
val OAuth2User.userId: UUID
    get() = UUID.fromString(name)
