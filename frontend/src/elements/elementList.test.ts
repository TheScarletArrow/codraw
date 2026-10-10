import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DEFAULT_PAGE_ID, ELEMENT_KEY, getCells, initializeDocument, writeCell, type CellData } from '../diagram/model.ts'
import { addPage } from '../diagram/pages.ts'
import { shapeData } from '../diagram/testing.ts'
import { setLocale } from '../i18n/i18n.ts'
import { elementsStore, ELEMENTS_INTERVAL_MS, listElements, onPagesLabel, searchElements, sharedLabel } from './elementList.ts'

const PAYMENTS = {
  codrawShape: 'c4-container',
  [ELEMENT_KEY]: 'e1',
  codrawName: 'Payments',
  codrawKind: 'c4-container',
  codrawTechnology: 'Kafka Streams',
  codrawTags: ['pci'],
}

function board() {
  const doc = new Y.Doc()
  initializeDocument(doc)
  const second = addPage(doc, DEFAULT_PAGE_ID)
  const put = (pageId: string, ...cells: CellData[]) =>
    doc.transact(() => cells.forEach((cell) => writeCell(getCells(doc, pageId), cell)))
  put(
    DEFAULT_PAGE_ID,
    shapeData('a', 'a0', { value: 'Payments\n[Container: Kafka Streams]', style: PAYMENTS }),
    shapeData('db', 'a1', { value: 'Счета\n[PostgreSQL]', style: { codrawShape: 'database' } }),
    shapeData('box', 'a2', { value: 'Прямоугольник', style: {} }),
  )
  put(
    second,
    shapeData('b', 'a0', { value: 'Payments\n[Container: Kafka Streams]', style: PAYMENTS }),
    shapeData('b2', 'a1', { value: 'Payments\n[Container: Kafka Streams]', style: PAYMENTS }),
    shapeData('anon', 'a2', { value: '', style: { codrawShape: 'queue' } }),
  )
  return { doc, second, put }
}

describe('elements of a board', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the elements of all pages and the shapes of a kind that are no elements yet, by name, those without one last', () => {
    const { doc, second } = board()

    // Russian names sort before Latin ones.
    expect(listElements(doc)).toEqual([
      {
        key: `${DEFAULT_PAGE_ID}/db`,
        elementId: null,
        properties: expect.objectContaining({ name: 'Счета', kind: 'database', technology: 'PostgreSQL' }),
        places: [{ pageId: DEFAULT_PAGE_ID, pageName: 'Страница 1', cellIds: ['db'] }],
      },
      {
        key: 'e1',
        elementId: 'e1',
        properties: expect.objectContaining({ name: 'Payments', kind: 'c4-container', technology: 'Kafka Streams', tags: ['pci'] }),
        places: [
          { pageId: DEFAULT_PAGE_ID, pageName: 'Страница 1', cellIds: ['a'] },
          { pageId: second, pageName: 'Страница 2', cellIds: ['b', 'b2'] },
        ],
      },
      {
        key: `${second}/anon`,
        elementId: null,
        properties: expect.objectContaining({ name: '', kind: 'queue' }),
        places: [{ pageId: second, pageName: 'Страница 2', cellIds: ['anon'] }],
      },
    ])
  })

  it('finds elements by every word of the search in their properties, «ё» as «е»', () => {
    const { doc } = board()
    const items = listElements(doc)

    expect(searchElements(items, 'kafka').map((item) => item.key)).toEqual(['e1'])
    expect(searchElements(items, 'PCI container').map((item) => item.key)).toEqual(['e1'])
    expect(searchElements(items, 'база postgres').map((item) => item.key)).toEqual([`${DEFAULT_PAGE_ID}/db`])
    expect(searchElements(items, 'счёта').map((item) => item.key)).toEqual([`${DEFAULT_PAGE_ID}/db`])
    expect(searchElements(items, '  ')).toHaveLength(3)
  })

  it('names the other pages of an element', () => {
    const { doc, second } = board()
    const payments = listElements(doc).find((item) => item.key === 'e1')

    expect(sharedLabel(payments!, DEFAULT_PAGE_ID)).toBe('Есть ещё на 1 странице: Страница 2')
    expect(sharedLabel(payments!, second)).toBe('Есть ещё на 1 странице: Страница 1')
    expect([1, 2, 5, 11, 21].map(onPagesLabel)).toEqual([
      'на 1 странице',
      'на 2 страницах',
      'на 5 страницах',
      'на 11 страницах',
      'на 21 странице',
    ])
    setLocale('en')
    expect(sharedLabel(payments!, second)).toBe('Also on 1 page: Страница 1')
    expect([1, 2].map(onPagesLabel)).toEqual(['on 1 page', 'on 2 pages'])
  })

  it('keeps the list until the board changes, takes it again at most every 150 ms, and takes changes made before listening', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { doc, put } = board()
    const store = elementsStore(doc)
    const first = store.get()
    expect(store.get()).toBe(first)

    // Nobody listens: the next read takes the change.
    put(DEFAULT_PAGE_ID, shapeData('c', 'a3', { value: 'Кэш', style: { codrawShape: 'cache' } }))
    const second = store.get()
    expect(second).toHaveLength(4)

    const onChange = vi.fn()
    const stop = store.subscribe(onChange)
    put(DEFAULT_PAGE_ID, shapeData('d', 'a4', { value: 'Шлюз', style: { codrawShape: 'api-gateway' } }))
    put(DEFAULT_PAGE_ID, shapeData('e', 'a5', { value: 'CDN', style: { codrawShape: 'cdn' } }))
    expect(store.get()).toBe(second)
    vi.advanceTimersByTime(ELEMENTS_INTERVAL_MS)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(store.get()).toHaveLength(6)
    stop()
  })
})
