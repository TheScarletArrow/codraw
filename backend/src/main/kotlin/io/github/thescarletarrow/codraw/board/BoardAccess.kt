package io.github.thescarletarrow.codraw.board

import com.fasterxml.jackson.annotation.JsonValue
import java.util.UUID

/** Who opens a board through its link besides its owner. Stored by name in `boards.link_access`. */
enum class LinkAccess(@get:JsonValue val value: String) {
    /** Nobody: only the owner opens the board. */
    NONE("none"),
    VIEW("view"),
    EDIT("edit"),
}

/** What the user may do on a board. */
enum class BoardRole(@get:JsonValue val value: String) {
    OWNER("owner"),
    EDITOR("editor"),
    VIEWER("viewer"),
}

/** The role of the user [userId] on the board, or `null` when the owner closed its link and so the board to them. */
fun Board.roleOf(userId: UUID): BoardRole? = when {
    ownerId == userId -> BoardRole.OWNER
    linkAccess == LinkAccess.EDIT -> BoardRole.EDITOR
    linkAccess == LinkAccess.VIEW -> BoardRole.VIEWER
    else -> null
}
