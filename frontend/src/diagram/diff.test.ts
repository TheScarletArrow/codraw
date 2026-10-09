import type { CellStyle } from '@maxgraph/core'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { writeAttribution } from './attribution.ts'
import { fromStyle } from './binding.ts'
import {
  countChanges,
  diffDocuments,
  diffSnapshots,
  groupChanges,
  heaviestIncreasing,
  snapshotDocument,
  treeOrder,
  type CellDiff,
  type PageDiff,
} from './diff.ts'
import {
  DEFAULT_PAGE_ID,
  ELEMENT_KEY,
  getCells,
  getElements,
  getPages,
  orderBetween,
  writeAttrs,
  writeCell,
  writePage,
  type CellData,
} from './model.ts'
import { TABLE_FIELD_STYLE, TABLE_INDEX_KEY, TABLE_STYLE, type ShapeStyle } from './shapes.ts'
import { boardWith, edgeData, laterState, shapeData } from './testing.ts'

/** A style of the palette as the document stores it. */
const stored = (style: ShapeStyle) => fromStyle(style as CellStyle)

const cell = (doc: Y.Doc, id: string, page = DEFAULT_PAGE_ID) => getCells(doc, page).get(id)!

/** The changes of the default page, or `undefined` when it has none. */
const pageDiff = (before: Y.Doc, after: Y.Doc): PageDiff | undefined =>
  diffDocuments(before, after).pages.find((page) => page.id === DEFAULT_PAGE_ID)

const summary = (changes: CellDiff[]) => changes.map((change) => [change.type, change.id])

const changesOf = (page: PageDiff | undefined, id: string) => {
  const change = page?.cells.find((item) => item.id === id)
  return change?.type === 'changed' ? change.changes : undefined
}

/** A table with fields of 26 pixels under a header of 30, as the layout of a table places them. */
function table(id: string, order: string, fields: string[]): CellData[] {
  return [
    shapeData(id, order, { value: id, style: stored(TABLE_STYLE), geometry: { x: 100, y: 100, width: 200, height: 30 + 26 * fields.length } }),
    ...fields.map((field, index) =>
      shapeData(`${id}.${field}`, `a${index}`, {
        parent: id,
        value: field,
        style: stored(TABLE_FIELD_STYLE),
        geometry: { x: 0, y: 30 + 26 * index, width: 200, height: 26 },
      }),
    ),
  ]
}

describe('comparing two states of a board', () => {
  it('finds nothing in equal states, and in a copy of the same state', () => {
    const doc = boardWith(shapeData('a', 'a0', { value: 'API' }), shapeData('b', 'a1'), edgeData('e', 'a2', 'a', 'b'))

    expect(diffDocuments(doc, doc)).toEqual({ pages: [] })
    expect(diffDocuments(doc, laterState(doc))).toEqual({ pages: [] })
  })

  it('finds added, removed and changed shapes', () => {
    const version = boardWith(shapeData('kept', 'a0', { value: 'API' }), shapeData('gone', 'a1', { value: 'Кэш' }))
    const now = laterState(version, (doc) => {
      cell(doc, 'kept').set('value', 'Шлюз')
      getCells(doc).delete('gone')
      writeCell(getCells(doc), shapeData('new', 'a2', { value: 'БД' }))
    })

    const page = pageDiff(version, now)!

    expect(page.type).toBe('changed')
    expect(summary(page.cells)).toEqual([
      ['added', 'new'],
      ['changed', 'kept'],
      ['removed', 'gone'],
    ])
    expect(changesOf(page, 'kept')).toEqual({ fields: ['value'], geometry: [], style: [], attrs: [] })
    const removed = page.cells[2]!
    expect(removed.type === 'removed' && removed.before.value).toBe('Кэш')
    const added = page.cells[0]!
    expect(added.type === 'added' && added.after.value).toBe('БД')
  })

  it('takes the layers of a page for no change, and an element moved into another layer for a change of its parent', () => {
    const version = boardWith(shapeData('note', 'a0', { value: 'Идея' }))
    const now = laterState(version, (doc) => {
      writeCell(getCells(doc), { ...shapeData('notes', 'a1', { value: 'Заметки' }), kind: 'layer', parent: '0', geometry: null })
      cell(doc, 'note').set('parent', 'notes')
      cell(doc, '1').set('value', 'Схема')
    })

    const page = pageDiff(version, now)!

    expect(summary(page.cells)).toEqual([['changed', 'note']])
    expect(changesOf(page, 'note')!.fields).toEqual(['parent'])
  })

  it('names the style keys that were changed, added and removed', () => {
    const version = boardWith(shapeData('a', 'a0', { style: { fillColor: '#ffffff', dashed: true, shape: 'ellipse' } }))
    const now = laterState(version, (doc) => {
      const style = cell(doc, 'a').get('style') as Y.Map<unknown>
      style.set('fillColor', '#dae8fc')
      style.delete('dashed')
      style.set('fontSize', 16)
    })

    expect(changesOf(pageDiff(version, now), 'a')).toEqual({ fields: [], geometry: [], style: ['fillColor', 'dashed', 'fontSize'], attrs: [] })
  })

  it('compares the properties of the element of a cell as keys of its style', () => {
    const version = boardWith(shapeData('a', 'a0', { style: { [ELEMENT_KEY]: 'e1', codrawName: 'API', codrawTechnology: 'Java' } }))
    const now = laterState(version, (doc) => getElements(doc).get('e1')!.set('technology', 'Kotlin'))

    const snapshot = snapshotDocument(now).get(DEFAULT_PAGE_ID)!.cells.get('a')!
    expect(snapshot.style).toEqual({ [ELEMENT_KEY]: 'e1', codrawName: 'API', codrawTechnology: 'Kotlin' })
    expect(changesOf(pageDiff(version, now), 'a')).toEqual({ fields: [], geometry: [], style: ['codrawTechnology'], attrs: [] })
  })

  it('names what changed in the geometry: position, size, bends and loose ends', () => {
    const version = boardWith(
      shapeData('moved', 'a0', { geometry: { x: 10, y: 20, width: 120, height: 60 } }),
      shapeData('resized', 'a1', { geometry: { x: 10, y: 200, width: 120, height: 60 } }),
      edgeData('bent', 'a2', 'moved', 'resized'),
      edgeData('loose', 'a3', 'moved', null, { geometry: { x: 0, y: 0, width: 0, height: 0, relative: true, targetPoint: { x: 400, y: 50 } } }),
    )
    const now = laterState(version, (doc) => {
      cell(doc, 'moved').set('geometry', { x: 40, y: 20, width: 120, height: 60 })
      cell(doc, 'resized').set('geometry', { x: 10, y: 200, width: 160, height: 80 })
      cell(doc, 'bent').set('geometry', { x: 0, y: 0, width: 0, height: 0, relative: true, points: [{ x: 70, y: 150 }] })
      cell(doc, 'loose').set('geometry', { x: 0, y: 0, width: 0, height: 0, relative: true, targetPoint: { x: 420, y: 50 } })
    })

    const page = pageDiff(version, now)
    expect(changesOf(page, 'moved')?.geometry).toEqual(['x'])
    expect(changesOf(page, 'resized')?.geometry).toEqual(['width', 'height'])
    expect(changesOf(page, 'bent')?.geometry).toEqual(['points'])
    expect(changesOf(page, 'loose')?.geometry).toEqual(['targetPoint'])
  })

  it('takes no account of the noise of floating-point coordinates', () => {
    const version = boardWith(shapeData('a', 'a0', { geometry: { x: 0.1 + 0.2, y: 10, width: 120, height: 60, points: [{ x: 1, y: 2 }] } }))
    const now = laterState(version, (doc) =>
      cell(doc, 'a').set('geometry', { x: 0.3, y: 10.000001, width: 120, height: 60, points: [{ x: 1.0000001, y: 2 }] }),
    )

    expect(diffDocuments(version, now)).toEqual({ pages: [] })
  })

  it('finds an edge connected elsewhere and an edge removed with its shape', () => {
    const version = boardWith(shapeData('a', 'a0'), shapeData('b', 'a1'), shapeData('c', 'a2'), edgeData('ab', 'a3', 'a', 'b'), edgeData('bc', 'a4', 'b', 'c'))
    const now = laterState(version, (doc) => {
      cell(doc, 'ab').set('target', 'c')
      getCells(doc).delete('b')
      getCells(doc).delete('bc')
    })

    const page = pageDiff(version, now)!
    expect(summary(page.cells)).toEqual([
      ['changed', 'ab'],
      ['removed', 'b'],
      ['removed', 'bc'],
    ])
    expect(changesOf(page, 'ab')?.fields).toEqual(['target'])
  })

  it('finds shapes put into a group, with their position in it', () => {
    const version = boardWith(shapeData('a', 'a0', { geometry: { x: 100, y: 100, width: 50, height: 50 } }), shapeData('b', 'a1'))
    const now = laterState(version, (doc) => {
      writeCell(getCells(doc), shapeData('group', 'a2', { style: { group: true }, geometry: { x: 90, y: 90, width: 70, height: 70 } }))
      writeCell(getCells(doc), shapeData('a', 'a0', { parent: 'group', geometry: { x: 10, y: 10, width: 50, height: 50 } }))
    })

    const page = pageDiff(version, now)!
    expect(summary(page.cells)).toEqual([
      ['added', 'group'],
      ['changed', 'a'],
    ])
    expect(changesOf(page, 'a')).toEqual({ fields: ['parent'], geometry: ['x', 'y'], style: [], attrs: [] })
  })

  it('finds only the shape brought to the front, not the shapes it passed', () => {
    const version = boardWith(...['a', 'b', 'c', 'd', 'e'].map((id, index) => shapeData(id, `a${index}`)))
    const now = laterState(version, (doc) => cell(doc, 'b').set('order', orderBetween('a4', null)))

    const page = pageDiff(version, now)!
    expect(summary(page.cells)).toEqual([['changed', 'b']])
    expect(changesOf(page, 'b')?.fields).toEqual(['order'])
  })

  it('takes no account of new order keys that keep the order', () => {
    const version = boardWith(shapeData('a', 'a0'), shapeData('b', 'a1'), shapeData('c', 'a2'))
    const now = laterState(version, (doc) => {
      cell(doc, 'b').set('order', 'a1V')
      cell(doc, 'c').set('order', 'a5')
    })

    expect(diffDocuments(version, now)).toEqual({ pages: [] })
  })

  describe('tables', () => {
    it('finds a field added in the middle of a table, not the fields it moved down or the taller table', () => {
      const version = boardWith(...table('users', 'a0', ['id', 'email']))
      const now = laterState(version, (doc) => {
        writeCell(
          getCells(doc),
          shapeData('users.name', 'a0V', { parent: 'users', value: 'name text', style: stored(TABLE_FIELD_STYLE), geometry: { x: 0, y: 56, width: 200, height: 26 } }),
        )
        cell(doc, 'users.email').set('geometry', { x: 0, y: 82, width: 200, height: 26 })
        cell(doc, 'users').set('geometry', { x: 100, y: 100, width: 200, height: 108 })
      })

      expect(summary(pageDiff(version, now)!.cells)).toEqual([['added', 'users.name']])
    })

    it('finds a renamed field, an added index and a wider table', () => {
      const version = boardWith(...table('users', 'a0', ['id', 'email']))
      const now = laterState(version, (doc) => {
        cell(doc, 'users.email').set('value', 'email text NOT NULL')
        writeCell(
          getCells(doc),
          shapeData('users.idx', 'a5', {
            parent: 'users',
            value: 'users_email_idx (email) UNIQUE',
            style: { ...stored(TABLE_FIELD_STYLE), [TABLE_INDEX_KEY]: true },
            geometry: { x: 0, y: 102, width: 260, height: 26 },
          }),
        )
        cell(doc, 'users').set('geometry', { x: 100, y: 100, width: 260, height: 128 })
        cell(doc, 'users.id').set('geometry', { x: 0, y: 30, width: 260, height: 26 })
      })

      const page = pageDiff(version, now)!
      expect(summary(page.cells)).toEqual([
        ['added', 'users.idx'],
        ['changed', 'users'],
        ['changed', 'users.email'],
      ])
      expect(changesOf(page, 'users')?.geometry).toEqual(['width'])
      expect(changesOf(page, 'users.email')).toEqual({ fields: ['value'], geometry: [], style: [], attrs: [] })
    })

    it('finds fields put in another order', () => {
      const version = boardWith(...table('users', 'a0', ['id', 'email', 'name']))
      const now = laterState(version, (doc) => cell(doc, 'users.name').set('order', orderBetween(null, 'a0')))

      const page = pageDiff(version, now)!
      expect(summary(page.cells)).toEqual([['changed', 'users.name']])
      expect(changesOf(page, 'users.name')?.fields).toEqual(['order'])
    })
  })

  describe('entries of a list', () => {
    it('keeps the fields of a new table in the entry of the table', () => {
      const version = boardWith(...table('users', 'a0', ['id']))
      const now = laterState(version, (doc) => {
        table('orders', 'a1', ['id', 'user_id', 'total']).forEach((data) => writeCell(getCells(doc), data))
        writeCell(getCells(doc), shapeData('users.email', 'a1', { parent: 'users', value: 'email', geometry: { x: 0, y: 56, width: 200, height: 26 } }))
      })

      const diff = diffDocuments(version, now)
      const entries = groupChanges(diff.pages[0]!)
      expect(entries.map(({ change, nested }) => [change.type, change.id, nested.map((item) => item.id)])).toEqual([
        ['added', 'users.email', []],
        ['added', 'orders', ['orders.id', 'orders.user_id', 'orders.total']],
      ])
      expect(countChanges(diff)).toEqual({ added: 2, changed: 0, removed: 0 })
    })

    it('keeps the shapes of a removed group in the entry of the group, deeper ones too', () => {
      const version = boardWith(
        shapeData('group', 'a0', { style: { group: true } }),
        shapeData('inner', 'a0', { parent: 'group', style: { group: true } }),
        shapeData('deep', 'a0', { parent: 'inner' }),
        shapeData('a', 'a1', { parent: 'group' }),
        shapeData('other', 'a1'),
      )
      const now = laterState(version, (doc) => {
        for (const id of ['group', 'inner', 'deep', 'a', 'other']) getCells(doc).delete(id)
      })

      const diff = diffDocuments(version, now)
      expect(groupChanges(diff.pages[0]!).map(({ change, nested }) => [change.id, nested.map((item) => item.id)])).toEqual([
        ['group', ['inner', 'deep', 'a']],
        ['other', []],
      ])
      expect(countChanges(diff)).toEqual({ added: 0, changed: 0, removed: 2 })
    })

    it('keeps changed cells as entries of their own, inside changed or kept parents', () => {
      const version = boardWith(...table('users', 'a0', ['id', 'email']))
      const now = laterState(version, (doc) => {
        cell(doc, 'users').set('value', 'accounts')
        cell(doc, 'users.email').set('value', 'login')
      })

      const entries = groupChanges(pageDiff(version, now)!)
      expect(entries.map(({ change, nested }) => [change.id, nested.length])).toEqual([
        ['users', 0],
        ['users.email', 0],
      ])
    })
  })

  describe('pages', () => {
    it('finds pages added with their cells, removed with their cells, renamed and moved', () => {
      const version = boardWith(shapeData('a', 'a0'))
      version.transact(() => {
        writePage(version, 'draft', { name: 'Черновик', order: 'a1' })
        writeCell(getCells(version, 'draft'), shapeData('sketch', 'a0'))
        writePage(version, 'scheme', { name: 'Схема', order: 'a2' })
      })
      const now = laterState(version, (doc) => {
        getPages(doc).delete('draft')
        getCells(doc, 'draft').delete('sketch')
        ;(getPages(doc).get('scheme') as Y.Map<unknown>).set('name', 'Схема v2')
        ;(getPages(doc).get('scheme') as Y.Map<unknown>).set('order', 'Zz')
        writePage(doc, 'third', { name: 'Страница 3', order: 'a3' })
        writeCell(getCells(doc, 'third'), shapeData('fresh', 'a0'))
        writeCell(getCells(doc, 'third'), edgeData('link', 'a1', 'fresh', null))
      })

      const { pages } = diffDocuments(version, now)

      expect(pages.map((page) => [page.id, page.type, page.renamed, page.moved, summary(page.cells)])).toEqual([
        ['scheme', 'changed', true, true, []],
        ['third', 'added', false, false, [['added', 'fresh'], ['added', 'link']]],
        ['draft', 'removed', false, false, [['removed', 'sketch']]],
      ])
      expect(pages[0]!.before?.name).toBe('Схема')
      expect(pages[0]!.after?.name).toBe('Схема v2')
    })

    it('finds an empty page that was added', () => {
      const version = boardWith()
      const now = laterState(version, (doc) => writePage(doc, 'empty', { name: 'Страница 2', order: 'a1' }))

      expect(diffDocuments(version, now).pages.map((page) => [page.id, page.type, page.cells])).toEqual([['empty', 'added', []]])
    })
  })

  describe('keys that are not content', () => {
    it('takes no account of who changed a cell and when, wherever the keys are', () => {
      const version = boardWith(shapeData('a', 'a0', { value: 'API', style: { fillColor: '#ffffff' } }))
      const now = laterState(version, (doc) => {
        const target = cell(doc, 'a')
        target.set('modifiedBy', '0199a000-0000-7000-8000-0000000000b1')
        target.set('modifiedByName', 'Боб')
        target.set('modifiedAt', '2026-10-06T10:00:00Z')
        ;(target.get('style') as Y.Map<unknown>).set('modifiedAt', 1)
        writeAttrs(target, { modifiedBy: 'Боб' })
      })

      expect(diffDocuments(version, now)).toEqual({ pages: [] })
    })

    it('takes no account of who changed a cell as the editor keeps it', () => {
      const version = boardWith(shapeData('a', 'a0', { value: 'API' }))
      const now = laterState(version, (doc) =>
        writeAttribution(cell(doc, 'a'), { id: '0199a000-0000-7000-8000-0000000000b1', name: 'Боб' }, Date.now()),
      )

      expect(diffDocuments(version, now)).toEqual({ pages: [] })
    })

    it('still finds a change made together with them', () => {
      const version = boardWith(shapeData('a', 'a0', { value: 'API' }))
      const now = laterState(version, (doc) => {
        cell(doc, 'a').set('modifiedAt', '2026-10-06T10:00:00Z')
        cell(doc, 'a').set('value', 'Шлюз')
      })

      expect(changesOf(pageDiff(version, now), 'a')?.fields).toEqual(['value'])
    })

    it('takes no account of the schema version of the document', () => {
      const version = boardWith(shapeData('a', 'a0'))
      const now = laterState(version, (doc) => doc.getMap('meta').set('schemaVersion', 99))

      expect(diffDocuments(version, now)).toEqual({ pages: [] })
    })
  })

  it('finds changed custom properties and fields the model does not know', () => {
    const version = boardWith(shapeData('a', 'a0'))
    writeAttrs(cell(version, 'a'), { owner: 'Платежи' })
    const now = laterState(version, (doc) => {
      writeAttrs(cell(doc, 'a'), { owner: 'Заказы', team: 'core' })
      cell(doc, 'a').set('locked', true)
    })

    expect(changesOf(pageDiff(version, now), 'a')).toEqual({ fields: ['locked'], geometry: [], style: [], attrs: ['owner', 'team'] })
  })

  it('lists cells in the order of the page: parents before their children, siblings in their order', () => {
    const doc = boardWith(
      shapeData('second', 'a1'),
      shapeData('group', 'a0', { style: { group: true } }),
      shapeData('inner2', 'a1', { parent: 'group' }),
      shapeData('inner1', 'a0', { parent: 'group' }),
      shapeData('orphan', 'a2', { parent: 'missing' }),
    )

    expect(treeOrder(snapshotDocument(doc).get(DEFAULT_PAGE_ID)!.cells)).toEqual(['group', 'inner1', 'inner2', 'second', 'orphan'])
  })

  it('keeps cells whose parents make a loop', () => {
    const doc = boardWith(shapeData('a', 'a0', { parent: 'b' }), shapeData('b', 'a0', { parent: 'a' }), shapeData('top', 'a1'))

    expect(treeOrder(snapshotDocument(doc).get(DEFAULT_PAGE_ID)!.cells)).toEqual(['top', 'a', 'b'])
  })

  it('finds the heaviest increasing subsequence', () => {
    const indices = (places: number[], weights = places.map(() => 1)) => [...heaviestIncreasing(places, weights)].sort()

    expect(indices([])).toEqual([])
    expect(indices([0, 1, 2, 3])).toEqual([0, 1, 2, 3])
    expect(indices([0, 4, 1, 2, 3])).toEqual([0, 2, 3, 4])
    expect(indices([3, 2, 1, 0])).toHaveLength(1)
    expect(indices([1, 0], [1, 3])).toEqual([1])
    expect(indices([1, 0], [3, 1])).toEqual([0])
    expect(indices([2, 0, 1], [1, 1, 1])).toEqual([1, 2])
  })

  it('finds the page put before another, not the other one', () => {
    const version = boardWith()
    writePage(version, 'second', { name: 'Страница 2', order: 'a1' })
    const now = laterState(version, (doc) => (getPages(doc).get('second') as Y.Map<unknown>).set('order', 'Zz'))

    expect(diffDocuments(version, now).pages.map((page) => [page.id, page.moved])).toEqual([['second', true]])
  })

  it('compares boards of thousands of cells in well under a second', () => {
    const cells: CellData[] = []
    let order: string | null = null
    for (let index = 0; index < 5000; index++) {
      order = orderBetween(order, null)
      cells.push(shapeData(`cell-${index}`, order, { value: `Фигура ${index}`, style: { fillColor: '#ffffff', fontSize: 12 } }))
    }
    const version = boardWith(...cells)
    const now = laterState(version, (doc) => {
      for (let index = 0; index < 5000; index += 10) cell(doc, `cell-${index}`).set('value', `Изменена ${index}`)
    })

    const started = performance.now()
    const diff = diffSnapshots(snapshotDocument(version), snapshotDocument(now))
    const elapsed = performance.now() - started

    expect(diff.pages[0]!.cells).toHaveLength(500)
    expect(elapsed).toBeLessThan(1000)
  })
})
