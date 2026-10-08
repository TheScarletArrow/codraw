import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { readAttribution, writeAttribution } from './attribution.ts'
import { diffDocuments, snapshotDocument, snapshotPage, type CellSnapshot } from './diff.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { LOCKED_BY_KEY, LOCKED_KEY } from './locks.ts'
import { mergeConflicts, mergedSnapshot, mergeProposal, MERGE_ORIGIN } from './merge.ts'
import {
  DEFAULT_PAGE_ID,
  ELEMENT_KEY,
  getCells,
  getElements,
  initializeDocument,
  LAYER_CELL_ID,
  readAttrs,
  writeAttrs,
  writeCell,
  type CellData,
} from './model.ts'
import { addPage, deletePage, listPages, movePage, renamePage } from './pages.ts'
import { TABLE_FIELD_HEIGHT, TABLE_HEADER_HEIGHT } from './shapes.ts'
import { readStatus, writeStatus } from './status.ts'
import { boardWith, edgeData, laterState, shapeData } from './testing.ts'

const BOB = { id: 'bob', name: 'Боб' }
const ALICE = { id: 'alice', name: 'Алиса' }

/**
 * A proposal on a board: the base, the draft that `propose` changes and the board that `meanwhile` changes, each a
 * later state of the base. `accept` merges the draft into the board.
 */
function proposal(base: Y.Doc, propose: (draft: Y.Doc) => void, meanwhile: (board: Y.Doc) => void = () => {}) {
  const draft = laterState(base, propose)
  const board = laterState(base, meanwhile)
  return {
    base,
    draft,
    board,
    accept: () => mergeProposal(board, snapshotDocument(base), snapshotDocument(draft)),
  }
}

/** The cells of a page of a document. */
const cellsOf = (doc: Y.Doc, pageId = DEFAULT_PAGE_ID) => snapshotPage(doc, pageId)!.cells

const cellOf = (doc: Y.Doc, id: string, pageId = DEFAULT_PAGE_ID): CellSnapshot | undefined => cellsOf(doc, pageId).get(id)

/** Writes a change of a cell into a document, keeping its other fields. */
function change(doc: Y.Doc, id: string, changes: Partial<CellData>, pageId = DEFAULT_PAGE_ID) {
  const cell = cellOf(doc, id, pageId)!
  writeCell(getCells(doc, pageId), { ...cell, ...changes, style: changes.style ?? cell.style })
}

const remove = (doc: Y.Doc, ...ids: string[]) => ids.forEach((id) => getCells(doc).delete(id))

const shape = (id: string, changes: Partial<CellData> = {}) =>
  shapeData(id, `a${id}`, { value: id, geometry: { x: 10, y: 20, width: 120, height: 60 }, style: { fillColor: '#ffffff' }, ...changes })

/** The cells that a builder makes. */
function built(build: (builder: DiagramBuilder) => void): CellData[] {
  const builder = new DiagramBuilder()
  build(builder)
  return builder.build()
}

describe('mergeProposal', () => {
  describe('added elements', () => {
    it('come with their content and with who added them in the draft', () => {
      const { draft, board, accept } = proposal(boardWith(shape('api')), (draft) => {
        writeCell(getCells(draft), shape('queue', { value: 'Очередь', style: { fillColor: '#fff2cc' } }))
        writeAttrs(getCells(draft).get('queue')!, { owner: 'payments' })
        writeAttribution(getCells(draft).get('queue')!, BOB, 1000)
      })

      accept()

      expect(cellOf(board, 'queue')).toEqual(cellOf(draft, 'queue'))
      expect(readAttrs(getCells(board).get('queue')!)).toEqual({ owner: 'payments' })
      expect(readAttribution(getCells(board).get('queue')!)).toEqual({ by: 'bob', name: 'Боб', at: 1000 })
    })

    it('come with the elements inside them: a table with its fields', () => {
      let table = { id: '', fields: [] as string[] }
      const { draft, board, accept } = proposal(boardWith(shape('api')), (draft) => {
        built((builder) => (table = builder.table('orders', 0, 200, ['id uuid PK', 'total numeric']))).forEach((cell) =>
          writeCell(getCells(draft), cell),
        )
      })

      accept()

      for (const id of [table.id, ...table.fields]) expect(cellOf(board, id)).toEqual(cellOf(draft, id))
    })

    it('stand on the page where the draft has them when their parent is gone from the board', () => {
      const group = shape('group', { geometry: { x: 100, y: 200, width: 300, height: 300 } })
      const { board, accept } = proposal(
        boardWith(group),
        (draft) => writeCell(getCells(draft), shape('inner', { parent: 'group', geometry: { x: 10, y: 20, width: 50, height: 50 } })),
        (board) => remove(board, 'group'),
      )

      accept()

      expect(cellOf(board, 'inner')).toMatchObject({ parent: LAYER_CELL_ID, geometry: { x: 110, y: 220 } })
    })

    it('come as edges only when both of their ends are on the board, and a label of an edge only with its edge', () => {
      const { board, accept } = proposal(
        boardWith(shape('api'), shape('db'), shape('cache')),
        (draft) => {
          writeCell(getCells(draft), shape('queue'))
          writeCell(getCells(draft), edgeData('toDb', 'b0', 'api', 'db'))
          writeCell(getCells(draft), edgeData('toQueue', 'b1', 'api', 'queue'))
          writeCell(getCells(draft), edgeData('toCache', 'b2', 'api', 'cache'))
          writeCell(getCells(draft), shape('label', { parent: 'toCache', geometry: { x: 0, y: 0, width: 10, height: 10, relative: true } }))
        },
        (board) => remove(board, 'cache'),
      )

      accept()

      expect([...cellsOf(board).keys()].sort()).toEqual(['api', 'db', 'queue', 'toDb', 'toQueue'])
    })
  })

  describe('removed elements', () => {
    it('go from the board with the elements inside them, those the board added too, and the edges to them', () => {
      const { board, accept } = proposal(
        boardWith(shape('group'), shape('inner', { parent: 'group' }), shape('api'), edgeData('call', 'b0', 'api', 'inner')),
        (draft) => remove(draft, 'group', 'inner', 'call'),
        (board) => {
          writeCell(getCells(board), shape('added', { parent: 'group' }))
          writeCell(getCells(board), edgeData('another', 'b1', 'added', 'api'))
        },
      )

      accept()

      expect([...cellsOf(board).keys()]).toEqual(['api'])
    })

    it('leave the board as it is when it has removed them already', () => {
      const { board, accept } = proposal(
        boardWith(shape('api'), shape('db')),
        (draft) => remove(draft, 'db'),
        (board) => remove(board, 'db'),
      )

      accept()

      expect([...cellsOf(board).keys()]).toEqual(['api'])
    })
  })

  describe('changed elements', () => {
    it('get exactly what the draft changed and keep what the board changed in other keys', () => {
      const { board, accept } = proposal(
        boardWith(shape('api', { style: { fillColor: '#ffffff', fontSize: 12 } })),
        (draft) => change(draft, 'api', { value: 'Шлюз', geometry: { x: 300, y: 20, width: 120, height: 60 } }),
        (board) => change(board, 'api', { style: { fillColor: '#ff0000', fontSize: 12 }, geometry: { x: 10, y: 20, width: 200, height: 60 } }),
      )

      accept()

      expect(cellOf(board, 'api')).toMatchObject({
        value: 'Шлюз',
        style: { fillColor: '#ff0000', fontSize: 12 },
        geometry: { x: 300, y: 20, width: 200, height: 60 },
      })
    })

    it('get the status the draft set, with who set it, and keep the statuses the draft left', () => {
      const base = boardWith(shape('api'), shape('db'))
      const { board, accept } = proposal(
        base,
        (draft) => draft.transact(() => writeStatus(getCells(draft).get('api')!, 'done', BOB, 1000)),
        (board) => board.transact(() => writeStatus(getCells(board).get('db')!, 'review', ALICE, 2000)),
      )

      accept()

      expect(readStatus(getCells(board).get('api'))).toEqual({ status: 'done', by: 'bob', name: 'Боб', at: 1000 })
      expect(readStatus(getCells(board).get('db'))).toEqual({ status: 'review', by: 'alice', name: 'Алиса', at: 2000 })
    })

    it('take the key of the draft where both changed it', () => {
      const { board, accept } = proposal(
        boardWith(shape('api')),
        (draft) => change(draft, 'api', { value: 'Шлюз', style: { fillColor: '#00ff00' } }),
        (board) => change(board, 'api', { value: 'API v2', style: { fillColor: '#ff0000' } }),
      )

      accept()

      expect(cellOf(board, 'api')).toMatchObject({ value: 'Шлюз', style: { fillColor: '#00ff00' } })
    })

    it('lose the keys of style and the properties that the draft removed, and get those it added', () => {
      const { board, accept } = proposal(
        boardWith(shape('api', { style: { fillColor: '#ffffff', dashed: true } })),
        (draft) => {
          change(draft, 'api', { style: { fillColor: '#ffffff', rounded: true } })
          writeAttrs(getCells(draft).get('api')!, { owner: 'payments' })
          getCells(draft).get('api')!.set('futureField', { level: 2 })
        },
        (board) => writeAttrs(getCells(board).get('api')!, { team: 'core' }),
      )

      accept()

      expect(cellOf(board, 'api')).toMatchObject({
        style: { fillColor: '#ffffff', rounded: true },
        attrs: { owner: 'payments', team: 'core' },
        extra: { futureField: { level: 2 } },
      })
      expect(cellOf(board, 'api')!.style).not.toHaveProperty('dashed')
    })

    it('come back as the draft has them when the board removed them meanwhile, with their edges', () => {
      const { draft, board, accept } = proposal(
        boardWith(shape('api'), shape('db'), edgeData('call', 'b0', 'api', 'db')),
        (draft) => change(draft, 'db', { value: 'PostgreSQL' }),
        (board) => remove(board, 'db', 'call'),
      )

      accept()

      expect(cellOf(board, 'db')).toEqual(cellOf(draft, 'db'))
      expect(cellOf(board, 'call')).toEqual(cellOf(draft, 'call'))
    })

    it('go into a group that the draft added, and onto the page when their new parent is gone from the board', () => {
      const { board, accept } = proposal(
        boardWith(shape('api'), shape('db'), shape('frame', { geometry: { x: 500, y: 500, width: 400, height: 400 } })),
        (draft) => {
          writeCell(getCells(draft), shape('group', { geometry: { x: 0, y: 0, width: 300, height: 100 } }))
          change(draft, 'api', { parent: 'group', geometry: { x: 10, y: 20, width: 120, height: 60 } })
          change(draft, 'db', { parent: 'frame', geometry: { x: 5, y: 5, width: 120, height: 60 } })
        },
        (board) => remove(board, 'frame'),
      )

      accept()

      expect(cellOf(board, 'api')).toMatchObject({ parent: 'group' })
      expect(cellOf(board, 'db')).toMatchObject({ parent: LAYER_CELL_ID, geometry: { x: 505, y: 505 } })
    })

    it('keep the end of an edge that the board has when their new end is gone from the board', () => {
      const { board, accept } = proposal(
        boardWith(shape('api'), shape('db'), shape('cache'), edgeData('call', 'b0', 'api', 'db')),
        (draft) => change(draft, 'call', { target: 'cache', value: 'кэш' }),
        (board) => remove(board, 'cache'),
      )

      accept()

      expect(cellOf(board, 'call')).toMatchObject({ source: 'api', target: 'db', value: 'кэш' })
    })

    it('keep who changed them in the draft, and the others who changed them on the board', () => {
      const { board, accept } = proposal(
        boardWith(shape('api'), shape('db')),
        (draft) => {
          change(draft, 'api', { value: 'Шлюз' })
          writeAttribution(getCells(draft).get('api')!, BOB, 2000)
        },
        (board) => writeAttribution(getCells(board).get('db')!, ALICE, 3000),
      )

      accept()

      expect(readAttribution(getCells(board).get('api')!)).toEqual({ by: 'bob', name: 'Боб', at: 2000 })
      expect(readAttribution(getCells(board).get('db')!)).toEqual({ by: 'alice', name: 'Алиса', at: 3000 })
    })

    it('change locked elements of the board too, which stay locked unless the draft unlocked them', () => {
      const { board, accept } = proposal(
        boardWith(shape('api'), shape('db', { style: { [LOCKED_KEY]: true, [LOCKED_BY_KEY]: 'Алиса' } })),
        (draft) => {
          change(draft, 'api', { value: 'Шлюз' })
          change(draft, 'db', { value: 'PostgreSQL', style: {} })
        },
        (board) => change(board, 'api', { style: { fillColor: '#ffffff', [LOCKED_KEY]: true, [LOCKED_BY_KEY]: 'Алиса' } }),
      )

      accept()

      expect(cellOf(board, 'api')).toMatchObject({ value: 'Шлюз', style: { [LOCKED_KEY]: true } })
      expect(cellOf(board, 'db')!.value).toBe('PostgreSQL')
      expect(cellOf(board, 'db')!.style).not.toHaveProperty(LOCKED_KEY)
    })

    it('get the place among their siblings that the draft gave them', () => {
      const { board, accept } = proposal(
        boardWith(shape('a', { order: 'a0' }), shape('b', { order: 'a1' }), shape('c', { order: 'a2' })),
        (draft) => change(draft, 'a', { order: 'a3' }),
      )

      accept()

      const order = [...cellsOf(board).values()].sort((x, y) => (x.order < y.order ? -1 : 1)).map((cell) => cell.id)
      expect(order).toEqual(['b', 'c', 'a'])
    })
  })

  describe('tables', () => {
    const editors: DiagramEditor[] = []
    afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

    /** What the editor makes of the rows of a table when it opens the page: their places and the height of the table. */
    function laidOut(doc: Y.Doc, tableId: string) {
      const container = document.createElement('div')
      document.body.append(container)
      const editor = createDiagramEditor(container, doc, { readOnly: true })
      editors.push(editor)
      const table = editor.graph.getDataModel().getCell(tableId)!
      return {
        height: table.getGeometry()!.height,
        rows: table.getChildren().map((row) => ({ id: row.getId(), y: row.getGeometry()!.y, height: row.getGeometry()!.height })),
      }
    }

    function stored(doc: Y.Doc, tableId: string) {
      const cells = cellsOf(doc)
      const rows = [...cells.values()]
        .filter((cell) => cell.parent === tableId)
        .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : 1))
      return {
        height: cells.get(tableId)!.geometry!.height,
        rows: rows.map((row) => ({ id: row.id, y: row.geometry!.y, height: row.geometry!.height })),
      }
    }

    it('stack the fields that the draft and the board added to one table, as the editor lays them out', () => {
      let table = { id: '', fields: [] as string[] }
      const base = boardWith(...built((builder) => (table = builder.table('orders', 0, 0, ['id uuid PK']))))
      const field = (doc: Y.Doc, id: string, order: string, value: string) =>
        writeCell(getCells(doc), {
          ...cellOf(doc, table.fields[0]!)!,
          id,
          order,
          value,
          geometry: { x: 0, y: TABLE_HEADER_HEIGHT + TABLE_FIELD_HEIGHT, width: 220, height: TABLE_FIELD_HEIGHT },
        })
      const { board, accept } = proposal(
        base,
        (draft) => field(draft, 'total', 'b2', 'total numeric'),
        (board) => field(board, 'created', 'b1', 'created_at timestamptz'),
      )

      accept()

      const merged = stored(board, table.id)
      expect(merged.rows.map((row) => row.y)).toEqual([30, 56, 82])
      expect(merged.height).toBe(TABLE_HEADER_HEIGHT + 3 * TABLE_FIELD_HEIGHT)
      expect(laidOut(board, table.id)).toEqual(merged)
    })

    it('take the height of a row whose text the draft made larger, and leave a table nobody changed as it is', () => {
      let orders = { id: '', fields: [] as string[] }
      let users = { id: '', fields: [] as string[] }
      const base = boardWith(
        ...built((builder) => {
          orders = builder.table('orders', 0, 0, ['id uuid PK', 'total numeric'], 220, ['orders_total_idx (total)'])
          users = builder.table('users', 400, 0, ['id uuid PK'])
        }),
      )
      const { board, accept } = proposal(base, (draft) => {
        const cell = cellOf(draft, orders.fields[0]!)!
        change(draft, orders.fields[0]!, { style: { ...cell.style, fontSize: 20 }, geometry: { ...cell.geometry!, height: 40 } })
      })
      const untouched = stored(board, users.id)

      accept()

      expect(stored(board, orders.id).rows.map((row) => [row.y, row.height])).toEqual([
        [30, 40],
        [70, 26],
        [116, 26],
      ])
      expect(laidOut(board, orders.id)).toEqual(stored(board, orders.id))
      expect(stored(board, users.id)).toEqual(untouched)
    })
  })

  describe('pages', () => {
    it('come with their elements when the draft added them', () => {
      let page = ''
      const { draft, board, accept } = proposal(boardWith(shape('api')), (draft) => {
        page = addPage(draft, undefined, 'API')
        writeCell(getCells(draft, page), shape('gateway'))
      })

      accept()

      expect(listPages(board).map((item) => item.name)).toEqual(['Страница 1', 'API'])
      expect(snapshotPage(board, page)).toEqual(snapshotPage(draft, page))
    })

    it('go when the draft removed them, but the last page of the board stays', () => {
      const base = boardWith(shape('api'))
      const second = addPage(base, undefined, 'Черновик')
      const removed = proposal(base, (draft) => deletePage(draft, second))
      removed.accept()
      expect(listPages(removed.board).map((page) => page.name)).toEqual(['Страница 1'])

      const last = proposal(
        base,
        (draft) => deletePage(draft, DEFAULT_PAGE_ID),
        (board) => deletePage(board, second),
      )
      last.accept()
      expect(listPages(last.board).map((page) => page.name)).toEqual(['Страница 1'])
    })

    it('get the name and the place that the draft gave them, the draft winning', () => {
      const base = boardWith(shape('api'))
      const second = addPage(base, undefined, 'Схема')
      const { board, accept } = proposal(
        base,
        (draft) => {
          renamePage(draft, second, 'Схема БД')
          movePage(draft, second, 0)
        },
        (board) => renamePage(board, second, 'Схема v2'),
      )

      accept()

      expect(listPages(board).map((page) => page.name)).toEqual(['Схема БД', 'Страница 1'])
    })

    it('come back as the draft has them when the draft changed them and the board removed them', () => {
      const base = boardWith(shape('api'))
      const second = addPage(base, undefined, 'Схема')
      writeCell(getCells(base, second), shape('db'))
      const { draft, board, accept } = proposal(
        base,
        (draft) => change(draft, 'db', { value: 'PostgreSQL' }, second),
        (board) => deletePage(board, second),
      )

      accept()

      expect(snapshotPage(board, second)).toEqual(snapshotPage(draft, second))
    })

    it('stay as the board has them when the draft did not change them', () => {
      const base = boardWith(shape('api'))
      const second = addPage(base, undefined, 'Схема')
      const { board, accept } = proposal(
        base,
        (draft) => change(draft, 'api', { value: 'Шлюз' }),
        (board) => {
          writeCell(getCells(board, second), shape('db'))
          renamePage(board, second, 'Схема v2')
        },
      )
      const before = snapshotPage(board, second)

      accept()

      expect(snapshotPage(board, second)).toEqual(before)
    })
  })

  it('changes the board in one transaction that no undo history tracks', () => {
    const { board, accept } = proposal(boardWith(shape('api')), (draft) => {
      writeCell(getCells(draft), shape('db'))
      addPage(draft, undefined, 'API')
    })
    const origins: unknown[] = []
    board.on('afterTransaction', (transaction: Y.Transaction) => origins.push(transaction.origin))

    accept()

    expect(origins).toEqual([MERGE_ORIGIN])
  })

  it('leaves the board as it is for an unchanged draft', () => {
    const { board, accept } = proposal(boardWith(shape('api')), () => {}, (board) => change(board, 'api', { value: 'Шлюз' }))
    const before = Y.encodeStateVector(board)

    accept()

    expect(Y.encodeStateVector(board)).toEqual(before)
  })
})

describe('mergeProposal of elements', () => {
  const element = (properties: Record<string, string>) => ({ fillColor: '#ffffff', [ELEMENT_KEY]: 'e1', codrawName: 'API', ...properties })

  it('merges the properties of an element key by key', () => {
    const { board, accept } = proposal(
      boardWith(shape('api', { style: element({ codrawTechnology: 'Java' }) })),
      (draft) => change(draft, 'api', { style: element({ codrawTechnology: 'Kotlin' }) }),
      (live) => change(live, 'api', { style: element({ codrawTechnology: 'Java', codrawOwner: 'Заказы' }) }),
    )

    accept()

    expect(getElements(board).get('e1')!.toJSON()).toEqual({ name: 'API', technology: 'Kotlin', owner: 'Заказы' })
    expect(cellOf(board, 'api')!.style).toEqual(element({ codrawTechnology: 'Kotlin', codrawOwner: 'Заказы' }))
  })

  it('removes the element with the last cell the draft removed', () => {
    const { board, accept } = proposal(boardWith(shape('api', { style: element({}) }), shape('db')), (draft) => remove(draft, 'api'))

    accept()

    expect(getElements(board).size).toBe(0)
  })

  it('brings back an element the board removed with a cell the draft changed', () => {
    const { board, accept } = proposal(
      boardWith(shape('api', { style: element({ codrawTechnology: 'Java' }) })),
      (draft) => change(draft, 'api', { style: element({ codrawTechnology: 'Kotlin' }) }),
      (live) => {
        remove(live, 'api')
        getElements(live).delete('e1')
      },
    )

    accept()

    expect(getElements(board).get('e1')!.toJSON()).toEqual({ name: 'API', technology: 'Kotlin' })
  })
})

describe('mergedSnapshot', () => {
  it('is the board as accepting would make it, and leaves the board as it is', () => {
    const { base, draft, board } = proposal(
      boardWith(shape('api'), shape('db')),
      (draft) => {
        writeCell(getCells(draft), shape('queue', { value: 'Очередь' }))
        change(draft, 'db', { value: 'PostgreSQL' })
      },
      (board) => change(board, 'api', { value: 'Шлюз' }),
    )
    const before = Y.encodeStateAsUpdate(board)

    const merged = mergedSnapshot(board, snapshotDocument(base), snapshotDocument(draft))

    const values = Object.fromEntries([...merged.get(DEFAULT_PAGE_ID)!.cells.values()].map((cell) => [cell.id, cell.value]))
    expect(values).toEqual({ api: 'Шлюз', db: 'PostgreSQL', queue: 'Очередь' })
    expect(Y.encodeStateAsUpdate(board)).toEqual(before)
  })
})

describe('mergeConflicts', () => {
  it('names the elements that both the draft and the board changed since the base, and no others', () => {
    const base = boardWith(shape('api'), shape('db'), shape('cache'), shape('queue'))
    const draft = laterState(base, (draft) => {
      change(draft, 'api', { value: 'Шлюз' })
      change(draft, 'db', { value: 'PostgreSQL' })
      remove(draft, 'queue')
      writeCell(getCells(draft), shape('new'))
    })
    const board = laterState(base, (board) => {
      change(board, 'api', { style: { fillColor: '#ff0000' } })
      change(board, 'cache', { value: 'Redis' })
      change(board, 'queue', { value: 'Kafka' })
    })

    const conflicts = mergeConflicts(diffDocuments(base, draft), diffDocuments(base, board))

    expect(conflicts.cells).toEqual(new Map([[DEFAULT_PAGE_ID, new Set(['api', 'queue'])]]))
    expect(conflicts.pages).toEqual(new Set())
  })

  it('names the pages that one side removed and the other changed, and those both renamed or both moved', () => {
    const base = boardWith(shape('api'))
    const [removed, renamed, kept] = ['Удалённая', 'Переименованная', 'Своя'].map((name) => addPage(base, undefined, name))
    writeCell(getCells(base, removed!), shape('db'))
    const draft = laterState(base, (draft) => {
      deletePage(draft, removed!)
      renamePage(draft, renamed!, 'Новое имя')
      renamePage(draft, kept!, 'Тоже новое')
    })
    const board = laterState(base, (board) => {
      change(board, 'db', { value: 'PostgreSQL' }, removed!)
      renamePage(board, renamed!, 'Другое имя')
      writeCell(getCells(board, kept!), shape('extra'))
    })

    const conflicts = mergeConflicts(diffDocuments(base, draft), diffDocuments(base, board))

    expect(conflicts.pages).toEqual(new Set([removed, renamed]))
    expect(conflicts.cells).toEqual(new Map([[removed, new Set(['db'])]]))
  })
})

describe('accepting a proposal with an element on several pages', () => {
  it('relabels the cells of an element on pages the draft did not change', () => {
    const base = new Y.Doc()
    initializeDocument(base)
    const second = addPage(base, DEFAULT_PAGE_ID)
    const payments = { codrawShape: 'c4-container', [ELEMENT_KEY]: 'e1', codrawName: 'Payments', codrawKind: 'c4-container' }
    base.transact(() => {
      writeCell(getCells(base), shapeData('a', 'a0', { value: 'Payments\n[Container]', style: payments }))
      writeCell(getCells(base, second), shapeData('b', 'a0', { value: 'Payments\n[Container]', style: payments }))
    })
    const { board, accept } = proposal(base, (draft) => {
      change(draft, 'a', { value: 'Billing\n[Container]', style: { ...payments, codrawName: 'Billing' } })
    })

    accept()

    expect(getElements(board).get('e1')!.get('name')).toBe('Billing')
    expect(getCells(board, second).get('b')!.get('value')).toBe('Billing\n[Container]')
  })
})
