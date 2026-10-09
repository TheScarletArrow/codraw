import { useSyncExternalStore } from 'react'
import type * as Y from 'yjs'
import { boardChecks, CHECKS_ORIGIN, readCheckSettings, visibleIssues, type CheckIssue, type CheckSettings } from './checks.ts'

/** How often the checks are worked out again while the board changes, at most: a drag gives dozens of changes a second. */
export const CHECKS_INTERVAL_MS = 300

/** The checks of a board as the page shows them: the remarks of the rules that are on, shown and hidden, and the settings. */
export interface BoardChecks {
  shown: readonly CheckIssue[]
  hidden: readonly CheckIssue[]
  settings: CheckSettings
}

const NO_CHECKS: BoardChecks = { shown: [], hidden: [], settings: { disabled: new Set(), hidden: new Set() } }

interface ChecksStore {
  get(): BoardChecks
  subscribe(onChange: () => void): () => void
}

const stores = new WeakMap<Y.Doc, ChecksStore>()

/** The store of the checks of a board, which the button and the panel share. */
function checksStore(doc: Y.Doc): ChecksStore {
  let store = stores.get(doc)
  if (!store) {
    store = createChecksStore(doc)
    stores.set(doc, store)
  }
  return store
}

/**
 * The same checks until the document changes, and while it does, worked out again at most every
 * {@link CHECKS_INTERVAL_MS}. A change heard by nobody is taken at the next read.
 */
function createChecksStore(doc: Y.Doc): ChecksStore {
  let version = 0
  let snapshot: { version: number; checks: BoardChecks } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  doc.on('afterTransaction', (transaction: Y.Transaction) => {
    if (transaction.changed.size === 0) return
    version++
    if (listeners.size === 0) return
    // A remark hidden or a rule turned off here goes at once.
    if (transaction.origin === CHECKS_ORIGIN) {
      clearTimeout(timer)
      timer = undefined
      listeners.forEach((listener) => listener())
      return
    }
    timer ??= setTimeout(() => {
      timer = undefined
      listeners.forEach((listener) => listener())
    }, CHECKS_INTERVAL_MS)
  })
  return {
    get() {
      // While a notification is due, the checks stay as they are.
      if (!snapshot || (snapshot.version !== version && timer === undefined)) {
        const settings = readCheckSettings(doc)
        snapshot = { version, checks: { ...visibleIssues(boardChecks(doc), settings), settings } }
      }
      return snapshot.checks
    },
    subscribe(onChange) {
      listeners.add(onChange)
      return () => {
        listeners.delete(onChange)
        if (listeners.size > 0) return
        clearTimeout(timer)
        timer = undefined
      }
    },
  }
}

const noSubscription = () => () => {}

/** The checks of the board of `doc`, worked out again as it changes. */
export function useChecks(doc: Y.Doc | null): BoardChecks {
  const store = doc ? checksStore(doc) : null
  return useSyncExternalStore(store?.subscribe ?? noSubscription, () => store?.get() ?? NO_CHECKS)
}
