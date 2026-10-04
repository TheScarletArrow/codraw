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
}

/** Cursor updates are sent at most this often (20 per second). */
export const CURSOR_INTERVAL_MS = 50

/** Publishes the page, the local pointer and the selection of the editor to the other participants. */
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

    return () => {
      offPointer()
      offSelection()
      clearTimeout(timer)
      awareness.setLocalStateField('cursor', null)
      awareness.setLocalStateField('selection', [])
    }
  }, [editor, awareness])
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
    result.push({
      clientId,
      name: user.name,
      color: user.color,
      avatarUrl: user.avatarUrl,
      page: participantPage(state),
      cursor: cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y) ? cursor : null,
      selection: Array.isArray(selection) ? selection.filter((id): id is string => typeof id === 'string') : [],
    })
  })
  return result
}
