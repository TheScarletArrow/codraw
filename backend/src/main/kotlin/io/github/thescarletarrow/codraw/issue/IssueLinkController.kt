package io.github.thescarletarrow.codraw.issue

import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.participated
import io.github.thescarletarrow.codraw.notification.NotificationProperties
import io.github.thescarletarrow.codraw.user.Language
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import org.springframework.web.servlet.support.ServletUriComponentsBuilder
import java.net.URI
import java.util.UUID

/**
 * Issues of the tracker linked to elements and threads of a board. Everybody whose role lets them open the board sees
 * the links and has them brought up to date; the owner and the editors link issues to elements, and everybody who may
 * open the board to threads, as they comment, with a connection of their own to the tracker. When the owner closes the
 * link, everybody but the members gets 403 like for the board itself. Errors carry the `reason` of [IssueProblems].
 */
@RestController
@RequestMapping("/api/boards/{id}")
class IssueLinkController(
    private val boards: BoardService,
    private val links: IssueLinkService,
    private val notifications: NotificationProperties,
) {

    /** All links of the board, oldest first. */
    @GetMapping("/issue-links")
    fun links(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<IssueLink> =
        links.links(boards.participated(id, principal.userId).board)

    /** Links an issue of the tracker to an element or a thread: 201, or 200 when it was linked there already. */
    @PostMapping("/issue-links")
    fun link(
        @PathVariable id: String,
        @RequestBody request: LinkIssueRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<IssueLink> {
        val (board, role) = boards.participated(id, principal.userId)
        val repository = repository(request.repository)
        if (request.number < 1) badRequest("An issue has a positive number")
        val target = target(request.pageId, request.cellId, request.threadId)
        val (link, created) = links.link(board, role, principal.userId, target, repository, request.number)
        return answer(board.id!!, link, created)
    }

    /**
     * Creates an issue in the tracker with a link back to the element or the thread, and links it there: 201, or 200
     * for a repeated `requestId`, which creates nothing.
     */
    @PostMapping("/issues")
    fun create(
        @PathVariable id: String,
        @RequestBody request: CreateIssueRequest,
        @AuthenticationPrincipal principal: OAuth2User,
        @RequestHeader(HttpHeaders.ACCEPT_LANGUAGE, required = false) acceptLanguage: String?,
    ): ResponseEntity<IssueLink> {
        val (board, role) = boards.participated(id, principal.userId)
        val target = target(request.pageId, request.cellId, request.threadId)
        val title = request.title.trim()
        if (title.length !in 1..TITLE_MAX_LENGTH) badRequest("A title has 1 to $TITLE_MAX_LENGTH characters")
        if (request.description.length > DESCRIPTION_MAX_LENGTH) badRequest("A description has at most $DESCRIPTION_MAX_LENGTH characters")
        val label = request.elementLabel?.trim()?.take(LABEL_MAX_LENGTH)
        // The link back speaks the language of the author of the issue.
        val language = Language.ofAcceptLanguage(acceptLanguage)
        val backLink = BackLink.of(appUrl(), board, target, label.takeIf { target.element }, language)
        val (link, created) = links.create(
            board, role, principal.userId, target, request.requestId, repository(request.repository), title, request.description, backLink,
        )
        return answer(board.id!!, link, created)
    }

    /** Brings the links up to date with the tracker, those not asked about for a minute; at most 20 at once. */
    @PostMapping("/issue-links/refresh")
    fun refresh(
        @PathVariable id: String,
        @RequestBody request: RefreshLinksRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): List<IssueLink> {
        if (request.ids.size > REFRESH_MAX) badRequest("At most $REFRESH_MAX links at once")
        return links.refresh(boards.participated(id, principal.userId).board, request.ids.distinct())
    }

    /** Makes the link the user's own: their token, which reaches the issue, keeps it up to date since. */
    @PostMapping("/issue-links/{linkId}/take-over")
    fun takeOver(
        @PathVariable id: String,
        @PathVariable linkId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): IssueLink {
        val (board, role) = boards.participated(id, principal.userId)
        return links.takeOver(board, role, principal.userId, parse(linkId))
    }

    /** Deletes the link; the issue stays in the tracker. */
    @DeleteMapping("/issue-links/{linkId}")
    fun unlink(
        @PathVariable id: String,
        @PathVariable linkId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Void> {
        val (board, role) = boards.participated(id, principal.userId)
        links.unlink(board, role, principal.userId, parse(linkId))
        return ResponseEntity.noContent().build()
    }

    private fun answer(boardId: UUID, link: IssueLink, created: Boolean): ResponseEntity<IssueLink> =
        if (created) {
            ResponseEntity.created(URI.create("/api/boards/$boardId/issue-links/${link.id}")).body(link)
        } else {
            ResponseEntity.ok(link)
        }

    /** The address of the app that the link back from an issue leads to: the configured one, or that of this request. */
    private fun appUrl(): String = notifications.appUrl.trim().ifEmpty { ServletUriComponentsBuilder.fromCurrentContextPath().toUriString() }

    private fun target(pageId: String?, cellId: String?, threadId: UUID?): IssueTarget = when {
        threadId != null && pageId == null && cellId == null -> IssueTarget.thread(threadId)
        threadId == null && pageId != null && cellId != null -> {
            if (pageId.length !in 1..ID_MAX_LENGTH || cellId.length !in 1..ID_MAX_LENGTH) {
                badRequest("pageId and cellId must have 1 to $ID_MAX_LENGTH characters")
            }
            IssueTarget.element(pageId, cellId)
        }
        else -> badRequest("An issue is linked to an element (pageId and cellId) or to a thread (threadId)")
    }

    private fun repository(value: String): String =
        value.trim().takeIf(Repositories::isName) ?: badRequest("A repository is owner/name")

    private fun parse(id: String): UUID = BoardIds.parse(id) ?: throw IssueLinkNotFoundException()

    private fun badRequest(reason: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, reason)

    private companion object {
        const val ID_MAX_LENGTH = 100
        const val TITLE_MAX_LENGTH = 256
        const val DESCRIPTION_MAX_LENGTH = 20000
        const val LABEL_MAX_LENGTH = 200
        const val REFRESH_MAX = 20
    }
}

/** An issue to link: to an element by `pageId` and `cellId`, or to a thread by `threadId`. */
data class LinkIssueRequest(
    val pageId: String? = null,
    val cellId: String? = null,
    val threadId: UUID? = null,
    /** `owner/name`. */
    val repository: String,
    val number: Int,
)

/** An issue to create in the tracker and link to an element or a thread. */
data class CreateIssueRequest(
    /** Chosen by the client once per issue: a repeated request with it creates nothing. */
    val requestId: UUID,
    val pageId: String? = null,
    val cellId: String? = null,
    val threadId: UUID? = null,
    val repository: String,
    val title: String,
    /** Markdown, before the link back to CoDraw. */
    val description: String = "",
    /** The label of the element, which the link back names. */
    val elementLabel: String? = null,
)

data class RefreshLinksRequest(val ids: List<UUID>)
