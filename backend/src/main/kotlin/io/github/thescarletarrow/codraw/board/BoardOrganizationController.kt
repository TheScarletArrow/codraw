package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.board.BoardOrganizationService.Companion.FOLDER_NAME_MAX_LENGTH
import io.github.thescarletarrow.codraw.board.BoardOrganizationService.Companion.TAG_MAX_LENGTH
import io.github.thescarletarrow.codraw.board.BoardOrganizationService.Companion.normalize
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
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.net.URI
import java.util.UUID

/**
 * Personal folders of the user who asks, and their tags and folder of a board of their list: their own boards and those
 * shared with them. Nobody else sees them.
 */
@RestController
@RequestMapping("/api/boards")
class BoardOrganizationController(
    private val boards: BoardService,
    private val organization: BoardOrganizationService,
) {

    /** Replaces the tags of the user on the board and returns them as they are kept. */
    @PutMapping("/{id}/tags")
    fun setTags(
        @PathVariable id: String,
        @RequestBody request: BoardTagsRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): BoardTagsResponse {
        val tags = request.tags?.map { normalize(it ?: "") }
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "No tags")
        if (tags.any { it.length !in 1..TAG_MAX_LENGTH }) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "A tag must have 1 to $TAG_MAX_LENGTH characters")
        }
        val board = boards.listedBy(id, principal.userId)
        return BoardTagsResponse(organization.setTags(checkNotNull(board.id), principal.userId, tags))
    }

    /** Puts the board into a folder of the user, or with `null` into none. */
    @PutMapping("/{id}/folder")
    fun place(
        @PathVariable id: String,
        @RequestBody request: BoardFolderRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<Void> {
        val board = boards.listedBy(id, principal.userId)
        organization.place(checkNotNull(board.id), principal.userId, request.folderId)
        return ResponseEntity.noContent().build()
    }

    @GetMapping("/folders")
    fun folders(@AuthenticationPrincipal principal: OAuth2User): List<BoardFolder> = organization.folders(principal.userId)

    @PostMapping("/folders")
    fun createFolder(
        @RequestBody request: FolderRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): ResponseEntity<BoardFolder> {
        val folder = organization.createFolder(principal.userId, folderName(request))
        return ResponseEntity.created(URI.create("/api/boards/folders/${folder.id}")).body(folder)
    }

    @PatchMapping("/folders/{folderId}")
    fun renameFolder(
        @PathVariable folderId: String,
        @RequestBody request: FolderRequest,
        @AuthenticationPrincipal principal: OAuth2User,
    ): BoardFolder = organization.renameFolder(principal.userId, folderIdOf(folderId), folderName(request))

    /** Deletes the folder; its boards stay in the lists, in no folder. */
    @DeleteMapping("/folders/{folderId}")
    fun deleteFolder(@PathVariable folderId: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        organization.deleteFolder(principal.userId, folderIdOf(folderId))
        return ResponseEntity.noContent().build()
    }

    @ExceptionHandler
    fun folderNotFound(exception: FolderNotFoundException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.message).apply { title = "Folder not found" }

    @ExceptionHandler
    fun folderNameTaken(exception: FolderNameTakenException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply { title = "Folder name taken" }

    @ExceptionHandler
    fun folderLimitReached(exception: FolderLimitReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Folder limit reached"
            setProperty("limit", exception.limit)
        }

    @ExceptionHandler
    fun tagLimitReached(exception: TagLimitReachedException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.message).apply {
            title = "Tag limit reached"
            setProperty("limit", exception.limit)
            setProperty("scope", exception.scope.value)
        }

    /** An id that is not a UUID names no folder, like one of another user. */
    private fun folderIdOf(id: String): UUID = BoardIds.parse(id) ?: throw FolderNotFoundException()

    private fun folderName(request: FolderRequest): String {
        val name = normalize(request.name ?: "")
        if (name.length !in 1..FOLDER_NAME_MAX_LENGTH) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "A name must have 1 to $FOLDER_NAME_MAX_LENGTH characters")
        }
        return name
    }
}

/** All tags of the user on the board; checked after trimming. */
data class BoardTagsRequest(val tags: List<String?>? = null)

data class BoardTagsResponse(val tags: List<String>)

/** The folder of the user to put the board into; `null` takes it out of its folder. */
data class BoardFolderRequest(val folderId: UUID? = null)

/** Checked for length after trimming. */
data class FolderRequest(val name: String? = null)
