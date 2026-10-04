/** Stateless message that collab relays to the other participants: the board changed, fetch it again. */
export const BOARD_CHANGED = JSON.stringify({ type: 'board-changed' })

export function isBoardChanged(payload: string): boolean {
  try {
    const message: unknown = JSON.parse(payload)
    return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'board-changed'
  } catch {
    return false
  }
}
