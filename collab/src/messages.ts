/** Stateless message: the board changed (its title, or it was deleted), so participants fetch it again. */
export const BOARD_CHANGED = JSON.stringify({ type: "board-changed" });

/** Stateless message: the comments of the board changed, so participants fetch them again. */
export const COMMENTS_CHANGED = JSON.stringify({ type: "comments-changed" });

/** Stateless message: the architecture decisions of the board changed, so participants fetch them again. */
export const DECISIONS_CHANGED = JSON.stringify({ type: "decisions-changed" });

/** Stateless message: the issues of the tracker linked to the board changed, so participants fetch them again. */
export const ISSUES_CHANGED = JSON.stringify({ type: "issues-changed" });

/**
 * Stateless message: a proposal of changes was made, accepted, declined or withdrawn, so the participants of the board
 * fetch its proposals again, and those of a draft the proposal.
 */
export const PROPOSALS_CHANGED = JSON.stringify({ type: "proposals-changed" });

/** A change that a client reports in a stateless message. */
export type Change = "board-changed" | "comments-changed" | "decisions-changed" | "issues-changed" | "proposals-changed";

const CHANGES: ReadonlySet<unknown> = new Set<Change>([
  "board-changed",
  "comments-changed",
  "decisions-changed",
  "issues-changed",
  "proposals-changed",
]);

/** The change that a stateless message of a client reports, `null` for any other message. */
export function changeOf(payload: string): Change | null {
  try {
    const message: unknown = JSON.parse(payload);
    if (typeof message !== "object" || message === null) return null;
    const type = (message as { type?: unknown }).type;
    return CHANGES.has(type) ? (type as Change) : null;
  } catch {
    return null;
  }
}
