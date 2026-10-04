package io.github.thescarletarrow.codraw.collab

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

/** Public keys that collab uses to verify collab tokens. */
@RestController
class JwksController(private val keys: CollabSigningKeys) {

    @GetMapping(PATH)
    fun jwks(): Map<String, Any> = keys.jwks.toJSONObject(true)

    companion object {
        const val PATH = "/.well-known/jwks.json"
    }
}
