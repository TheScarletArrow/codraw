package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.account.Accounts
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * Internal API for collab: which of the users of its connections are gone, e.g. deleted their accounts, so that it
 * closes their connections. Ids that are no UUIDs name nobody, so they are gone too.
 */
@RestController
class MissingUsersController(private val accounts: Accounts) {

    @PostMapping("/internal/users/missing")
    fun missing(@RequestBody ids: List<String>): List<String> {
        val parsed = ids.take(MAX_IDS).associateWith { runCatching { UUID.fromString(it) }.getOrNull() }
        val missing = accounts.missing(parsed.values.filterNotNull()).toSet()
        return parsed.filter { (_, id) -> id == null || id in missing }.keys.toList()
    }

    private companion object {
        /** The most ids one request asks about; collab sends the users of all its connections at once. */
        const val MAX_IDS = 10_000
    }
}
