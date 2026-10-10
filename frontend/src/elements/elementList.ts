import * as Y from 'yjs'
import { searchText } from '../diagram/canvasSearch.ts'
import type { ElementProperties } from '../diagram/elementKinds.ts'
import { elementProperties, kindLabel } from '../diagram/elementProps.ts'
import { cellElementId, getCells, readCell } from '../diagram/model.ts'
import { listPages } from '../diagram/pages.ts'
import { mayBeElement } from '../diagram/sharedElements.ts'
import { elementsMessages as m } from './messages.ts'

/** The cells of an element on a page. */
export interface ElementPlaceOnPage {
  pageId: string
  pageName: string
  cellIds: string[]
}

/** An element of the board, as the panel «Элементы доски» lists it. */
export interface ElementItem {
  /** The id of the element, or `pageId/cellId` of a shape of a kind that is no element yet. */
  key: string
  elementId: string | null
  /** The properties of the element: of its first cell, or of the label of the shape. */
  properties: ElementProperties
  /** The pages with its cells, in their order. */
  places: ElementPlaceOnPage[]
}

/**
 * The elements of all pages of a board: the cells of each element of the document, and the shapes of a kind that are no
 * elements yet, each on its own; sorted by name, those without a name last.
 */
export function listElements(doc: Y.Doc): ElementItem[] {
  const items = new Map<string, ElementItem>()
  for (const page of listPages(doc)) {
    const cells = getCells(doc, page.id)
    cells.forEach((cell, cellId) => {
      if (!(cell instanceof Y.Map) || !mayBeElement(cells, cellId)) return
      const elementId = cellElementId(cell)
      const key = elementId ?? `${page.id}/${cellId}`
      const known = items.get(key)
      if (known) {
        const place = known.places.at(-1)!
        if (place.pageId === page.id) place.cellIds.push(cellId)
        else known.places.push({ pageId: page.id, pageName: page.name, cellIds: [cellId] })
        return
      }
      const data = readCell(cellId, cell)
      const properties = elementProperties(data.style, data.value)
      // A shape that is no element yet is one when it stands for something: a service, a database, a container.
      if (elementId === null && properties.kind === null) return
      items.set(key, { key, elementId, properties, places: [{ pageId: page.id, pageName: page.name, cellIds: [cellId] }] })
    })
  }
  return [...items.values()].sort((a, b) => {
    if (!a.properties.name || !b.properties.name) return a.properties.name ? -1 : b.properties.name ? 1 : 0
    return a.properties.name.localeCompare(b.properties.name, 'ru')
  })
}

/** «2 стр.»: the number of pages with the cells of an element. */
export const pagesLabel = (count: number) => m.pagesShort(count)

/** «на 1 странице», «на 2 страницах». */
export const onPagesLabel = (count: number): string => m.onPages(count)

/** «Есть ещё на 2 страницах: Контекст, Деплой»: where else the element of a cell of the page `pageId` is. */
export function sharedLabel(item: ElementItem, pageId: string): string {
  const others = item.places.filter((place) => place.pageId !== pageId).map((place) => place.pageName)
  return m.alsoOn(onPagesLabel(others.length), others.join(', '))
}

/** What an item is found by: its name, kind, technology, description, owner and tags. */
function itemText(item: ElementItem): string {
  const { name, kind, technology, description, owner, tags } = item.properties
  return searchText([name, kind ? kindLabel(kind) : '', technology, description, owner, ...tags].join(' '))
}

/** The items that have every word of `query` in their properties; all of them for an empty query. */
export function searchElements(items: readonly ElementItem[], query: string): ElementItem[] {
  const words = searchText(query).trim().split(' ').filter(Boolean)
  if (words.length === 0) return [...items]
  return items.filter((item) => {
    const text = itemText(item)
    return words.every((word) => text.includes(word))
  })
}

/** How often the list is taken again while the board changes, at most. */
export const ELEMENTS_INTERVAL_MS = 150

/** Something read from a board for `useSyncExternalStore`, e.g. its elements, which the panel and the badges share. */
export interface DocumentStore<T> {
  get(): T
  subscribe(onChange: () => void): () => void
}

/** The elements of a board for `useSyncExternalStore`: the panel «Элементы доски» and the badges share one. */
export type ElementsStore = DocumentStore<readonly ElementItem[]>

const stores = new WeakMap<Y.Doc, ElementsStore>()

/**
 * The store of the elements of a board: the same list until the document changes, and while it does, taken again at
 * most every {@link ELEMENTS_INTERVAL_MS}. A change heard by nobody, e.g. between a render and the subscription, is
 * taken at the next read.
 */
export function elementsStore(doc: Y.Doc): ElementsStore {
  let store = stores.get(doc)
  if (!store) {
    store = documentStore(doc, listElements)
    stores.set(doc, store)
  }
  return store
}

/**
 * A store of what `read` takes from a board: the same value until the document changes, and while it does, taken again
 * at most every {@link ELEMENTS_INTERVAL_MS}. A change heard by nobody is taken at the next read.
 */
export function documentStore<T>(doc: Y.Doc, read: (doc: Y.Doc) => T): DocumentStore<T> {
  // Changes of the document seen so far, and the value as it was after some of them.
  let version = 0
  let snapshot: { version: number; value: T } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  // Heard as long as the document lives, listened to or not: a change heard by nobody is taken at the next read.
  doc.on('afterTransaction', (transaction: Y.Transaction) => {
    if (transaction.changed.size === 0) return
    version++
    if (listeners.size === 0) return
    timer ??= setTimeout(() => {
      timer = undefined
      listeners.forEach((listener) => listener())
    }, ELEMENTS_INTERVAL_MS)
  })
  return {
    get() {
      // While a notification is due, the value stays as it is.
      if (!snapshot || (snapshot.version !== version && timer === undefined)) snapshot = { version, value: read(doc) }
      return snapshot.value
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
