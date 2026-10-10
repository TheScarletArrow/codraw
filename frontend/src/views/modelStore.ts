import type * as Y from 'yjs'
import { buildModel, type BoardModel, type ModelElement } from '../diagram/boardModel.ts'
import { kindLabel } from '../diagram/elementProps.ts'
import { isEdgeKey, itemElement } from '../diagram/modelViews.ts'
import { documentStore, type DocumentStore } from '../elements/elementList.ts'
import { viewMessages as m } from './messages.ts'

const stores = new WeakMap<Y.Doc, DocumentStore<BoardModel>>()

/**
 * The model of a board for `useSyncExternalStore` (see `boardModel.ts`): the tree of the panel of elements, the window of
 * the rule of a view, the bar of a view and the panel of properties share one, taken again while the board changes at
 * most as often as the list of elements.
 */
export function modelStore(doc: Y.Doc): DocumentStore<BoardModel> {
  let store = stores.get(doc)
  if (!store) {
    store = documentStore(doc, buildModel)
    stores.set(doc, store)
  }
  return store
}

/** «Магазин» or «Без имени». */
export const elementName = (element: ModelElement | undefined) => element?.properties.name || m.unnamed

/** «Container · Kotlin»: the kind and the technology of an element. */
export function elementDetails(element: ModelElement): string {
  const { kind, technology } = element.properties
  const what = element.level === 'node' ? m.deploymentNode : kind ? kindLabel(kind) : ''
  return [what, technology].filter(Boolean).join(' · ')
}

/** The elements of the model of `levels`, by their names. */
export function elementsOf(model: BoardModel, levels: readonly ModelElement['level'][]): ModelElement[] {
  return [...model.elements.values()]
    .filter((element) => levels.includes(element.level))
    .sort((a, b) => elementName(a).localeCompare(elementName(b), 'ru'))
}

/** What was hidden on a view, by its key, as the list of hidden things names it; `null` for what the model lacks now. */
export function hiddenLabel(model: BoardModel, key: string): string | null {
  if (isEdgeKey(key)) {
    const [source, target] = key.split('>').map((end) => model.elements.get(itemElement(end)))
    return source && target ? `${elementName(source)} → ${elementName(target)}` : null
  }
  const element = model.elements.get(itemElement(key))
  return element ? elementName(element) : null
}
