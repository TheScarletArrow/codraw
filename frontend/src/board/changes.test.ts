import type { CellStyle } from '@maxgraph/core'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { fromStyle } from '../diagram/binding.ts'
import { diffDocuments, snapshotDocument, type PageDiff } from '../diagram/diff.ts'
import { LOCKED_BY_KEY, LOCKED_KEY } from '../diagram/locks.ts'
import { DEFAULT_PAGE_ID, getCells, writeCell, type CellData } from '../diagram/model.ts'
import { TABLE_FIELD_STYLE, TABLE_INDEX_KEY, TABLE_STYLE, type ShapeStyle } from '../diagram/shapes.ts'
import { writeStatus } from '../diagram/status.ts'
import { boardWith, edgeData, laterState, shapeData } from '../diagram/testing.ts'
import { absoluteBounds, changeItems, edgeLine, ghostCenter, lineMiddle } from './changes.ts'

const stored = (style: ShapeStyle) => fromStyle(style as CellStyle)

const cell = (doc: Y.Doc, id: string) => getCells(doc).get(id)!

const firstPage = (before: Y.Doc, after: Y.Doc): PageDiff => diffDocuments(before, after).pages[0]!

const cellsOf = (doc: Y.Doc) => snapshotDocument(doc).get(DEFAULT_PAGE_ID)!.cells

function table(id: string, order: string, value: string, fields: string[]): CellData[] {
  return [
    shapeData(id, order, { value, style: stored(TABLE_STYLE), geometry: { x: 100, y: 100, width: 200, height: 30 + 26 * fields.length } }),
    ...fields.map((field, index) =>
      shapeData(`${id}.${index}`, `a${index}`, {
        parent: id,
        value: field,
        style: stored(TABLE_FIELD_STYLE),
        geometry: { x: 0, y: 30 + 26 * index, width: 200, height: 26 },
      }),
    ),
  ]
}

describe('items of the list of changes', () => {
  it('names an element by its label, or by its kind when it has none', () => {
    const version = boardWith(shapeData('a', 'a0'), shapeData('b', 'a1'))
    const now = laterState(version, (doc) => {
      writeCell(getCells(doc), shapeData('service', 'a2', { value: 'Сервис\nзаказов', style: { rounded: true, codrawShape: 'service' } }))
      writeCell(getCells(doc), shapeData('plain', 'a3'))
      writeCell(getCells(doc), edgeData('link', 'a4', 'a', 'b'))
      table('users', 'a5', 'users', ['id uuid PK']).forEach((data) => writeCell(getCells(doc), data))
      writeCell(getCells(doc), shapeData('group', 'a6', { style: { fillColor: 'none', strokeColor: 'none' } }))
      writeCell(getCells(doc), shapeData('inside', 'a0', { parent: 'group' }))
      writeCell(getCells(doc), shapeData('empty', 'a7', { style: { fillColor: 'none', strokeColor: 'none' } }))
    })

    expect(changeItems(firstPage(version, now)).map(({ title, kind, nested }) => [title, kind, nested])).toEqual([
      ['Сервис', 'Сервис', 0],
      ['Прямоугольник', 'Прямоугольник', 0],
      ['Связь', 'Связь', 0],
      ['users', 'Таблица', 1],
      ['Группа', 'Группа', 1],
      // Without children it is no group, and no shape of the palette either.
      ['Фигура', 'Фигура', 0],
    ])
  })

  it('says what changed in a shape, each word once, and what its label was', () => {
    const version = boardWith(shapeData('a', 'a0', { value: 'API', style: { fillColor: '#ffffff', strokeColor: '#000000' } }))
    const now = laterState(version, (doc) => {
      const target = cell(doc, 'a')
      target.set('value', 'Шлюз')
      target.set('geometry', { x: 40, y: 0, width: 160, height: 60 })
      const style = target.get('style') as Y.Map<unknown>
      style.set('fillColor', '#dae8fc')
      style.set('gradientColor', '#ffffff')
      style.set('strokeColor', '#6c8ebf')
      style.set('fontSize', 16)
      style.set('somethingElse', 1)
    })

    expect(changeItems(firstPage(version, now))).toEqual([
      {
        id: 'a',
        type: 'changed',
        title: 'Шлюз',
        kind: 'Прямоугольник',
        details: ['подпись', 'положение', 'размер', 'заливка', 'цвет линии', 'размер текста', 'стиль'],
        previousTitle: 'API',
        nested: 0,
        conflict: false,
      },
    ])
  })

  it('says that an element was locked or unlocked', () => {
    const version = boardWith(
      shapeData('a', 'a0', { value: 'API', style: { fillColor: '#ffffff' } }),
      shapeData('b', 'a1', { value: 'БД', style: { fillColor: '#ffffff', [LOCKED_KEY]: true, [LOCKED_BY_KEY]: 'Аня' } }),
    )
    const now = laterState(version, (doc) => {
      const locked = cell(doc, 'a').get('style') as Y.Map<unknown>
      locked.set(LOCKED_KEY, true)
      locked.set(LOCKED_BY_KEY, 'Боб')
      const unlocked = cell(doc, 'b').get('style') as Y.Map<unknown>
      unlocked.delete(LOCKED_KEY)
      unlocked.delete(LOCKED_BY_KEY)
    })

    expect(changeItems(firstPage(version, now)).map(({ title, details }) => [title, details])).toEqual([
      ['API', ['закрепление']],
      ['БД', ['закрепление']],
    ])
  })

  it('says that the link of an element was set, changed or removed', () => {
    const version = boardWith(
      shapeData('a', 'a0', { value: 'API' }),
      shapeData('b', 'a1', { value: 'БД', style: { link: 'data:page/id,db' } }),
      shapeData('c', 'a2', { value: 'Кэш', style: { link: 'https://docs.example.com' } }),
    )
    const now = laterState(version, (doc) => {
      ;(cell(doc, 'a').get('style') as Y.Map<unknown>).set('link', 'data:page/id,api')
      ;(cell(doc, 'b').get('style') as Y.Map<unknown>).set('link', 'https://docs.example.com/db')
      ;(cell(doc, 'c').get('style') as Y.Map<unknown>).delete('link')
    })

    expect(changeItems(firstPage(version, now)).map(({ title, details }) => [title, details])).toEqual([
      ['API', ['ссылка']],
      ['БД', ['ссылка']],
      ['Кэш', ['ссылка']],
    ])
  })

  it('says the status an element got, or that its status was taken off, once', () => {
    const version = boardWith(shapeData('a', 'a0', { value: 'API' }), shapeData('b', 'a1', { value: 'БД' }))
    const alice = { id: 'alice', name: 'Алиса' }
    const bob = { id: 'bob', name: 'Боб' }
    version.transact(() => writeStatus(cell(version, 'b'), 'review', alice, 1000))
    const now = laterState(version, (doc) => {
      writeStatus(cell(doc, 'a'), 'done', bob, 2000)
      writeStatus(cell(doc, 'b'), null, bob, 2000)
    })
    const remarked = laterState(version, (doc) => writeStatus(cell(doc, 'b'), 'draft', bob, 2000))

    expect(changeItems(firstPage(version, now)).map(({ title, details }) => [title, details])).toEqual([
      ['API', ['статус «Готово»']],
      ['БД', ['статус снят']],
    ])
    expect(changeItems(firstPage(version, remarked)).map(({ details }) => details)).toEqual([['статус «Черновик»']])
  })

  it('says what changed in a table, a field, an index and an edge in their words', () => {
    const version = boardWith(
      ...table('users', 'a0', 'users', ['id uuid PK', 'email text']),
      shapeData('users.idx', 'a5', { parent: 'users', value: 'users_email_idx (email)', style: { ...stored(TABLE_FIELD_STYLE), [TABLE_INDEX_KEY]: true } }),
      ...table('orders', 'a1', 'orders', ['user_id uuid']),
      edgeData('fk', 'a2', 'orders.0', 'users.0'),
    )
    const now = laterState(version, (doc) => {
      cell(doc, 'users').set('value', 'accounts')
      cell(doc, 'users.1').set('value', 'email text NOT NULL')
      cell(doc, 'users.idx').set('value', 'users_email_idx (email) UNIQUE')
      cell(doc, 'fk').set('target', 'users.1')
      ;(cell(doc, 'fk').get('style') as Y.Map<unknown>).set('endArrow', 'ERmandOne')
    })

    expect(changeItems(firstPage(version, now)).map(({ title, kind, details }) => [title, kind, details])).toEqual([
      ['accounts', 'Таблица', ['название']],
      ['email text NOT NULL', 'Поле', ['текст']],
      ['users_email_idx (email) UNIQUE', 'Индекс', ['текст']],
      ['Связь', 'Связь', ['конец', 'маркеры']],
    ])
  })

  it('names a removed element as the version had it', () => {
    const version = boardWith(shapeData('cache', 'a0', { value: 'Кэш', style: { shape: 'cylinder', codrawShape: 'cache' } }))
    const now = laterState(version, (doc) => getCells(doc).delete('cache'))

    expect(changeItems(firstPage(version, now))).toEqual([
      { id: 'cache', type: 'removed', title: 'Кэш', kind: 'Кэш', details: [], previousTitle: null, nested: 0, conflict: false },
    ])
  })

  it('marks the items whose element, or an element nested in them, is among the conflicts', () => {
    const version = boardWith(shapeData('api', 'a0', { value: 'API' }), shapeData('db', 'a1', { value: 'БД' }))
    const now = laterState(version, (doc) => {
      cell(doc, 'api').set('value', 'Шлюз')
      cell(doc, 'db').set('value', 'PostgreSQL')
      writeCell(getCells(doc), shapeData('group', 'a2', { value: 'Группа' }))
      writeCell(getCells(doc), shapeData('inner', 'a0', { parent: 'group', value: 'Внутри' }))
    })

    const items = changeItems(firstPage(version, now), new Set(['db', 'inner']))

    expect(items.map(({ title, conflict }) => [title, conflict])).toEqual([
      ['Группа', true],
      ['Шлюз', false],
      ['PostgreSQL', true],
    ])
  })
})

describe('where removed elements were', () => {
  it('places a shape inside groups and tables on the page', () => {
    const doc = boardWith(
      shapeData('group', 'a0', { geometry: { x: 100, y: 50, width: 300, height: 200 } }),
      shapeData('inner', 'a0', { parent: 'group', geometry: { x: 20, y: 30, width: 100, height: 100 } }),
      shapeData('deep', 'a0', { parent: 'inner', geometry: { x: 5, y: 5, width: 10, height: 10 } }),
      edgeData('edge', 'a1', 'group', 'inner'),
      shapeData('label', 'a0', { parent: 'edge', geometry: { x: 0, y: 0, width: 10, height: 10, relative: true } }),
    )
    const cells = cellsOf(doc)

    expect(absoluteBounds(cells, 'group')).toEqual({ x: 100, y: 50, width: 300, height: 200 })
    expect(absoluteBounds(cells, 'deep')).toEqual({ x: 125, y: 85, width: 10, height: 10 })
    expect(absoluteBounds(cells, 'edge')).toBeNull()
    expect(absoluteBounds(cells, 'label')).toBeNull()
    expect(absoluteBounds(cells, 'missing')).toBeNull()
  })

  it('gives up on a loop of parents', () => {
    const doc = boardWith(shapeData('a', 'a0', { parent: 'b' }), shapeData('b', 'a0', { parent: 'a' }))

    expect(absoluteBounds(cellsOf(doc), 'a')).toBeNull()
  })

  it('draws an edge from the border of its source through its bends to the border of its target', () => {
    const doc = boardWith(
      shapeData('a', 'a0', { geometry: { x: 0, y: 0, width: 100, height: 100 } }),
      shapeData('b', 'a1', { geometry: { x: 300, y: 0, width: 100, height: 100 } }),
      edgeData('straight', 'a2', 'a', 'b'),
      edgeData('bent', 'a3', 'a', 'b', { geometry: { x: 0, y: 0, width: 0, height: 0, relative: true, points: [{ x: 50, y: 200 }, { x: 350, y: 200 }] } }),
      edgeData('loose', 'a4', 'a', null, { geometry: { x: 0, y: 0, width: 0, height: 0, relative: true, targetPoint: { x: 50, y: 400 } } }),
      edgeData('dangling', 'a5', 'a', null),
    )
    const cells = cellsOf(doc)

    expect(edgeLine(cells, 'straight')).toEqual([
      { x: 100, y: 50 },
      { x: 300, y: 50 },
    ])
    expect(edgeLine(cells, 'bent')).toEqual([
      { x: 50, y: 100 },
      { x: 50, y: 200 },
      { x: 350, y: 200 },
      { x: 350, y: 100 },
    ])
    expect(edgeLine(cells, 'loose')).toEqual([
      { x: 50, y: 100 },
      { x: 50, y: 400 },
    ])
    expect(edgeLine(cells, 'dangling')).toBeNull()
    expect(edgeLine(cells, 'a')).toBeNull()
  })

  it('finds the middle of a line by its length, and the middle of a removed element', () => {
    expect(lineMiddle([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 300, y: 100 }])).toEqual({ x: 100, y: 100 })
    expect(lineMiddle([{ x: 5, y: 5 }, { x: 5, y: 5 }])).toEqual({ x: 5, y: 5 })

    const doc = boardWith(
      shapeData('a', 'a0', { geometry: { x: 0, y: 0, width: 100, height: 100 } }),
      shapeData('b', 'a1', { geometry: { x: 300, y: 0, width: 100, height: 100 } }),
      edgeData('ab', 'a2', 'a', 'b'),
    )
    expect(ghostCenter(cellsOf(doc), 'a')).toEqual({ x: 50, y: 50 })
    expect(ghostCenter(cellsOf(doc), 'ab')).toEqual({ x: 200, y: 50 })
  })
})
