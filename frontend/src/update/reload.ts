/** The moment of the last reload that the app made by itself after a part of it had not loaded. */
export const RELOAD_KEY = 'codraw.reload-after-deploy'
/** A reload of its own within this time did not help: the app does not reload again, so that it cannot loop. */
export const RELOAD_WINDOW_MS = 60 * 1000

/**
 * Reloads the page with the same address unless the app did so a moment ago; `false` when it did not reload: a reload
 * within {@link RELOAD_WINDOW_MS} did not help, or the storage of the session is not available to guard against a loop.
 */
export function reloadOnce(reload: () => void = () => location.reload()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY))
    const now = Date.now()
    if (last > 0 && now - last >= 0 && now - last < RELOAD_WINDOW_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    return false
  }
  reload()
  return true
}

/** Edits that an open page may hold only in the tab. */
export interface UnsavedWork {
  /** Applies what is half done, e.g. a label being edited, to the document. */
  flush(): void
  /** The page has edits that are neither on the server nor in the local copy of the browser. */
  unsaved(): boolean
}

const works = new Set<UnsavedWork>()

/** A page tells what it may lose to a reload; the returned function takes it back. */
export function registerUnsavedWork(work: UnsavedWork): () => void {
  works.add(work)
  return () => works.delete(work)
}

const anyUnsaved = () => [...works].some((work) => work.unsaved())
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** How long a reload waits for the edits to reach the server or the local copy. */
export const SAVE_TIMEOUT_MS = 3000
/** IndexedDB writes the local copy in a transaction of its own, which ends after the edit. */
const STORE_DELAY_MS = 100

/**
 * Gets the page ready for a reload: applies the half done edits and waits up to {@link SAVE_TIMEOUT_MS} for every edit
 * to reach the server or the local copy; `false` when some would still be lost.
 */
export async function prepareReload(): Promise<boolean> {
  for (const work of works) {
    try {
      work.flush()
    } catch {
      // A page that cannot apply its half done edit still lets the others save theirs.
    }
  }
  const deadline = Date.now() + SAVE_TIMEOUT_MS
  while (anyUnsaved() && Date.now() < deadline) await sleep(STORE_DELAY_MS)
  if (anyUnsaved()) return false
  await sleep(STORE_DELAY_MS)
  return true
}
