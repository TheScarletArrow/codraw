package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.readAtMost
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.io.InputStream
import java.net.URI

/**
 * Versions of a board: earlier states of its document, with their names and authors, which those who edit the board
 * see, save, name and restore.
 */
@RestController
@RequestMapping("/api/boards/{id}/versions")
class BoardVersionController(
    private val boards: BoardService,
    private val versions: BoardVersionService,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
) {

    @GetMapping
    fun list(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): List<BoardVersion> =
        versions.list(boardId(id, principal))

    @GetMapping("/{versionId}", produces = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
    fun state(
        @PathVariable id: String,
        @PathVariable versionId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ByteArray {
        val boardId = boardId(id, principal)
        return BoardIds.parse(versionId)?.let { versions.state(boardId, it) } ?: throw versionNotFound()
    }

    /**
     * Saves the state of the document that the page of an editor sends, e.g. right before it restores a version, with
     * the [name] if any: the body is the state, so the name is a parameter.
     */
    @PostMapping(consumes = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
    fun save(
        @PathVariable id: String,
        @RequestParam reason: String,
        @RequestParam(required = false) name: String?,
        body: InputStream,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<BoardVersion> {
        val boardId = boardId(id, principal)
        val versionReason = SAVED_REASONS[reason]
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Reason must be one of ${SAVED_REASONS.keys}")
        val versionName = versionName(name)
        val state = body.readAtMost(limits.documentSize)
        if (state == null) metrics.limitReached(Limit.VERSION)
        if (state == null || state.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "The state must have 1 byte to ${limits.documentSize}")
        }
        val version = versions.save(boardId, state, versionReason, versionName)
        return ResponseEntity.created(URI.create("/api/boards/$boardId/versions/${version.id}")).body(version)
    }

    /** Gives the version a new name; an empty name or `null` takes the name away. */
    @PatchMapping("/{versionId}")
    fun rename(
        @PathVariable id: String,
        @PathVariable versionId: String,
        @RequestBody request: RenameVersionRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): BoardVersion {
        val boardId = boardId(id, principal)
        val name = versionName(request.name)
        return BoardIds.parse(versionId)?.let { versions.rename(boardId, it, name) } ?: throw versionNotFound()
    }

    private fun boardId(id: String, principal: OAuth2User) = checkNotNull(boards.versionsManagedBy(id, principal.userId).id)

    /** The trimmed name, `null` for none; 400 when it is too long. */
    private fun versionName(name: String?): String? {
        val trimmed = name?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        if (trimmed.length > BoardVersionService.NAME_MAX_LENGTH) {
            throw ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "The name must have at most ${BoardVersionService.NAME_MAX_LENGTH} characters",
            )
        }
        return trimmed
    }

    private fun versionNotFound() = ResponseStatusException(HttpStatus.NOT_FOUND, "Version not found")

    private companion object {
        /** Versions that editors save; automatic ones only the backend makes. */
        val SAVED_REASONS = listOf(VersionReason.MANUAL, VersionReason.RESTORE).associateBy { it.value }
    }
}

/** The new name of a version; an empty one or `null` takes the name away. */
data class RenameVersionRequest(
    /** Checked for length after trimming. */
    val name: String? = null,
)
