/** Stateless message: the board changed (its title, or it was deleted), so participants fetch it again. */
export const BOARD_CHANGED = JSON.stringify({ type: "board-changed" });

/** Stateless message: the comments of the board changed, so participants fetch them again. */
export const COMMENTS_CHANGED = JSON.stringify({ type: "comments-changed" });

/** A change that a client reports in a stateless message. */
export type Change = "board-changed" | "comments-changed";

/** The change that a stateless message of a client reports, `null` for any other message. */
export function changeOf(payload: string): Change | null {
  try {
    const message: unknown = JSON.parse(payload);
    if (typeof message !== "object" || message === null) return null;
    const type = (message as { type?: unknown }).type;
    return type === "board-changed" || type === "comments-changed" ? type : null;
  } catch {
    return null;
  }
}
