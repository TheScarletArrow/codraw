package io.github.thescarletarrow.codraw.admin

import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.embed.EmbedController
import io.github.thescarletarrow.codraw.embed.EmbedService
import io.github.thescarletarrow.codraw.user.User
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.util.UUID

/** A board with everything administrators know of it besides its content. */
data class AdminBoardDetails(
    val board: AdminBoard,
    val workspace: AdminWorkspace?,
    val sizes: AdminBoardSizes,
    /** The live image of the board; `null` when it is off. */
    val embed: AdminEmbed?,
    /** Its open reports, the oldest first. */
    val reports: List<BoardReport>,
)

data class ResolvedReports(val resolved: Int)

/**
 * The administration of the installation. The security configuration lets only administrators through to it, see
 * [AdminAuthorizationManager]; every handler takes the administrator again, for the journal.
 */
@RestController
@RequestMapping(AdminController.PATH)
class AdminController(
    private val access: AdminAccess,
    private val directory: AdminDirectory,
    private val admin: AdminService,
    private val reports: BoardReports,
    private val actions: AdminActions,
    private val embeds: EmbedService,
) {

    @GetMapping("/users")
    fun users(@RequestParam(defaultValue = "") query: String, @AuthenticationPrincipal principal: OAuth2User): List<AdminUser> {
        access.require(principal)
        return findUsers(query.trim())
    }

    @PostMapping("/users/{id}/block")
    fun block(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): AdminUser =
        userResponse(admin.block(access.require(principal), uuid(id)))

    @DeleteMapping("/users/{id}/block")
    fun unblock(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): AdminUser =
        userResponse(admin.unblock(access.require(principal), uuid(id)))

    @GetMapping("/boards")
    fun boards(@RequestParam(defaultValue = "") query: String, @AuthenticationPrincipal principal: OAuth2User): List<AdminBoard> {
        access.require(principal)
        return directory.boards(query.trim().take(QUERY_MAX_LENGTH), LIST_LIMIT)
    }

    @GetMapping("/boards/{id}")
    fun board(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): AdminBoardDetails {
        access.require(principal)
        return details(uuid(id))
    }

    @PostMapping("/boards/{id}/sharing-block")
    fun blockSharing(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): AdminBoardDetails {
        val boardId = uuid(id)
        admin.blockSharing(access.require(principal), boardId)
        return details(boardId)
    }

    @DeleteMapping("/boards/{id}/sharing-block")
    fun unblockSharing(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): AdminBoardDetails {
        val boardId = uuid(id)
        admin.unblockSharing(access.require(principal), boardId)
        return details(boardId)
    }

    @PostMapping("/boards/{id}/trash")
    fun trash(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): AdminBoardDetails {
        val boardId = uuid(id)
        admin.moveToTrash(access.require(principal), boardId)
        return details(boardId)
    }

    @PostMapping("/boards/{id}/reports/resolve")
    fun resolveReportsOf(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResolvedReports =
        ResolvedReports(admin.resolveReportsOf(access.require(principal), uuid(id)))

    /** Open reports, the oldest first, or with `status=resolved` the latest closed ones. */
    @GetMapping("/reports")
    fun reports(
        @RequestParam(defaultValue = "open") status: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): List<BoardReport> {
        access.require(principal)
        val resolved = when (status) {
            "open" -> false
            "resolved" -> true
            else -> throw ResponseStatusException(HttpStatus.BAD_REQUEST, "status is open or resolved")
        }
        return reports.list(resolved, REPORTS_LIMIT)
    }

    @PostMapping("/reports/{id}/resolve")
    fun resolveReport(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): BoardReport =
        admin.resolveReport(access.require(principal), uuid(id))

    /** The latest entries of the journal, newest first; `before` gives those before an entry. */
    @GetMapping("/actions")
    fun actions(@RequestParam(required = false) before: Instant?, @AuthenticationPrincipal principal: OAuth2User): List<AdminAction> {
        access.require(principal)
        return actions.page(before, ACTIONS_LIMIT)
    }

    private fun findUsers(query: String): List<AdminUser> =
        directory.users(query.take(QUERY_MAX_LENGTH), LIST_LIMIT) { provider, id -> access.isAdmin(provider, id) }

    private fun userResponse(user: User): AdminUser = checkNotNull(findUsers(user.id.toString()).singleOrNull { it.id == user.id })

    private fun details(boardId: UUID): AdminBoardDetails {
        val board = directory.board(boardId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found")
        return AdminBoardDetails(
            board = board,
            workspace = directory.workspace(boardId),
            sizes = directory.sizes(boardId),
            embed = embeds.find(boardId)?.let { AdminEmbed("${EmbedController.PATH}/${it.token}.svg", it.updatedAt) },
            reports = reports.openOf(boardId),
        )
    }

    private fun uuid(id: String): UUID = BoardIds.parse(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Not found")

    companion object {
        const val PATH = "/api/admin"
        private const val LIST_LIMIT = 50
        private const val REPORTS_LIMIT = 200
        private const val ACTIONS_LIMIT = 100
        private const val QUERY_MAX_LENGTH = 200
    }
}
