package io.github.thescarletarrow.codraw.board

import java.time.Instant
import java.util.UUID

/** A version of a board without its state, as the changes since a visit read it. */
data class VersionStamp(
    val id: UUID,
    val createdAt: Instant,
    val reason: VersionReason,
    val authorIds: List<UUID>,
)

/** When the document of a board was stored last, and who changed it since the latest version of the board. */
data class DocumentStamp(
    val updatedAt: Instant,
    val editorIds: List<UUID>,
)

/**
 * The changes of a board since a visit ended: the version to compare the board with, [baseline], and the users whose
 * changes that comparison shows, in the order of their first change. Versions are the only earlier states of a board
 * the backend keeps, so the baseline is the board as the user left it only approximately; see [of].
 */
data class VisitChanges(
    val baseline: VersionStamp?,
    val authorIds: List<UUID>,
) {
    companion object {
        /** Nothing changed: no authors and nothing to compare with. */
        val NONE = VisitChanges(null, emptyList())

        /**
         * The changes since the visit that ended at [since], from the [versions] of the board, oldest first, and its
         * stored [document].
         *
         * The board changed when its document was stored after [since]: saving a version without a change stores no
         * document. The baseline is the first version made at or after [since] when it is automatic and the version before
         * it is at least [BoardVersionService.INTERVAL] older than [since], or there is none: such a version is the stored
         * document before the first store after the visit, so the board as the user left it. Otherwise it is the latest
         * version before [since]: a manual version or one kept before a restore is the board when it was saved, with the
         * changes since the visit in it, and an automatic version made soon after an earlier one may have the changes of
         * the first minutes after the visit in it. Without versions before [since] it is the first version after it.
         *
         * The authors are those of the versions after the baseline and those who changed the stored document since the
         * latest version, each once.
         */
        fun of(since: Instant, versions: List<VersionStamp>, document: DocumentStamp?): VisitChanges {
            if (document == null || !document.updatedAt.isAfter(since)) return NONE
            val firstAfter = versions.indexOfFirst { !it.createdAt.isBefore(since) }.takeIf { it >= 0 }
            // -1 when the board has no version before the visit ended.
            val lastBefore = (firstAfter ?: versions.size) - 1
            val asLeft = firstAfter?.takeIf {
                versions[it].reason == VersionReason.AUTO &&
                    (lastBefore < 0 || !versions[lastBefore].createdAt.isAfter(since - BoardVersionService.INTERVAL))
            }
            val baseline = asLeft ?: lastBefore.takeIf { it >= 0 } ?: firstAfter
            val after = if (baseline == null) versions else versions.drop(baseline + 1)
            return VisitChanges(
                baseline = baseline?.let(versions::get),
                authorIds = (after.flatMap { it.authorIds } + document.editorIds).distinct(),
            )
        }
    }
}
