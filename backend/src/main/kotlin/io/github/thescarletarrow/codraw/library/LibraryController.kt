package io.github.thescarletarrow.codraw.library

import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.board.BoardOrganizationService.Companion.normalize
import io.github.thescarletarrow.codraw.library.LibraryService.Companion.COMPONENT_NAME_MAX_LENGTH
import io.github.thescarletarrow.codraw.library.LibraryService.Companion.LIBRARY_NAME_MAX_LENGTH
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.net.URI
import java.time.Instant
import java.util.UUID

/**
 * Personal libraries of shapes of the user who asks, and their components. Nobody else sees or changes them: a library
 * of another user answers 404, as one that does not exist.
 */
@RestController
@RequestMapping("/api/libraries")
class LibraryController(private val libraries: LibraryService) {

    @GetMapping
    fun libraries(@AuthenticationPrincipal principal: OAuth2User): List<LibraryView> = libraries.libraries(principal.userId)

    /** The room that the libraries of the user take and have; the browser checks a file before it sends it. */
    @GetMapping("/usage")
    fun usage(@AuthenticationPrincipal principal: OAuth2User): LibraryUsage = libraries.usage(principal.userId)

    @PostMapping
    fun create(@RequestBody request: LibraryRequest, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<LibraryView> {
        val library = libraries.create(principal.userId, libraryName(request.name))
        return ResponseEntity.created(URI.create("/api/libraries/${library.id}")).body(library)
    }

    @PatchMapping("/{id}")
    fun rename(
        @PathVariable id: String,
        @RequestBody request: LibraryRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): LibraryView = libraries.rename(principal.userId, libraryIdOf(id), libraryName(request.name))

    /** Deletes the library with its components; their copies on boards stay. */
    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        libraries.delete(principal.userId, libraryIdOf(id))
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/{id}/components")
    fun addComponent(
        @PathVariable id: String,
        @RequestBody request: ComponentRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<ComponentSummary> {
        val name = componentName(request.name)
        val content = request.content?.takeIf { it.isNotBlank() } ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "No content")
        val component = libraries.addComponent(principal.userId, libraryIdOf(id), name, ComponentContent(content, request.preview))
        return ResponseEntity.created(URI.create("/api/libraries/$id/components/${component.id}")).body(component)
    }

    @GetMapping("/{id}/components/{componentId}")
    fun component(
        @PathVariable id: String,
        @PathVariable componentId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ComponentResponse = libraries.component(principal.userId, libraryIdOf(id), componentIdOf(componentId)).let {
        ComponentResponse(it.id, it.name, it.preview, it.updatedAt, it.content)
    }

    /**
     * Renames the component, or puts new content with its preview into it instead of the old ones, or both. Its copies
     * on boards stay as they are.
     */
    @PatchMapping("/{id}/components/{componentId}")
    fun updateComponent(
        @PathVariable id: String,
        @PathVariable componentId: String,
        @RequestBody request: ComponentRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ComponentSummary {
        if (request.name == null && request.content == null) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Neither a name nor content")
        }
        val name = request.name?.let(::componentName)
        val content = request.content?.let {
            if (it.isBlank()) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "No content")
            ComponentContent(it, request.preview)
        }
        return libraries.updateComponent(principal.userId, libraryIdOf(id), componentIdOf(componentId), name, content)
    }

    /** Deletes the component; its copies on boards stay. */
    @DeleteMapping("/{id}/components/{componentId}")
    fun deleteComponent(
        @PathVariable id: String,
        @PathVariable componentId: String,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Void> {
        libraries.deleteComponent(principal.userId, libraryIdOf(id), componentIdOf(componentId))
        return ResponseEntity.noContent().build()
    }

    @ExceptionHandler
    fun libraryNotFound(exception: LibraryNotFoundException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.message).apply { title = "Library not found" }

    @ExceptionHandler
    fun componentNotFound(exception: ComponentNotFoundException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.message).apply { title = "Component not found" }

    @ExceptionHandler
    fun libraryLimitReached(exception: LibraryLimitReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Library limit reached"
            setProperty("limit", exception.limit)
            setProperty("scope", "libraries")
        }

    @ExceptionHandler
    fun componentLimitReached(exception: ComponentLimitReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Component limit reached"
            setProperty("limit", exception.limit)
            setProperty("scope", "components")
        }

    @ExceptionHandler
    fun quotaReached(exception: LibraryQuotaReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Library quota reached"
            setProperty("limit", exception.limit)
            setProperty("used", exception.used)
            setProperty("scope", "size")
        }

    @ExceptionHandler
    fun componentTooLarge(exception: ComponentTooLargeException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONTENT_TOO_LARGE, exception.message).apply {
            title = "Component too large"
            setProperty("limit", exception.limit)
        }

    @ExceptionHandler
    fun imageTooLarge(exception: ComponentImageTooLargeException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONTENT_TOO_LARGE, exception.message).apply {
            title = "Image too large"
            setProperty("limit", exception.limit)
            setProperty("scope", if (exception.pixels) "pixels" else "image")
        }

    @ExceptionHandler
    fun unsupportedImage(exception: UnsupportedComponentImageException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.UNSUPPORTED_MEDIA_TYPE, exception.message).apply { title = "Unsupported image" }

    @ExceptionHandler
    fun invalidComponent(exception: InvalidComponentException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.message).apply { title = "Invalid component" }

    /** An id that is not a UUID names no library, like one of another user. */
    private fun libraryIdOf(id: String): UUID = BoardIds.parse(id) ?: throw LibraryNotFoundException()

    private fun componentIdOf(id: String): UUID = BoardIds.parse(id) ?: throw ComponentNotFoundException()

    private fun libraryName(name: String?) = checkedName(name, LIBRARY_NAME_MAX_LENGTH)

    private fun componentName(name: String?) = checkedName(name, COMPONENT_NAME_MAX_LENGTH)

    private fun checkedName(name: String?, maxLength: Int): String {
        val normalized = normalize(name ?: "")
        if (normalized.length !in 1..maxLength) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "A name must have 1 to $maxLength characters")
        }
        return normalized
    }
}

/** Checked for length after trimming. */
data class LibraryRequest(val name: String? = null)

/**
 * A new component, or a change of one: its name, and its content with its preview. A change with content replaces the
 * preview too, with none when [preview] is `null`.
 */
data class ComponentRequest(val name: String? = null, val content: String? = null, val preview: String? = null)

/** A component with its content: a diagram of draw.io with its pictures inside. */
data class ComponentResponse(
    val id: UUID,
    val name: String,
    val preview: String?,
    val updatedAt: Instant,
    val content: String,
)
