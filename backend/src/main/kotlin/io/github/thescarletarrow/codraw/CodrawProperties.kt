package io.github.thescarletarrow.codraw

import jakarta.validation.constraints.NotBlank
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.validation.annotation.Validated

@Validated
@ConfigurationProperties("codraw")
data class CodrawProperties(
    /** Shared secret that collab sends in `X-Internal-Token` to call the internal API. */
    @field:NotBlank
    val internalToken: String,
)
