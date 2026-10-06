import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import { diffSnapshots, snapshotDocument, type BoardDiff, type BoardSnapshot } from '../diagram/diff.ts'

/** The shortest time between two snapshots of a document that changes: a few comparisons a second at most. */
export const SNAPSHOT_INTERVAL_MS = 200

/** How many times longer than reading the document the snapshots of a big board wait, so that the page stays smooth. */
const SNAPSHOT_COST_FACTOR = 5

/**
 * The changes of `later` since `earlier`, e.g. of the board since a version; `null` until both documents are there.
 * `earlier` is read once. `later` is read again after other participants change it, at most every
 * {@link SNAPSHOT_INTERVAL_MS} and less often for boards whose reading takes long.
 */
export function useBoardDiff(earlier: Y.Doc | null, later: Y.Doc | null): BoardDiff | null {
  const before = useMemo(() => earlier && snapshotDocument(earlier), [earlier])
  const after = useDocumentSnapshot(later)
  return useMemo(() => (before && after ? diffSnapshots(before, after) : null), [before, after])
}

function useDocumentSnapshot(document: Y.Doc | null): BoardSnapshot | null {
  // The snapshot with the document it was read from, so that another document never gets it.
  const current = useRef<{ document: Y.Doc; snapshot: BoardSnapshot } | null>(null)
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!document) return () => {}
      let timer: ReturnType<typeof setTimeout> | undefined
      let cost = 0
      const read = () => {
        timer = undefined
        const started = performance.now()
        current.current = { document, snapshot: snapshotDocument(document) }
        cost = performance.now() - started
        onChange()
      }
      const schedule = () => {
        timer ??= setTimeout(read, Math.max(SNAPSHOT_INTERVAL_MS, SNAPSHOT_COST_FACTOR * cost))
      }
      read()
      document.on('update', schedule)
      return () => {
        clearTimeout(timer)
        document.off('update', schedule)
      }
    },
    [document],
  )
  return useSyncExternalStore(subscribe, () =>
    document && current.current?.document === document ? current.current.snapshot : null,
  )
}
