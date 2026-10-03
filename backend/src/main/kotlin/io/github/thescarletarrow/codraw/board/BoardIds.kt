package io.github.thescarletarrow.codraw.board

import java.util.UUID

object BoardIds {

    private val canonicalUuid = Regex("^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$")

    /** Returns the board id, or `null` when [value] is not a canonical UUID and so cannot name a board. */
    fun parse(value: String): UUID? = if (canonicalUuid.matches(value)) UUID.fromString(value) else null
}
