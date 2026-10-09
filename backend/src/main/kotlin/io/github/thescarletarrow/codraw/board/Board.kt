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
    val deletedAt: Instant? = null,
) {
    /**
     * The role of the user [userId] on the board, or `null` when it gives them none. Anybody but the owner gets the
     * higher of their role as a member, [memberRole], and what the link gives: a role of their own gives more than the
     * link, never less.
     */
    fun roleOf(userId: UUID, memberRole: MemberRole?): BoardRole? =
        if (ownerId == userId) BoardRole.OWNER else listOfNotNull(memberRole?.role, linkAccess.role).maxOrNull()
}

/** What a link to a board gives to users other than its owner and its members. Stored by its name. */
enum class LinkAccess(@get:JsonValue val value: String, val role: BoardRole?) {
    /** Only the owner and the members open the board. */
    NONE("none", null),
    VIEW("view", BoardRole.VIEWER),

    /** Signed-in users view the board, as with [VIEW], and anybody else views it too, without a sign-in. */
    PUBLIC("public", BoardRole.VIEWER),
    EDIT("edit", BoardRole.EDITOR),
}

/** What the user may do on a board. Declared from the least to the most allowed, so that roles compare by it. */
enum class BoardRole(@get:JsonValue val value: String) {
    /** Views and comments, through the link or as a member. */
    VIEWER("viewer"),

    /** Edits, through the link or as a member. */
    EDITOR("editor"),

    OWNER("owner"),
    ;

    /** Whether the role changes the document of the board. */
    val edits: Boolean
        get() = this >= EDITOR

    /**
     * Whether the role sees, saves, names and restores the versions of the board. Whoever edits the board may wreck
     * it, so they may bring it back too; a restore keeps the state it replaces as a version.
     */
    val managesVersions: Boolean
        get() = edits
}

/** The role that the owner gives a member of a board. Stored by its name; declared from the least allowed. */
enum class MemberRole(@get:JsonValue val value: String, val role: BoardRole) {
    VIEWER("viewer", BoardRole.VIEWER),
    EDITOR("editor", BoardRole.EDITOR),
}
