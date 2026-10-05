/** Stateless message: the board changed (its title, or it was deleted), so participants fetch it again. */
export const BOARD_CHANGED = JSON.stringify({ type: "board-changed" });

/** A stateless message of a client that reports a change of the board. */
export function isBoardChanged(payload: string): boolean {
  try {
    const message: unknown = JSON.parse(payload);
    return typeof message === "object" && message !== null && (message as { type?: unknown }).type === "board-changed";
  } catch {
    return false;
  }
}
