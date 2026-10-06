/** Prefix of the name of the document of the draft of a proposal of changes: `proposal:<proposal id>`. */
export const PROPOSAL_PREFIX = "proposal:";

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A document that collab syncs: the document of a board, named by the id of the board, or the draft of a proposal of
 * changes of a board, which its author edits apart from the board.
 */
export type CollabDocument = { kind: "board"; id: string } | { kind: "proposal"; id: string };

/** The document that a name names, or `null` for any other name: the backend is never asked about such a name. */
export function documentOf(name: string): CollabDocument | null {
  if (canonicalUuid.test(name)) return { kind: "board", id: name };
  if (name.startsWith(PROPOSAL_PREFIX)) {
    const id = name.slice(PROPOSAL_PREFIX.length);
    if (canonicalUuid.test(id)) return { kind: "proposal", id };
  }
  return null;
}
