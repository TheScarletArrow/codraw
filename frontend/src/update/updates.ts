import { useSyncExternalStore } from 'react'
import { fetchDeployedBuild, isOtherBuild } from './version.ts'

/** How often a visible tab asks for the build of the server. */
export const CHECK_INTERVAL_MS = 5 * 60 * 1000
/** Returning to the tab or to the network asks again at most this often. */
export const MIN_CHECK_GAP_MS = 30 * 1000

/** What the tab knows of a newer CoDraw. */
export interface UpdateState {
  /** The server gives another build than the one of this tab. */
  available: boolean
  /** An open document is written by a newer schema than this build knows: the tab cannot edit it. */
  newerDocument: boolean
}

let state: UpdateState = { available: false, newerDocument: false }
const listeners = new Set<() => void>()
let newerDocuments = 0
let lastCheck = Number.NEGATIVE_INFINITY
let checking: Promise<void> | null = null

function setState(next: Partial<UpdateState>) {
  const changed = { ...state, ...next }
  if (changed.available === state.available && changed.newerDocument === state.newerDocument) return
  state = changed
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const updateState = (): UpdateState => state

/** What the tab knows of a newer CoDraw, rendering again when it learns more. */
export const useUpdateState = (): UpdateState => useSyncExternalStore(subscribe, updateState, updateState)

/**
 * Asks the server which build it gives, unless the tab knows of a newer one already or asked a moment ago; `force`
 * asks anyway, e.g. once a part of the app has not loaded.
 */
export function checkForUpdate({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (state.available) return Promise.resolve()
  if (checking) return checking
  const now = Date.now()
  if (!force && now - lastCheck < MIN_CHECK_GAP_MS) return Promise.resolve()
  lastCheck = now
  checking = fetchDeployedBuild()
    .then((deployed) => {
      // A server that did not answer, e.g. while it restarts with the new build, is asked again at the next chance.
      if (deployed === null) lastCheck = Number.NEGATIVE_INFINITY
      else if (isOtherBuild(deployed)) setState({ available: true })
    })
    .finally(() => {
      checking = null
    })
  return checking
}

/**
 * Checks for a new build while the tab is open: periodically while it is visible, when the user comes back to it, when
 * the network comes back, and when a part of the app has not loaded (`vite:preloadError`). The failed import still
 * fails for the code that asked for it, which shows its own message: reloading in the middle of work could close a form.
 */
export function startUpdateChecks(target: Window = window): () => void {
  const visible = () => target.document.visibilityState === 'visible'
  const interval = target.setInterval(() => {
    if (visible()) void checkForUpdate()
  }, CHECK_INTERVAL_MS)
  const onVisibility = () => {
    if (visible()) void checkForUpdate()
  }
  const onOnline = () => void checkForUpdate()
  const onPreloadError = () => void checkForUpdate({ force: true })
  target.document.addEventListener('visibilitychange', onVisibility)
  target.addEventListener('online', onOnline)
  target.addEventListener('vite:preloadError', onPreloadError)
  return () => {
    target.clearInterval(interval)
    target.document.removeEventListener('visibilitychange', onVisibility)
    target.removeEventListener('online', onOnline)
    target.removeEventListener('vite:preloadError', onPreloadError)
  }
}

/** An open document is newer than this build; the returned function tells that it is closed. */
export function reportNewerDocument(): () => void {
  newerDocuments += 1
  setState({ newerDocument: true })
  let released = false
  return () => {
    if (released) return
    released = true
    newerDocuments -= 1
    if (newerDocuments === 0) setState({ newerDocument: false })
  }
}

/** Forgets what the tab learned: for tests. */
export function resetUpdates() {
  state = { available: false, newerDocument: false }
  newerDocuments = 0
  lastCheck = Number.NEGATIVE_INFINITY
  checking = null
  for (const listener of listeners) listener()
}
