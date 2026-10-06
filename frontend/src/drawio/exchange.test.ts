import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { readAttribution, writeAttribution } from '../diagram/attribution.ts'
import {
  DEFAULT_PAGE_ID,
  getCells,
  initializeDocument,
  LAYER_CELL_ID,
  orderBetween,
  readAttrs,
  readCell,
  ROOT_CELL_ID,
  writeAttrs,
  writeCell,
  type CellData,
} from '../diagram/model.ts'
import { addPage, listPages, renamePage } from '../diagram/pages.ts'
import { SAMPLE_DRAWIO } from './fixtures.ts'
import { IMPORT_ORIGIN, importPages } from './importPages.ts'
import { parseDrawio } from './parse.ts'
import { exportDrawio } from './serialize.ts'

function board() {
  const doc = new Y.Doc()
  initializeDocument(doc)
  return doc
}

const cell = (id: string, overrides: Partial<CellData> = {}): CellData => ({
  id,
  kind: 'vertex',
  parent: LAYER_CELL_ID,
  order: orderBetween(null, null),
  value: id,
  geometry: { x: 10, y: 20, width: 120, height: 60 },
  source: null,
  target: null,
  style: {},
  ...overrides,
})

/** The cells of a page with their custom properties, by id. */
function pageCells(doc: Y.Doc, pageId: string) {
  return Object.fromEntries(
    Array.from(getCells(doc, pageId).entries())
      .filter(([id]) => id !== ROOT_CELL_ID && id !== LAYER_CELL_ID)
      .map(([id, map]) => [id, { ...readCell(id, map), attrs: readAttrs(map) }]),
  )
}

/**
 * A board with two pages: shapes, an edge with a label and markers, a table with a field and an index, and custom
 * properties.
 */
function sampleBoard() {
  const doc = board()
  renamePage(doc, DEFAULT_PAGE_ID, 'Контекст')
  const second = addPage(doc, DEFAULT_PAGE_ID, 'Схема БД')
  doc.transact(() => {
    const first = getCells(doc)
    writeCell(first, cell('client', { value: 'Клиент\nвеб', style: { rounded: true, fillColor: '#dae8fc' }, order: 'a0' }))
    writeCell(first, cell('api', { value: 'API <v1> & "beta"', geometry: { x: 300, y: 20, width: 120, height: 60 }, order: 'a1' }))
    writeCell(
      first,
      cell('edge', {
        kind: 'edge',
        value: 'HTTPS',
        source: 'client',
        target: 'api',
        geometry: { x: 0, y: 0, width: 0, height: 0, relative: true, points: [{ x: 200, y: 50 }] },
        style: { endArrow: 'ERmany', startArrow: 'ERmandOne' },
        order: 'a2',
      }),
    )
    writeAttrs(first.get('api')!, { tooltip: 'Шлюз', link: 'https://example.com' })
    const tables = getCells(doc, second)
    writeCell(tables, cell('table', { value: 'users', style: { shape: 'swimlane', startSize: 30, childLayout: 'stackLayout', foldable: false } }))
    writeCell(tables, cell('field', { parent: 'table', value: 'id uuid PK', geometry: { x: 0, y: 30, width: 120, height: 26 }, style: { movable: false } }))
    writeCell(
      tables,
      cell('index', { parent: 'table', value: 'users_id_idx (id)', geometry: { x: 0, y: 76, width: 120, height: 26 }, style: { codrawIndex: true }, order: 'a1' }),
    )
  })
  return { doc, second }
}

describe('exportDrawio', () => {
  it('writes the pages in their order with their names and the cells in the order of the tree', () => {
    const { doc, second } = sampleBoard()

    const xml = exportDrawio(doc)
    const file = new DOMParser().parseFromString(xml, 'text/xml')

    const diagrams = Array.from(file.getElementsByTagName('diagram'))
    expect(diagrams.map((diagram) => [diagram.getAttribute('id'), diagram.getAttribute('name')])).toEqual([
      [DEFAULT_PAGE_ID, 'Контекст'],
      [second, 'Схема БД'],
    ])
    const ids = (index: number) =>
      Array.from(diagrams[index]!.getElementsByTagName('mxCell')).map((element) => element.getAttribute('id') ?? element.parentElement!.getAttribute('id'))
    expect(ids(0)).toEqual(['0', '1', 'client', 'api', 'edge'])
    expect(ids(1)).toEqual(['0', '1', 'table', 'field', 'index'])
  })

  it('writes styles, geometry, multi-line labels and custom properties as draw.io reads them', () => {
    const xml = exportDrawio(sampleBoard().doc)

    expect(xml).toContain('<mxCell id="client" value="Клиент&#xa;веб" style="rounded=1;fillColor=#dae8fc;fontSize=13;" vertex="1" parent="1">')
    expect(xml).toContain('<mxGeometry x="10" y="20" width="120" height="60" as="geometry"/>')
    expect(xml).toContain(
      '<object label="API &lt;v1&gt; &amp; &quot;beta&quot;" tooltip="Шлюз" link="https://example.com" id="api"><mxCell style="fontSize=13;" vertex="1" parent="1">',
    )
    expect(xml).toContain(
      'style="endArrow=ERmany;startArrow=ERmandOne;edgeStyle=orthogonalEdgeStyle;labelBackgroundColor=none;" edge="1" parent="1" source="client" target="api"',
    )
    expect(xml).toContain('<mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="200" y="50"/></Array></mxGeometry>')
    expect(xml).toContain('style="shape=swimlane;startSize=30;childLayout=stackLayout;foldable=0;fontSize=13;"')
  })

  it('reads back into a board without losing anything', async () => {
    const { doc, second } = sampleBoard()

    const copy = new Y.Doc()
    importPages(copy, await parseDrawio(exportDrawio(doc)))

    expect(listPages(copy).map(({ id, name }) => ({ id, name }))).toEqual([
      { id: DEFAULT_PAGE_ID, name: 'Контекст' },
      { id: second, name: 'Схема БД' },
    ])
    const withDefaults = (cells: ReturnType<typeof pageCells>) =>
      Object.fromEntries(
        Object.entries(cells).map(([id, data]) => [
          id,
          {
            ...data,
            order: expect.any(String),
            style:
              data.kind === 'edge'
                ? { edgeStyle: 'orthogonalEdgeStyle', labelBackgroundColor: 'none', ...data.style }
                : { fontSize: 13, ...data.style },
          },
        ]),
      )
    expect(pageCells(copy, DEFAULT_PAGE_ID)).toEqual(withDefaults(pageCells(doc, DEFAULT_PAGE_ID)))
    expect(pageCells(copy, second)).toEqual(withDefaults(pageCells(doc, second)))
  })

  it('keeps what CoDraw does not use when a draw.io file goes through a board', async () => {
    const doc = new Y.Doc()
    importPages(doc, await parseDrawio(SAMPLE_DRAWIO))

    const xml = exportDrawio(doc)

    expect(xml).toContain('<object label="Users DB" tooltip="Primary storage" id="db">')
    expect(xml).toContain('style="shape=cylinder3;whiteSpace=wrap;boundedLbl=1;backgroundOutline=1;size=15;fontSize=12;"')
    expect(xml).toContain('value="SQL" style="fillColor=none;gradientColor=none;strokeColor=none;align=center;verticalAlign=middle;')
    expect(xml).toContain('connectable=0;')
    expect(xml).toContain('style="endArrow=none;dashed=1;edgeStyle=none;labelBackgroundColor=#ffffff;"')
  })

  it('keeps locks through a file of draw.io without the name of who locked', async () => {
    const doc = board()
    doc.transact(() => writeCell(getCells(doc), cell('api', { style: { locked: true, codrawLockedBy: 'Алиса' } })))

    const xml = exportDrawio(doc)
    const copy = new Y.Doc()
    importPages(copy, await parseDrawio(xml))

    expect(xml).toContain('style="locked=1;fontSize=13;"')
    expect(xml).not.toContain('Алиса')
    expect(pageCells(copy, DEFAULT_PAGE_ID).api!.style).toEqual({ locked: true, fontSize: 13 })
  })

  it('writes no file with who changed the elements, and reads none from a file', async () => {
    const doc = board()
    doc.transact(() => {
      writeCell(getCells(doc), cell('api'))
      writeAttribution(getCells(doc).get('api')!, { id: '0199a000-0000-7000-8000-00000000000a', name: 'Алиса' }, 1)
    })

    const xml = exportDrawio(doc)
    const copy = new Y.Doc()
    importPages(copy, await parseDrawio(xml))

    expect(xml).not.toContain('Алиса')
    expect(xml).not.toContain('0199a000-0000-7000-8000-00000000000a')
    expect(xml).not.toContain('modified')
    expect(readAttribution(getCells(copy).get('api'))).toBeNull()
  })
})

describe('importPages', () => {
  afterEach(() => vi.restoreAllMocks())

  it('names the participant who imports in every imported element', async () => {
    const doc = board()
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 6, 9, 0, 0))

    const ids = importPages(doc, await parseDrawio(SAMPLE_DRAWIO), { id: 'bob', name: 'Боб' })

    for (const id of ids) {
      const imported = Array.from(getCells(doc, id).entries()).filter(
        ([cellId]) => cellId !== ROOT_CELL_ID && cellId !== LAYER_CELL_ID,
      )
      expect(imported.length).toBeGreaterThan(0)
      for (const [, map] of imported) {
        expect(readAttribution(map)).toEqual({ by: 'bob', name: 'Боб', at: Date.UTC(2026, 9, 6, 9, 0, 0) })
      }
    }
  })

  it('adds the pages of the file after the pages of a board with shapes and keeps free page ids', async () => {
    const doc = board()
    doc.transact(() => writeCell(getCells(doc), cell('own')))

    const ids = importPages(doc, await parseDrawio(SAMPLE_DRAWIO))

    expect(ids).toEqual(['ctx-page', 'layers-page'])
    expect(listPages(doc).map((page) => page.name)).toEqual(['Страница 1', 'Контекст', 'Слои'])
    expect(Object.keys(pageCells(doc, 'ctx-page')).sort()).toEqual(['api', 'db', 'edge', 'label', 'straight'])
    expect(readAttrs(getCells(doc, 'ctx-page').get('db')!)).toEqual({ tooltip: 'Primary storage' })
  })

  it('gives pages new ids when the ids of the file are taken', async () => {
    const doc = board()
    const pages = await parseDrawio(SAMPLE_DRAWIO)
    importPages(doc, pages)

    const again = importPages(doc, pages)

    expect(again).toHaveLength(2)
    expect(again).not.toContain('ctx-page')
    expect(listPages(doc).map((page) => page.name)).toEqual(['Контекст', 'Слои', 'Контекст', 'Слои'])
  })

  it('replaces the only page of a board when it is empty', async () => {
    const doc = board()

    importPages(doc, await parseDrawio(SAMPLE_DRAWIO))

    expect(listPages(doc).map((page) => page.id)).toEqual(['ctx-page', 'layers-page'])
    expect(getCells(doc, DEFAULT_PAGE_ID).size).toBe(0)
  })

  it('writes the import in one transaction that undo does not track', async () => {
    const doc = board()
    const origins: unknown[] = []
    doc.on('afterTransaction', (transaction: Y.Transaction) => origins.push(transaction.origin))

    importPages(doc, await parseDrawio(SAMPLE_DRAWIO))

    expect(origins).toEqual([IMPORT_ORIGIN])
  })
})
