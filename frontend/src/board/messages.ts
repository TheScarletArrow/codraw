/** Stateless message that collab relays to the other participants: the board changed, fetch it again. */
export const BOARD_CHANGED = JSON.stringify({ type: 'board-changed' })

/** Stateless message that collab relays to the other participants: the comments changed, fetch them again. */
export const COMMENTS_CHANGED = JSON.stringify({ type: 'comments-changed' })

/** The change that a stateless message reports, `null` for any other message. */
export function changeOf(payload: string): 'board-changed' | 'comments-changed' | null {
  try {
    const message: unknown = JSON.parse(payload)
    if (typeof message !== 'object' || message === null) return null
    const type = (message as { type?: unknown }).type
    return type === 'board-changed' || type === 'comments-changed' ? type : null
  } catch {
    return null
  }
}
