package io.github.thescarletarrow.codraw.board

import com.fasterxml.jackson.annotation.JsonValue
import io.github.thescarletarrow.codraw.workspace.WorkspaceRole
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
    /** The workspace that the board belongs to; `null` for a personal board. */
    val workspaceId: UUID? = null,
    /** The project of its workspace that the board is in; `null` for none. */
    val projectId: UUID? = null,
    /** What the workspace gives its editors and viewers on the board; a personal board has no use for it. */
    val workspaceAccess: WorkspaceAccess = WorkspaceAccess.EDIT,
    /**
     * When an administrator of the installation closed the link and the live image of the board; while it is set, its
     * owner opens neither again.
     */
    val sharingBlockedAt: Instant? = null,
) {
    /**
     * The role of the user [userId] on the board, or `null` when it gives them none. Its owner — on a board of a
     * workspace, the member of the workspace responsible for it — manages it. Anybody else gets the highest of their role
     * as a member, [memberRole], what the link gives and, on a board of a workspace, what their role in it,
     * [workspaceRole], gives: each of them only adds to the others.
     */
    fun roleOf(userId: UUID, memberRole: MemberRole?, workspaceRole: WorkspaceRole?): BoardRole? {
        if (ownerId == userId) return BoardRole.OWNER
        val inherited = if (workspaceId == null) null else workspaceRole?.let(workspaceAccess::roleOf)
        return listOfNotNull(memberRole?.role, linkAccess.role, inherited).maxOrNull()
    }
}

/**
 * What the workspace of a board gives its members on the board. Owners and administrators of the workspace manage all
 * its boards whatever it is; editors and viewers get what it says. Stored by its name.
 */
enum class WorkspaceAccess(@get:JsonValue val value: String) {
    /** Only those whom the board gives a role of their own, and those who manage the workspace. */
    NONE("none"),

    /** Editors and viewers of the workspace view the board. */
    VIEW("view"),

    /** Editors of the workspace edit the board, its viewers view it. */
    EDIT("edit"),
    ;

    /** The role on the board that a member of the workspace with the [role] gets; `null` for none. */
    fun roleOf(role: WorkspaceRole): BoardRole? = when {
        role.manages -> BoardRole.OWNER
        this == NONE -> null
        this == VIEW -> BoardRole.VIEWER
        else -> role.boardRole
    }
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
