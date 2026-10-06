package io.github.thescarletarrow.codraw.board

import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull

class VisitChangesTest {

    private val left = Instant.parse("2026-10-05T18:40:00Z")
    private val alice = UUID.fromString("0199a000-0000-7000-8000-0000000000a1")
    private val bob = UUID.fromString("0199a000-0000-7000-8000-0000000000b1")
    private val carol = UUID.fromString("0199a000-0000-7000-8000-0000000000c1")
    private val dave = UUID.fromString("0199a000-0000-7000-8000-0000000000d1")

    @Test
    fun `nothing changed when the document was not stored after the visit, whatever versions were saved`() {
        val versions = listOf(version(-60, VersionReason.AUTO, alice), version(5, VersionReason.MANUAL, alice))

        assertEquals(VisitChanges.NONE, VisitChanges.of(left, versions, stored(0, bob)))
        assertEquals(VisitChanges.NONE, VisitChanges.of(left, versions, stored(-1, bob)))
        assertEquals(VisitChanges.NONE, VisitChanges.of(left, emptyList(), null))
    }

    @Test
    fun `an automatic version after a pause is the board as the user left it, and its own authors changed it before`() {
        val before = version(-60, VersionReason.AUTO, carol)
        val asLeft = version(60, VersionReason.AUTO, alice, carol)

        val changes = VisitChanges.of(left, listOf(before, asLeft), stored(61, bob))

        assertEquals(asLeft, changes.baseline)
        assertEquals(listOf(bob), changes.authorIds)
    }

    @Test
    fun `an automatic version is the board as the user left it when the board had no version before`() {
        val asLeft = version(60, VersionReason.AUTO, alice)

        assertEquals(asLeft, VisitChanges.of(left, listOf(asLeft), stored(60, bob)).baseline)
    }

    @Test
    fun `a version made at the end of the visit counts as after it`() {
        val asLeft = version(0, VersionReason.AUTO, alice)

        assertEquals(asLeft, VisitChanges.of(left, listOf(asLeft), stored(1, bob)).baseline)
    }

    @Test
    fun `an automatic version soon after an earlier one may have changes after the visit, so the earlier one is the baseline`() {
        val earlier = version(-9, VersionReason.AUTO, carol)
        val later = version(2, VersionReason.AUTO, alice, bob)

        val changes = VisitChanges.of(left, listOf(earlier, later), stored(3, carol))

        assertEquals(earlier, changes.baseline)
        assertEquals(listOf(alice, bob, carol), changes.authorIds)
    }

    @Test
    fun `a manual version after the visit has the changes since it, so the latest version before the visit is the baseline`() {
        val before = version(-120, VersionReason.AUTO, carol)
        val release = version(30, VersionReason.MANUAL, alice, bob)

        // The manual version took those who changed the stored document as its authors.
        val changes = VisitChanges.of(left, listOf(before, release), stored(20))

        assertEquals(before, changes.baseline)
        assertEquals(listOf(alice, bob), changes.authorIds)
    }

    @Test
    fun `a version kept before a restore is no baseline either`() {
        val before = version(-120, VersionReason.MANUAL)
        val restored = version(30, VersionReason.RESTORE, bob)

        assertEquals(before, VisitChanges.of(left, listOf(before, restored), stored(31, bob)).baseline)
    }

    @Test
    fun `without a version after the visit, the latest version before it is the baseline and the document names the authors`() {
        val older = version(-30, VersionReason.AUTO, carol)
        val saved = version(-1, VersionReason.MANUAL, alice)

        val changes = VisitChanges.of(left, listOf(older, saved), stored(5, bob))

        assertEquals(saved, changes.baseline)
        assertEquals(listOf(bob), changes.authorIds)
    }

    @Test
    fun `without a version before the visit, the first one after it is the baseline`() {
        val release = version(30, VersionReason.MANUAL, alice)

        assertEquals(release, VisitChanges.of(left, listOf(release), stored(31, bob)).baseline)
    }

    @Test
    fun `without any version there is nothing to compare with, but the document names who changed the board`() {
        val changes = VisitChanges.of(left, emptyList(), stored(5, alice, bob))

        assertNull(changes.baseline)
        assertEquals(listOf(alice, bob), changes.authorIds)
    }

    @Test
    fun `the authors are those of the versions after the baseline, then those of the document, in the order of their first change, once`() {
        val asLeft = version(60, VersionReason.AUTO, alice)
        val next = version(80, VersionReason.AUTO, bob, carol)
        val last = version(95, VersionReason.MANUAL, carol, dave)

        val changes = VisitChanges.of(left, listOf(asLeft, next, last), stored(100, dave, bob, alice))

        assertEquals(asLeft, changes.baseline)
        assertEquals(listOf(bob, carol, dave, alice), changes.authorIds)
    }

    /** A version made [minutes] after the visit ended (before it when negative). */
    private fun version(minutes: Long, reason: VersionReason, vararg authors: UUID) =
        VersionStamp(UUID.randomUUID(), left + Duration.ofMinutes(minutes), reason, authors.toList())

    /** The document stored [minutes] after the visit ended, changed by the [editors] since the latest version. */
    private fun stored(minutes: Long, vararg editors: UUID) = DocumentStamp(left + Duration.ofMinutes(minutes), editors.toList())
}
