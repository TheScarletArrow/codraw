import * as Y from 'yjs'

/** Origin of the transaction that restores a version; the undo histories of the pages do not track it. */
export const RESTORE_ORIGIN = 'codraw:restore'

/**
 * Makes the board document `live` equal to the document of a version, in one transaction. Every top-level map (`meta`,
 * `pages`, `cells:<pageId>`) is brought to the content of the version: keys that the version lacks are deleted, nested
 * maps are compared key by key, and plain values are written only when they differ. So cells that the version shares
 * with the live document stay the same Yjs objects, and concurrent changes of them by other participants merge.
 */
export function restoreDocument(live: Y.Doc, version: Y.Doc) {
  const names = new Set([...topLevelNames(live), ...topLevelNames(version)])
  live.transact(() => {
    for (const name of names) syncMap(live.getMap(name), version.getMap(name))
  }, RESTORE_ORIGIN)
}

/** Names of the top-level types of a document; every one of the board document is a map. */
function topLevelNames(doc: Y.Doc): string[] {
  return Array.from(doc.share.keys())
}

function syncMap(target: Y.Map<unknown>, source: Y.Map<unknown>) {
  for (const key of Array.from(target.keys())) {
    if (!source.has(key)) target.delete(key)
  }
  source.forEach((value, key) => {
    const current = target.get(key)
    if (value instanceof Y.Map) {
      if (current instanceof Y.Map) syncMap(current, value)
      else target.set(key, copyMap(value))
    } else if (current instanceof Y.AbstractType || !sameValue(current, value)) {
      target.set(key, structuredClone(value))
    }
  })
}

/** A detached copy of a map of another document, with its nested maps. */
function copyMap(source: Y.Map<unknown>): Y.Map<unknown> {
  const copy = new Y.Map<unknown>()
  source.forEach((value, key) => copy.set(key, value instanceof Y.Map ? copyMap(value) : structuredClone(value)))
  return copy
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}
