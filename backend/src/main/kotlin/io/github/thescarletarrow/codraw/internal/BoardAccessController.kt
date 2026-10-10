package io.github.thescarletarrow.codraw.internal

import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardMembers
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.LinkAccess
import io.github.thescarletarrow.codraw.board.MemberRole
import io.github.thescarletarrow.codraw.board.WorkspaceAccess
import io.github.thescarletarrow.codraw.workspace.WorkspaceRole
import io.github.thescarletarrow.codraw.workspace.Workspaces
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Component
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/** Internal API for collab: who may edit or view the document of a board now, to update open connections. */
@RestController
class BoardAccessController(private val boards: BoardService, private val accesses: BoardAccesses) {

    /**
     * Everything that the role of any user on the board depends on, so that collab checks all connections of a document
     * with one request; the members of a board and of a workspace are limited.
     */
    @GetMapping("/internal/boards/{id}/access")
    fun access(@PathVariable id: String): ResponseEntity<BoardAccess> {
        val board = BoardIds.parse(id)?.let(boards::find) ?: return ResponseEntity.notFound().build()
        return ResponseEntity.ok(accesses.of(board))
    }
}

/** Reads what collab needs to know about the access to a board, for its document and for the drafts of its proposals. */
@Component
class BoardAccesses(private val members: BoardMembers, private val workspaces: Workspaces) {

    fun of(board: Board): BoardAccess = BoardAccess(
        ownerId = board.ownerId,
        linkAccess = board.linkAccess,
        members = members.roles(checkNotNull(board.id)),
        workspace = board.workspaceId?.let { WorkspaceBoardAccess(board.workspaceAccess, workspaces.roles(it)) },
    )
}

/**
 * The owner always edits the board; anybody else gets the highest of their role as a member, what its link gives and,
 * on a board of a workspace, what their role in the workspace gives, see `Board.roleOf`.
 */
data class BoardAccess(
    val ownerId: UUID,
    val linkAccess: LinkAccess,
    /** The roles of the members by their ids. */
    val members: Map<UUID, MemberRole>,
    /** What the workspace of the board gives its members; `null` for a personal board. */
    val workspace: WorkspaceBoardAccess?,
)

/**
 * Owners and administrators of the workspace edit its boards; its editors edit and its viewers view a board with
 * [WorkspaceAccess.EDIT], both view one with [WorkspaceAccess.VIEW], and neither gets anything from one with
 * [WorkspaceAccess.NONE].
 */
data class WorkspaceBoardAccess(
    val access: WorkspaceAccess,
    /** The roles of the members of the workspace by their ids. */
    val roles: Map<UUID, WorkspaceRole>,
)
