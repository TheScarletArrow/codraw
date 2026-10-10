package io.github.thescarletarrow.codraw.embed

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.Tokens
import io.github.thescarletarrow.codraw.board.BoardService
import io.github.thescarletarrow.codraw.board.SharingBlockedException
import io.github.thescarletarrow.codraw.board.ownedBy
import io.github.thescarletarrow.codraw.board.participated
import io.github.thescarletarrow.codraw.readAtMost
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.stereotype.Service
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.context.request.WebRequest
import org.springframework.web.server.ResponseStatusException
import java.io.InputStream
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/** The live image of a board as its participants see it: where it is and which page it shows. */
data class EmbedResponse(
    /** The address of the image, from the root of the site. */
    val path: String,
    val pageId: String,
    val updatedAt: Instant?,
)

data class EnableEmbedRequest(val pageId: String)

@Service
class EmbedService(private val embeds: Embeds, private val clock: Clock) {

    fun find(boardId: UUID): Embed? = embeds.find(boardId)

    fun enable(boardId: UUID, pageId: String): Embed = embeds.enable(boardId, pageId, Tokens.next(), now())

    fun disable(boardId: UUID) = embeds.disable(boardId)

    /** Stores the cleaned picture; `false` when the image of the board shows another page or none. */
    fun store(boardId: UUID, pageId: String, svg: String): Boolean =
        embeds.store(boardId, pageId, SvgSanitizer.sanitize(svg).toByteArray(), now())

    fun image(token: String): EmbedImage? = embeds.image(token)

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)
}

/**
 * Live images of boards: the owner turns the image of a page on and off, participants who edit publish its picture,
 * and anybody with the address gets the picture, without a sign-in.
 */
@RestController
class EmbedController(
    private val boards: BoardService,
    private val embeds: EmbedService,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
) {

    @GetMapping("/api/boards/{id}/embed")
    fun get(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): EmbedResponse {
        val board = boards.participated(id, principal.userId).board
        return embeds.find(checkNotNull(board.id))?.toResponse() ?: throw notEnabled()
    }

    @PutMapping("/api/boards/{id}/embed")
    fun enable(
        @PathVariable id: String,
        @RequestBody request: EnableEmbedRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): EmbedResponse {
        val board = boards.ownedBy(id, principal.userId)
        if (board.sharingBlockedAt != null) throw SharingBlockedException()
        if (request.pageId.length !in 1..PAGE_ID_MAX_LENGTH) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "pageId must have 1 to $PAGE_ID_MAX_LENGTH characters")
        }
        return embeds.enable(checkNotNull(board.id), request.pageId).toResponse()
    }

    @DeleteMapping("/api/boards/{id}/embed")
    fun disable(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        embeds.disable(checkNotNull(boards.ownedBy(id, principal.userId).id))
        return ResponseEntity.noContent().build()
    }

    /** The picture of the page of the image, drawn by the browser of a participant who edits the board. */
    @PutMapping("/api/boards/{id}/embed/image", consumes = [SVG_TYPE])
    fun publish(
        @PathVariable id: String,
        @RequestParam pageId: String,
        body: InputStream,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Void> {
        val (board, role) = boards.participated(id, principal.userId)
        if (!role.edits) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only participants who edit the board publish its image")
        }
        val bytes = body.readAtMost(limits.embedSize)
        if (bytes == null) {
            metrics.limitReached(Limit.EMBED)
            throw ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "The image must have at most ${limits.embedSize}")
        }
        val stored = try {
            embeds.store(checkNotNull(board.id), pageId, bytes.toString(Charsets.UTF_8))
        } catch (exception: InvalidSvgException) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, exception.message)
        }
        if (!stored) throw ResponseStatusException(HttpStatus.CONFLICT, "The image of the board shows another page, or none")
        return ResponseEntity.noContent().build()
    }

    /** Open to anybody with the address; checks for a newer picture once a minute. */
    @GetMapping("$PATH/{token:[A-Za-z0-9_-]{22}}.svg", produces = [SVG_TYPE])
    fun image(@PathVariable token: String, request: WebRequest): ResponseEntity<ByteArray> {
        val image = embeds.image(token) ?: throw notEnabled()
        val tag = "\"${image.updatedAt?.toEpochMilli() ?: 0}\""
        val headers = ResponseEntity.ok()
            .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
            .eTag(tag)
            .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
            .header("Cross-Origin-Resource-Policy", "cross-origin")
            .header("X-Content-Type-Options", "nosniff")
        if (request.checkNotModified(tag)) return headers.build()
        return headers.contentType(MediaType("image", "svg+xml", Charsets.UTF_8)).body(image.svg ?: PLACEHOLDER)
    }

    private fun notEnabled() = ResponseStatusException(HttpStatus.NOT_FOUND, "The board has no live image")

    private fun Embed.toResponse() = EmbedResponse("$PATH/$token.svg", pageId, updatedAt)

    companion object {
        const val PATH = "/api/embeds"
        const val SVG_TYPE = "image/svg+xml"
        private const val PAGE_ID_MAX_LENGTH = 100

        /** What the address shows before the first picture is published. */
        private val PLACEHOLDER = """
            <svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80">
              <rect width="320" height="80" rx="8" fill="#f6f8fa" stroke="#d0d7de"/>
              <text x="160" y="45" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#57606a">Схема ещё не нарисована</text>
            </svg>
        """.trimIndent().toByteArray()
    }
}
