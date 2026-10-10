package io.github.thescarletarrow.codraw.image

import java.util.UUID

/**
 * Points the shapes of a copied board document at the images of the copy. The backend does not read Yjs, so the stored
 * state is rewritten as bytes: each address of an image of the original, `/api/boards/{original}/images/{image}`, becomes
 * the address of its copy, `/api/boards/{copy}/images/{copied}`. Both are ASCII of the same length, and a Yjs v1 update,
 * which collab stores, keeps a string as its length in bytes and its bytes, so every length and offset stays as it was;
 * the image of a shape is one value of its style map and is never split. Should collab store another encoding, this
 * must change with it. See openspec/changes/archive/2026-10-10-add-board-copy/design.md.
 */
object BoardImageAddresses {

    private val IMAGE_ID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")

    /**
     * The [state] with the addresses of the images of the board [original] that [copies] maps, from the id of an image
     * to the id of its copy, pointed at the board [copy]. Addresses of other boards and of other images stay.
     */
    fun rewrite(state: ByteArray, original: UUID, copy: UUID, copies: Map<UUID, UUID>): ByteArray {
        if (copies.isEmpty()) return state
        // One character per byte: what the pattern does not touch goes back as the same bytes.
        val text = String(state, Charsets.ISO_8859_1)
        val pattern = Regex("/api/boards/${Regex.escape(original.toString())}/images/(${IMAGE_ID.pattern})", RegexOption.IGNORE_CASE)
        val rewritten = pattern.replace(text) { match ->
            val copied = copies[UUID.fromString(match.groupValues[1])]
            if (copied == null) match.value else "/api/boards/$copy/images/$copied"
        }
        return rewritten.toByteArray(Charsets.ISO_8859_1).also { check(it.size == state.size) { "A rewritten address changed the length of the state" } }
    }
}
