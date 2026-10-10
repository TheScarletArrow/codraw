package io.github.thescarletarrow.codraw.board

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.image.BoardImageAddresses
import io.github.thescarletarrow.codraw.image.BoardImages
import io.github.thescarletarrow.codraw.image.ImageQuotaReachedException
import io.github.thescarletarrow.codraw.image.ImageStorage
import io.github.thescarletarrow.codraw.image.ImageStorageException
import io.github.thescarletarrow.codraw.image.storageKey
import io.github.thescarletarrow.codraw.user.UserRepository
import io.github.thescarletarrow.codraw.workspace.Workspaces
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Copies of boards: a new board of the user who copies, with the document of the original and copies of its images, see
 * openspec/specs/board-copy/spec.md. Members, comments, versions, proposals, decisions, linked issues and the live picture
 * of the original stay with it.
 */
@Service
class BoardCopyService(
    private val boards: BoardService,
    private val boardRepository: BoardRepository,
    private val documents: BoardDocumentRepository,
    private val organization: BoardOrganization,
    private val images: BoardImages,
    private val storage: ImageStorage,
    private val workspaces: Workspaces,
    private val users: UserRepository,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val transactions: TransactionTemplate,
    private val clock: Clock,
) {

    /**
     * Copies the [original] for the user [userId], who has a role on it. The copy stays in the workspace and the project
     * of the original when the user creates boards there, and is their personal board otherwise; it is in their folder
     * and has their tags of the original. Throws [BoardLimitReachedException], [ImageQuotaReachedException] and
     * [ImageStorageException], after which there is no copy.
     */
    fun copy(original: Board, userId: UUID): Board {
        val originalId = checkNotNull(original.id)
        val copied = checkNotNull(transactions.execute { copyRows(original, originalId, userId) })
        val copyId = checkNotNull(copied.board.id)
        try {
            // Like a new image, the bytes go to the storage after the rows: till then the image of the copy is not found.
            for ((imageId, copiedId) in copied.images) {
                if (!storage.copy(storageKey(originalId, imageId), storageKey(copyId, copiedId))) {
                    // The storage lost the image of the original, which shows nothing either.
                    images.delete(listOf(copiedId))
                }
            }
        } catch (exception: ImageStorageException) {
            boards.delete(copied.board)
            throw exception
        }
        return copied.board
    }

    private fun copyRows(original: Board, originalId: UUID, userId: UUID): CopiedRows {
        val now = now()
        val workspaceId = original.workspaceId?.takeIf { workspaces.roleOf(it, userId)?.createsBoards == true }
        // Creating, restoring and copying boards serialize on the owner, or on the workspace, as they count its boards.
        if (workspaceId == null) {
            checkNotNull(users.lock(userId)) { "User $userId does not exist" }
            if (boardRepository.countByOwnerId(userId) >= limits.boardsPerUser) {
                metrics.limitReached(Limit.BOARDS)
                throw BoardLimitReachedException(limits.boardsPerUser)
            }
        } else {
            checkNotNull(workspaces.lock(workspaceId)) { "Workspace $workspaceId of a board does not exist" }
            boards.checkWorkspaceLimit(workspaceId)
        }
        val used = images.sizeOf(originalId)
        val quota = limits.imagesSizePerBoard.toBytes()
        if (used > quota) {
            metrics.limitReached(Limit.IMAGES)
            throw ImageQuotaReachedException(quota, used)
        }
        val copy = Board(
            title = copyTitle(original.title),
            ownerId = userId,
            createdAt = now,
            updatedAt = now,
            workspaceId = workspaceId,
            projectId = original.projectId.takeIf { workspaceId != null },
        )
        // As a new board of its kind: a board of a team opens to whom its owner decides.
        val board = boardRepository.save(if (workspaceId == null) copy else copy.copy(linkAccess = LinkAccess.NONE))
        val copyId = checkNotNull(board.id)
        val copiedImages = images.copyAll(originalId, copyId, now)
        documents.findState(originalId)?.let { state ->
            documents.insertCopy(originalId, copyId, BoardImageAddresses.rewrite(state, originalId, copyId, copiedImages), now)
        }
        val tags = organization.tagsOf(userId, originalId)
        if (tags.isNotEmpty()) organization.setTags(userId, copyId, tags)
        organization.of(userId).folderOf(originalId)?.let { organization.place(userId, copyId, it) }
        metrics.boardCreated()
        return CopiedRows(board, copiedImages)
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private class CopiedRows(val board: Board, val images: Map<UUID, UUID>)

    companion object {
        const val COPY_SUFFIX = " (копия)"

        /** «<title> (копия)», with the title shortened to fit the longest title of a board. */
        fun copyTitle(title: String): String = title.take(TITLE_MAX_LENGTH - COPY_SUFFIX.length).trimEnd() + COPY_SUFFIX
    }
}
