import { useCallback, useRef, useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import { getPages, initializeDocument } from '../diagram/model.ts'
import { listPages, type PageInfo } from '../diagram/pages.ts'

const NO_PAGES: PageInfo[] = []

/**
 * Pages of the board in their order; re-renders when other participants change them. A participant who may edit the
 * board (`editable`) gives a board left without pages its first page again.
 */
export function usePages(document: Y.Doc | null, editable = true): PageInfo[] {
  const snapshot = useRef<PageInfo[]>(NO_PAGES)
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!document) return () => {}
      const pages = getPages(document)
      const update = () => {
        // Concurrent deletions by several participants can leave the board without pages.
        if (pages.size === 0 && editable) initializeDocument(document)
        snapshot.current = listPages(document)
        onChange()
      }
      update()
      pages.observeDeep(update)
      return () => pages.unobserveDeep(update)
    },
    [document, editable],
  )
  return useSyncExternalStore(subscribe, () => (document ? snapshot.current : NO_PAGES))
}
