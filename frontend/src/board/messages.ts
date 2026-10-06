/** Stateless message that collab relays to the other participants: the board changed, fetch it again. */
export const BOARD_CHANGED = JSON.stringify({ type: 'board-changed' })

/** Stateless message that collab relays to the other participants: the comments changed, fetch them again. */
export const COMMENTS_CHANGED = JSON.stringify({ type: 'comments-changed' })

/**
 * Stateless message that collab relays to the other participants of the board or of a draft: a proposal of changes was
 * made, accepted, declined or withdrawn, fetch the proposals again.
 */
export const PROPOSALS_CHANGED = JSON.stringify({ type: 'proposals-changed' })

/** A change that a stateless message reports. */
export type Change = 'board-changed' | 'comments-changed' | 'proposals-changed'

const CHANGES: ReadonlySet<unknown> = new Set<Change>(['board-changed', 'comments-changed', 'proposals-changed'])

/** The change that a stateless message reports, `null` for any other message. */
export function changeOf(payload: string): Change | null {
  try {
    const message: unknown = JSON.parse(payload)
    if (typeof message !== 'object' || message === null) return null
    const type = (message as { type?: unknown }).type
    return CHANGES.has(type) ? (type as Change) : null
  } catch {
    return null
  }
}
