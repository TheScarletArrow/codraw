package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.user.UserRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Personal folders and tags with which a user organizes the boards of their list, their own and shared ones. Changes
 * of one user go one after another under the lock of the user, so that limits and names unique regardless of case
 * hold. The caller checks that the board is in the list of the user and that names and tags are normalized.
 */
@Service
class BoardOrganizationService(
    private val organization: BoardOrganization,
    private val users: UserRepository,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val clock: Clock,
) {

    /** The tags and the folders of all boards of the user [userId]. */
    fun of(userId: UUID): Organization = organization.of(userId)

    /** The folders of the user [userId], by name. */
    fun folders(userId: UUID): List<BoardFolder> = organization.folders(userId)

    /**
     * Creates a folder [name] of the user [userId]. Throws [FolderNameTakenException] when they have a folder of that
     * name regardless of case and [FolderLimitReachedException] when they have as many folders as the limit allows.
     */
    @Transactional
    fun createFolder(userId: UUID, name: String): BoardFolder {
        lock(userId)
        val folders = organization.folders(userId)
        if (folders.any { sameName(it.name, name) }) throw FolderNameTakenException()
        if (folders.size >= limits.foldersPerUser) {
            metrics.limitReached(Limit.FOLDERS)
            throw FolderLimitReachedException(limits.foldersPerUser)
        }
        return organization.addFolder(userId, name, clock.instant().truncatedTo(ChronoUnit.MICROS))
    }

    /**
     * Gives the folder [folderId] of the user [userId] the [name]. Throws [FolderNotFoundException] when they have no
     * such folder and [FolderNameTakenException] when another folder of theirs has that name regardless of case.
     */
    @Transactional
    fun renameFolder(userId: UUID, folderId: UUID, name: String): BoardFolder {
        lock(userId)
        val folders = organization.folders(userId)
        if (folders.none { it.id == folderId }) throw FolderNotFoundException()
        if (folders.any { it.id != folderId && sameName(it.name, name) }) throw FolderNameTakenException()
        organization.renameFolder(userId, folderId, name)
        return BoardFolder(folderId, name)
    }

    /** Deletes the folder [folderId] of the user [userId]; its boards are in no folder then. */
    @Transactional
    fun deleteFolder(userId: UUID, folderId: UUID) {
        lock(userId)
        if (!organization.deleteFolder(userId, folderId)) throw FolderNotFoundException()
    }

    /**
     * Gives the board [boardId] the [tags] of the user [userId] instead of their tags of it, and returns them. A tag
     * repeated regardless of case is dropped, and a tag the user has on other boards is written as it is there. Throws
     * [TagLimitReachedException] when the board would have more tags than the limit allows, or the user more different
     * tags.
     */
    @Transactional
    fun setTags(boardId: UUID, userId: UUID, tags: List<String>): List<String> {
        lock(userId)
        val known = organization.tags(userId).associateBy(::tagKey)
        val wanted = tags.distinctBy(::tagKey).map { known[tagKey(it)] ?: it }
        // A board may have more tags than the limit after a guest passed theirs: they may go, but none come.
        if (wanted.size > limits.tagsPerBoard && wanted.size > organization.tagsOf(userId, boardId).size) {
            metrics.limitReached(Limit.TAGS)
            throw TagLimitReachedException(limits.tagsPerBoard, TagLimitReachedException.Scope.BOARD)
        }
        val others = organization.of(userId).tags.filterKeys { it != boardId }.values.flatten().map(::tagKey).toSet()
        // Likewise, a user above the limit keeps the tags they have, but gets no new ones.
        if ((others + wanted.map(::tagKey)).size > limits.tagsPerUser && wanted.any { tagKey(it) !in known }) {
            metrics.limitReached(Limit.TAGS)
            throw TagLimitReachedException(limits.tagsPerUser, TagLimitReachedException.Scope.USER)
        }
        organization.setTags(userId, boardId, wanted)
        return wanted
    }

    /**
     * Puts the board [boardId] into the folder [folderId] of the user [userId] instead of their previous one, or with
     * `null` into none. Throws [FolderNotFoundException] when the user has no such folder.
     */
    @Transactional
    fun place(boardId: UUID, userId: UUID, folderId: UUID?) {
        lock(userId)
        if (folderId != null && organization.folders(userId).none { it.id == folderId }) throw FolderNotFoundException()
        organization.place(userId, boardId, folderId)
    }

    private fun lock(userId: UUID) {
        checkNotNull(users.lock(userId)) { "User $userId does not exist" }
    }

    private fun sameName(a: String, b: String) = a.lowercase() == b.lowercase()

    private fun tagKey(tag: String) = tag.lowercase()

    companion object {
        /** The longest tag. */
        const val TAG_MAX_LENGTH = 30

        /** The longest name of a folder. */
        const val FOLDER_NAME_MAX_LENGTH = 60

        /** A tag or the name of a folder as it is kept: without spaces around it, a run of spaces inside as one. */
        fun normalize(label: String): String = label.trim().replace(WHITESPACE, " ")

        private val WHITESPACE = Regex("\\s+")
    }
}

/** The user has a folder of that name, regardless of case. */
class FolderNameTakenException : RuntimeException("The user has a folder of that name")

/** The user has no such folder. */
class FolderNotFoundException : RuntimeException("The user has no such folder")

/** The user has as many folders as the [limit] allows. */
class FolderLimitReachedException(val limit: Int) : RuntimeException("The user has $limit folders, the most allowed")

/** A board would have more tags of the user than the [limit] allows, or the user more different tags. */
class TagLimitReachedException(val limit: Int, val scope: Scope) :
    RuntimeException("More than $limit tags of the ${scope.value}") {

    /** Whose tags reached the limit: those of one board or all of the user. */
    enum class Scope(val value: String) {
        BOARD("board"),
        USER("user"),
    }
}
