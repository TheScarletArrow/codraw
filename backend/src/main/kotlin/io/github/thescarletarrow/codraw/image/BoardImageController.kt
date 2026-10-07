package io.github.thescarletarrow.codraw.image

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.board.Board
import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.participated
import io.github.thescarletarrow.codraw.proposal.ProposalService
import io.github.thescarletarrow.codraw.readAtMost
import io.github.thescarletarrow.codraw.user.userId
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.context.request.ServletWebRequest
import org.springframework.web.server.ResponseStatusException
import java.io.InputStream
import java.net.URI
import java.time.Duration
import java.util.UUID

/** An image of a board as the browser gets it after adding it. */
data class ImageResponse(
    val id: UUID,
    /** The address of the image from the root of the site, which shapes of the board refer to. */
    val url: String,
    val contentType: String,
    val size: Long,
    /** The size in pixels, from the header of the file. */
    val width: Int,
    val height: Int,
)

/**
 * Images of boards. Whoever edits a board adds images to it, and so does the author of an open proposal of changes of the
 * board, into its draft; whoever has a role on the board gets them, as `<img>` with the cookie of the session. Without a
 * role on the board everybody gets 403 like for the board itself.
 */
@RestController
@RequestMapping("/api/boards/{id}/images")
class BoardImageController(
    private val boards: BoardService,
    private val images: BoardImageService,
    private val proposals: ProposalService,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
) {

    /**
     * Adds the image file in the body to the board: 201 with the new image, or 200 with the image the board has with the
     * same bytes. `proposal` names an open proposal of the user, into whose draft the image goes.
     */
    @PostMapping
    fun add(
        @PathVariable id: String,
        @RequestParam(required = false) proposal: String?,
        body: InputStream,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<ImageResponse> {
        val (board, role) = boards.participated(id, principal.userId)
        if (!role.edits && !authorsOpenDraft(board, proposal, principal.userId)) {
            throw ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "Only participants who edit the board, and the authors of its open proposals in their drafts, add images",
            )
        }
        val bytes = body.readAtMost(limits.imageSize)
        if (bytes == null) {
            metrics.limitReached(Limit.IMAGE)
            throw ImageTooLargeException(limits.imageSize.toBytes(), pixels = false)
        }
        val stored = images.store(checkNotNull(board.id), bytes)
        val response = stored.image.toResponse()
        return if (stored.created) ResponseEntity.created(URI.create(response.url)).body(response) else ResponseEntity.ok(response)
    }

    /** How much room for images the board has; the browser checks a file before it sends it. */
    @GetMapping("/usage")
    fun usage(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ImageUsage =
        images.usage(checkNotNull(boards.participated(id, principal.userId).board.id))

    /**
     * The image, of the type its signature tells. An image never changes at its address, so the browser keeps it a year,
     * and shows it without a connection too; shared caches do not keep it.
     */
    @GetMapping("/{imageId}")
    fun get(
        @PathVariable id: String,
        @PathVariable imageId: String,
        request: ServletWebRequest,
        response: HttpServletResponse,
        @AuthenticationPrincipal principal: OAuth2User,
    ) {
        val board = boards.participated(id, principal.userId).board
        val image = BoardIds.parse(imageId)?.let { images.find(checkNotNull(board.id), it) } ?: throw notFound()
        response.setHeader("X-Content-Type-Options", "nosniff")
        response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox")
        // Only answers with the image are kept: a missing one may come once its upload is through.
        if (request.checkNotModified("\"${image.id}\"")) {
            response.setHeader(HttpHeaders.CACHE_CONTROL, CACHE.headerValue)
            return
        }
        val bytes = images.open(image) ?: throw notFound()
        bytes.use {
            response.setHeader(HttpHeaders.CACHE_CONTROL, CACHE.headerValue)
            response.contentType = image.type.mediaType
            response.setContentLengthLong(image.size)
            it.transferTo(response.outputStream)
        }
    }

    @ExceptionHandler
    fun unsupported(exception: UnsupportedImageException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.UNSUPPORTED_MEDIA_TYPE, exception.message).apply { title = "Unsupported image" }

    @ExceptionHandler
    fun tooLarge(exception: ImageTooLargeException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONTENT_TOO_LARGE, exception.message).apply {
            title = "Image too large"
            setProperty("limit", exception.limit)
            if (exception.pixels) setProperty("scope", "pixels")
        }

    @ExceptionHandler
    fun quotaReached(exception: ImageQuotaReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Image quota reached"
            setProperty("limit", exception.limit)
            setProperty("used", exception.used)
        }

    @ExceptionHandler
    fun boardGone(exception: BoardGoneException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.message)

    @ExceptionHandler
    fun storageUnavailable(exception: ImageStorageException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, exception.message)

    /** The user authors the open proposal [proposalId] of the [board], whose draft they edit whatever their role. */
    private fun authorsOpenDraft(board: Board, proposalId: String?, userId: UUID): Boolean {
        val access = proposalId?.let(BoardIds::parse)?.let(proposals::draftAccess) ?: return false
        return access.open && access.boardId == board.id && access.authorId == userId
    }

    private fun notFound() = ResponseStatusException(HttpStatus.NOT_FOUND, "Image not found")

    private fun BoardImage.toResponse() = ImageResponse(id, "/api/boards/$boardId/images/$id", type.mediaType, size, width, height)

    companion object {
        private val CACHE = CacheControl.maxAge(Duration.ofDays(365)).cachePrivate().immutable()
    }
}
