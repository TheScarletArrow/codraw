import * as Y from 'yjs'
import { hasViews, syncViews, VIEW_ORIGIN } from './modelViews.ts'

/**
 * Keeps the views of a board in line with its model (see `modelViews.ts`) for a participant who edits it: after every
 * transaction that changed the pages, the cells or the elements of the board — a change on the canvas, a command, an
 * import, a restore, an undo, a change of another participant or of an older version of the app —, it brings all views
 * in line in a transaction of {@link VIEW_ORIGIN}, which no history undoes and which marks nobody as the author. Its own
 * transactions it lets pass, and a view already in line writes nothing, so it never loops. It brings the views in line
 * once when attached too: the board catches up with what was changed while nobody kept them.
 *
 * A participant who may only view the board keeps nothing: collab would reject the change.
 */
export function attachViewKeeper(doc: Y.Doc): () => void {
  const roots = new Set<unknown>()
  const touchesModel = (transaction: Y.Transaction) => {
    roots.clear()
    roots.add(doc.getMap('pages'))
    roots.add(doc.getMap('elements'))
    for (const [name, type] of doc.share) if (name.startsWith('cells:')) roots.add(type)
    for (const type of transaction.changed.keys()) {
      // The top-level type a changed type lies in.
      let root = type
      while (root._item) root = root._item.parent as typeof type
      if (roots.has(root)) return true
    }
    return false
  }
  const keep = () => {
    if (!hasViews(doc)) return
    doc.transact(() => syncViews(doc), VIEW_ORIGIN)
  }
  const listener = (transaction: Y.Transaction) => {
    if (transaction.origin === VIEW_ORIGIN || transaction.changed.size === 0 || !touchesModel(transaction)) return
    keep()
  }
  doc.on('afterTransaction', listener)
  keep()
  return () => doc.off('afterTransaction', listener)
}
