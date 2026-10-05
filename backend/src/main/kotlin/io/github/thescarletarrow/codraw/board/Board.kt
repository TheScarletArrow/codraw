package io.github.thescarletarrow.codraw.board

import com.fasterxml.jackson.annotation.JsonValue
import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

@Table("boards")
data class Board(
    @Id val id: UUID? = null,
    val title: String,
    val ownerId: UUID,
    val createdAt: Instant,
    val updatedAt: Instant,
    val linkAccess: LinkAccess = LinkAccess.EDIT,
) {
    /** The role of the user [userId] on the board, or `null` when its link gives them no access. */
    fun roleOf(userId: UUID): BoardRole? = when {
        ownerId == userId -> BoardRole.OWNER
        linkAccess == LinkAccess.EDIT -> BoardRole.EDITOR
        linkAccess == LinkAccess.VIEW -> BoardRole.VIEWER
        else -> null
    }
}

/** What a link to a board gives to users other than its owner. Stored by its name. */
enum class LinkAccess(@get:JsonValue val value: String) {
    /** Only the owner opens the board. */
    NONE("none"),
    VIEW("view"),
    EDIT("edit"),
}

/** What the user may do on a board. */
enum class BoardRole(@get:JsonValue val value: String) {
    OWNER("owner"),

    /** Opened the board through its link, which gives editing. */
    EDITOR("editor"),

    /** Opened the board through its link, which gives viewing only. */
    VIEWER("viewer"),
}
