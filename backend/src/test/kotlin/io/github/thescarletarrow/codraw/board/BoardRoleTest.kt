package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.workspace.WorkspaceRole
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BoardRoleTest {
    private val owner = UUID.fromString("0199a000-0000-7000-8000-000000000001")
    private val lead = UUID.fromString("0199a000-0000-7000-8000-000000000002")
    private val board = Board(
        id = UUID.fromString("0199a000-0000-7000-8000-0000000000b1"),
        title = "Платежи",
        ownerId = owner,
        createdAt = Instant.EPOCH,
        updatedAt = Instant.EPOCH,
        linkAccess = LinkAccess.NONE,
        leadId = lead,
    )

    @Test
    fun `the lead manages the board whatever their role as a member, and edits it`() {
        assertEquals(BoardRole.LEAD, board.roleOf(lead, MemberRole.VIEWER, null))
        assertEquals(BoardRole.LEAD, board.roleOf(lead, MemberRole.EDITOR, null))
        assertTrue(BoardRole.LEAD.manages)
        assertTrue(BoardRole.LEAD.edits)
        assertTrue(BoardRole.LEAD.managesVersions)
        assertTrue(BoardRole.LEAD < BoardRole.OWNER)
    }

    @Test
    fun `only the owner and the lead manage the board`() {
        assertEquals(BoardRole.OWNER, board.roleOf(owner, null, null))
        assertTrue(BoardRole.OWNER.manages)
        assertFalse(BoardRole.EDITOR.manages)
        assertFalse(BoardRole.VIEWER.manages)
    }

    @Test
    fun `the lead who is no member gets nothing from being the lead`() {
        assertNull(board.roleOf(lead, null, null))
        assertEquals(BoardRole.VIEWER, board.copy(linkAccess = LinkAccess.VIEW).roleOf(lead, null, null))
    }

    @Test
    fun `an administrator of the workspace who is the lead stays an owner of its board`() {
        val inWorkspace = board.copy(workspaceId = UUID.fromString("0199a000-0000-7000-8000-0000000000c1"))

        assertEquals(BoardRole.OWNER, inWorkspace.roleOf(lead, MemberRole.EDITOR, WorkspaceRole.ADMIN))
        assertEquals(BoardRole.LEAD, inWorkspace.roleOf(lead, MemberRole.EDITOR, WorkspaceRole.EDITOR))
    }
}
