import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { DiagramEditor, Point } from '../diagram/editor.ts'
import { DEFAULT_PAGE_ID } from '../diagram/model.ts'
import type { ParticipantIdentity } from './identity.ts'

export type Awareness = NonNullable<HocuspocusProvider['awareness']>

/** Another participant's page, pointer and selection on the canvas. */
export interface RemotePresence extends ParticipantIdentity {
  clientId: number
  /** The page the participant works on. */
  page: string
  /** Pointer position in diagram coordinates, or `null` when it is outside the canvas. */
  cursor: Point | null
  selection: string[]
  /** The middle of the visible area of the participant in diagram coordinates and their scale; `null` for old clients. */
  viewport: Viewport | null
  /** The cell whose label the participant edits in place; `null` when they edit none, and for old clients. */
  editing: string | null
  /** When the participant started presenting to everybody (ms); `null` when they do not, and for old clients. */
  presenting: number | null
  /** The client id of the participant they follow; `null` when they follow nobody, and for old clients. */
  following: number | null
}

/** What a participant sees: the middle of their visible area in diagram coordinates and the scale. */
export interface Viewport extends Point {
  scale: number
}

/** Cursor updates are sent at most this often (20 per second). */
export const CURSOR_INTERVAL_MS = 50

/** Updates of the view are sent at most this often (10 per second). */
export const VIEW_INTERVAL_MS = 100

/**
 * Publishes the page, the view, the local pointer, the selection and the label edited in place of the editor to the
 * other participants.
 */
export function usePresencePublisher(editor: DiagramEditor | null, awareness: Awareness | null) {
  useEffect(() => {
    if (!editor || !awareness) return
    awareness.setLocalStateField('page', editor.pageId)
    const publishCursor = (point: Point | null) =>
      awareness.setLocalStateField('cursor', point && { x: Math.round(point.x), y: Math.round(point.y) })
    let lastSent = -Infinity
    let pending: Point | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const offPointer = editor.onPointerMove((point) => {
      if (point === null) {
        clearTimeout(timer)
        timer = undefined
        publishCursor(null)
        return
      }
      const now = performance.now()
      if (now - lastSent >= CURSOR_INTERVAL_MS) {
        // A timer that has not fired yet, e.g. on a busy page, would send an older position after this one.
        clearTimeout(timer)
        timer = undefined
        lastSent = now
        publishCursor(point)
        return
      }
      // Within the interval, keep the latest position and send it when the interval ends.
      pending = point
      timer ??= setTimeout(() => {
        timer = undefined
        lastSent = performance.now()
        publishCursor(pending)
      }, CURSOR_INTERVAL_MS - (now - lastSent))
    })
    const offSelection = editor.onSelectionChange((ids) => awareness.setLocalStateField('selection', ids))

    // Editing starts and stops rarely, so it is sent as it happens; a participant who may only view edits no label.
    let editing: string | null = null
    const publishEditing = (cellId: string | null) => {
      if (cellId === editing) return
      editing = cellId
      awareness.setLocalStateField('editing', cellId)
    }
    const offEditing = editor.readOnly
      ? undefined
      : editor.onEditingChange((state) => publishEditing(state?.cellId ?? null))
    if (!editor.readOnly) publishEditing(editor.getEditing()?.cellId ?? null)

    const publishView = () => {
      const center = editor.viewportCenter()
      const viewport: Viewport = {
        x: Math.round(center.x),
        y: Math.round(center.y),
        scale: Math.round(editor.getState().scale * 100) / 100,
      }
      awareness.setLocalStateField('viewport', viewport)
    }
    publishView()
    let viewTimer: ReturnType<typeof setTimeout> | undefined
    const offView = editor.onViewChange(() => {
      viewTimer ??= setTimeout(() => {
        viewTimer = undefined
        publishView()
      }, VIEW_INTERVAL_MS)
    })

    return () => {
      offPointer()
      offSelection()
      offView()
      offEditing?.()
      clearTimeout(timer)
      clearTimeout(viewTimer)
      publishEditing(null)
      awareness.setLocalStateField('viewport', null)
      awareness.setLocalStateField('cursor', null)
      awareness.setLocalStateField('selection', [])
    }
  }, [editor, awareness])
}

/**
 * Publishes when the participant started presenting to everybody and whom they follow. Unlike the fields of the canvas,
 * both outlive the editor of a page: the presenter and their followers go from page to page.
 */
export function useFollowingPublisher(
  awareness: Awareness | null,
  presenting: number | null,
  following: number | null,
) {
  useEffect(() => {
    awareness?.setLocalStateField('presenting', presenting)
  }, [awareness, presenting])
  useEffect(() => {
    awareness?.setLocalStateField('following', following)
  }, [awareness, following])
  // Leaving the board ends the presentation and the following, also for a provider that outlives the page.
  useEffect(
    () => () => {
      awareness?.setLocalStateField('presenting', null)
      awareness?.setLocalStateField('following', null)
    },
    [awareness],
  )
}

/** A presentation to everybody: who presents and since when. */
export interface Presentation {
  clientId: number
  since: number
}

/**
 * The presentation that everybody follows: the one started last and, of two started at once, the one of the larger
 * client id. Every client sees the same states and picks the same one without telling the others.
 */
export function currentPresentation(presence: RemotePresence[], own: Presentation | null): Presentation | null {
  let winner = own
  for (const { clientId, presenting: since } of presence) {
    if (since === null) continue
    if (!winner || since > winner.since || (since === winner.since && clientId > winner.clientId)) {
      winner = { clientId, since }
    }
  }
  return winner
}

/**
 * When a presentation that starts now begins: now, but after every presentation of the others. Their clocks may be
 * ahead, and a presentation started later must take over anyway.
 */
export function presentationStart(presence: RemotePresence[], now = Date.now()): number {
  return presence.reduce((start, participant) => Math.max(start, (participant.presenting ?? 0) + 1), now)
}

/** Presence of the other participants; re-renders when it changes. */
export function useRemotePresence(awareness: Awareness | null): RemotePresence[] {
  const snapshot = useRef<RemotePresence[]>([])
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!awareness) return () => {}
      const update = () => {
        snapshot.current = readRemotePresence(awareness)
        onChange()
      }
      update()
      awareness.on('change', update)
      return () => awareness.off('change', update)
    },
    [awareness],
  )
  return useSyncExternalStore(subscribe, () => (awareness ? snapshot.current : NO_PRESENCE))
}

const NO_PRESENCE: RemotePresence[] = []

/**
 * The page a participant works on. Clients that did not know about pages do not publish one: they always
 * edit the default page.
 */
export function participantPage(state: Record<string, unknown>): string {
  return typeof state.page === 'string' ? state.page : DEFAULT_PAGE_ID
}

export function readRemotePresence(awareness: Awareness): RemotePresence[] {
  const result: RemotePresence[] = []
  awareness.getStates().forEach((state, clientId) => {
    const user = state.user as ParticipantIdentity | undefined
    if (clientId === awareness.clientID || !user?.name || !user.color) return
    const cursor = state.cursor as Point | null | undefined
    const selection = state.selection as unknown
    const viewport = state.viewport as Viewport | null | undefined
    const editing = state.editing as unknown
    const presenting = state.presenting as unknown
    const following = state.following as unknown
    result.push({
      clientId,
      name: user.name,
      color: user.color,
      avatarUrl: user.avatarUrl,
      page: participantPage(state),
      cursor: cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y) ? cursor : null,
      selection: Array.isArray(selection) ? selection.filter((id): id is string => typeof id === 'string') : [],
      viewport:
        viewport && [viewport.x, viewport.y, viewport.scale].every(Number.isFinite) && viewport.scale > 0 ? viewport : null,
      editing: typeof editing === 'string' && editing !== '' ? editing : null,
      presenting: typeof presenting === 'number' && Number.isFinite(presenting) && presenting > 0 ? presenting : null,
      following: Number.isInteger(following) ? (following as number) : null,
    })
  })
  return result
}
