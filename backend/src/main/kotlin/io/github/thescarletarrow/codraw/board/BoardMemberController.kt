package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.user.UserService
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import java.net.URI
import java.time.Instant
import java.util.UUID

/**
 * Who takes part in a board: its owner and members, the invitation links that make users members, and giving the board
 * to a member. Every participant sees the owner and the members; everything else is for the owner.
 */
@RestController
class BoardMemberController(
    private val boards: BoardService,
    private val members: BoardMemberService,
    private val users: UserService,
) {

    /** The owner first, then the members in the order they joined, with their roles of their own. */
    @GetMapping("$BOARD/members")
    fun members(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<Participant> =
        members.participants(boards.participated(id, principal.userId).board)

    /** Gives a member another role, or makes a user who opened the board through its link a member. */
    @PutMapping("$BOARD/members/{userId}")
    fun putMember(
        @PathVariable id: String,
        @PathVariable userId: String,
        @RequestBody request: MemberRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): Participant = members.putMember(boards.ownedBy(id, principal.userId), parseUser(userId), request.role)

    /** The user stops being a member; what the link gives stays theirs. */
    @DeleteMapping("$BOARD/members/{userId}")
    fun removeMember(
        @PathVariable id: String,
        @PathVariable userId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Void> {
        members.removeMember(boards.ownedBy(id, principal.userId), parseUser(userId))
        return ResponseEntity.noContent().build()
    }

    /** Users who opened the board through its link and are not members yet, for the owner to add them. */
    @GetMapping("$BOARD/visitors")
    fun visitors(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<Visitor> =
        members.visitors(boards.ownedBy(id, principal.userId))

    /** Makes a member the owner; the previous owner stays on the board as an editor. */
    @PutMapping("$BOARD/owner")
    fun changeOwner(
        @PathVariable id: String,
        @RequestBody request: OwnerRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): BoardResponse {
        val board = boards.transferOwnership(boards.ownedBy(id, principal.userId), request.userId)
        return board.toResponse(users.ownerOf(board), checkNotNull(boards.roleOf(board, principal.userId)))
    }

    /** The invitation links of the board, oldest first. */
    @GetMapping("$BOARD/invites")
    fun invites(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<InviteResponse> =
        members.invites(boards.ownedBy(id, principal.userId)).map { it.toResponse() }

    @PostMapping("$BOARD/invites")
    fun invite(
        @PathVariable id: String,
        @RequestBody request: MemberRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<InviteResponse> {
        val invite = members.invite(boards.ownedBy(id, principal.userId), request.role)
        return ResponseEntity.created(URI.create("/api/boards/${invite.boardId}/invites/${invite.id}")).body(invite.toResponse())
    }

    /** Revokes the invitation: its link stops working, and the members who joined through it stay. */
    @DeleteMapping("$BOARD/invites/{inviteId}")
    fun revoke(
        @PathVariable id: String,
        @PathVariable inviteId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Void> {
        val board = boards.ownedBy(id, principal.userId)
        members.revoke(board, BoardIds.parse(inviteId) ?: throw InviteNotFoundException())
        return ResponseEntity.noContent().build()
    }

    /** Anybody signed in, a guest too, accepts an invitation: they get its role on the board, which they see then. */
    @PostMapping("$INVITES/{token:[A-Za-z0-9_-]{22}}/accept")
    fun accept(@PathVariable token: String, @AuthenticationPrincipal principal: OAuth2User): BoardResponse {
        val board = members.accept(token, principal.userId)
        return board.toResponse(users.ownerOf(board), checkNotNull(boards.roleOf(board, principal.userId)))
    }

    @ExceptionHandler
    fun memberNotFound(exception: MemberNotFoundException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.message)

    @ExceptionHandler
    fun inviteNotFound(exception: InviteNotFoundException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.message)

    @ExceptionHandler
    fun memberLimitReached(exception: MemberLimitReachedException): ProblemDetail =
        limitReached("Member limit reached", exception.message, exception.limit)

    @ExceptionHandler
    fun inviteLimitReached(exception: InviteLimitReachedException): ProblemDetail =
        limitReached("Invitation limit reached", exception.message, exception.limit)

    /** The member who would become the owner owns as many boards as the limit allows. */
    @ExceptionHandler
    fun boardLimitReached(exception: BoardLimitReachedException): ProblemDetail =
        limitReached("Board limit reached", "The new owner owns ${exception.limit} boards, the most allowed", exception.limit)

    @ExceptionHandler
    fun ownerChanged(exception: BoardOwnerChangedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message)

    private fun limitReached(title: String, detail: String?, limit: Int): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, detail).apply {
            this.title = title
            setProperty("limit", limit)
        }

    private fun parseUser(id: String): UUID = BoardIds.parse(id) ?: throw MemberNotFoundException()

    private fun Invite.toResponse() = InviteResponse(id, "$INVITE_PAGE/$token", role, createdAt)

    companion object {
        private const val BOARD = "/api/boards/{id}"
        const val INVITES = "/api/invites"

        /** The page of the app that accepts an invitation. */
        const val INVITE_PAGE = "/invite"
    }
}

data class MemberRequest(val role: MemberRole)

data class OwnerRequest(val userId: UUID)

/** An invitation link of a board. */
data class InviteResponse(
    val id: UUID,
    /** The address of the invitation in the app, from the root of the site: `/invite/<token>`. */
    val path: String,
    val role: MemberRole,
    val createdAt: Instant,
)
