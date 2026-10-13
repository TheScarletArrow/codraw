import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { getCheckSettings, setIssueHidden, setRuleEnabled } from '../checks/checks.ts'
import { readAttribution } from '../diagram/attribution.ts'
import { modelFieldOf, writeModelField } from '../diagram/boardModel.ts'
import { diffDocuments } from '../diagram/diff.ts'
import { boardImageUrl, type ImageHost } from '../diagram/images.ts'
import { LEGEND_KEY } from '../diagram/legendKeys.ts'
import { LINK_KEY, pageLink } from '../diagram/links.ts'
import {
  DEFAULT_PAGE_ID,
  ELEMENT_KEY,
  getCells,
  getElements,
  getPages,
  initializeDocument,
  LAYER_CELL_ID,
  orderBetween,
  readCell,
  readPage,
  ROOT_CELL_ID,
  writeCell,
  writePage,
  type CellData,
} from '../diagram/model.ts'
import { viewOf } from '../diagram/modelViews.ts'
import { listPages, renamePage } from '../diagram/pages.ts'
import { PART_KEY } from '../diagram/sequence.ts'
import { readStatus, STATUS_KEY } from '../diagram/status.ts'
import { COMPUTED_KEY } from '../diagram/viewRule.ts'
import { IMPORT_ORIGIN } from '../drawio/importPages.ts'
import { importBoardFile, placeBoardFileImages } from './importFile.ts'
import { readBoardFile, type BoardFile } from './read.ts'
import { boardFileBytes } from './write.ts'

const BOARD = '0199a000-0000-7000-8000-00000000b0a1'
const LOGO = boardImageUrl(BOARD, '0199a000-0000-7000-8000-000000000001')
const ALICE = { id: '0199a000-0000-7000-8000-0000000000a1', name: 'Алиса' }

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

const shop = { [ELEMENT_KEY]: 'e-shop', codrawName: 'Магазин', codrawKind: 'c4SoftwareSystem' }
const api = { [ELEMENT_KEY]: 'e-api', codrawName: 'API', codrawKind: 'c4Container', codrawTechnology: 'Kotlin', codrawTags: ['core'] }

/**
 * A board with what only CoDraw has: elements on two pages with their place in the model, a page of detail, a view of
 * the model with computed cells, a sequence part, a legend, a status, a lock, a hidden layer, a link to a page, a
 * picture and the settings of the checks.
 */
function richBoard() {
  const doc = board()
  renamePage(doc, DEFAULT_PAGE_ID, 'Контекст')
  doc.transact(() => {
    const context = getCells(doc)
    writeCell(context, cell('notes', { kind: 'layer', parent: ROOT_CELL_ID, value: 'Заметки', geometry: null, order: 'b0', style: { codrawHidden: true } }))
    writeCell(context, cell('shop', { value: 'Магазин', style: { ...shop, [LINK_KEY]: pageLink('detail'), locked: true }, order: 'a1' }))
    writeCell(context, cell('client', { value: 'Клиент', order: 'a0' }))
    writeCell(context, cell('call', { kind: 'edge', value: 'HTTPS', source: 'client', target: 'shop', geometry: { x: 0, y: 0, width: 0, height: 0, relative: true, points: [{ x: 50, y: 60 }] }, order: 'a2', style: { endArrow: 'block', codrawTechnology: 'HTTPS' } }))
    writeCell(context, cell('logo', { style: { shape: 'image', image: LOGO }, order: 'a3' }))
    writeCell(context, cell('legend', { style: { [LEGEND_KEY]: true }, order: 'a4' }))
    writeCell(context, cell('sticky', { parent: 'notes', value: 'Идея', style: { codrawShape: 'sticky' } }))
    context.get('shop')!.set(STATUS_KEY, 'review')

    writePage(doc, 'detail', { name: 'Магазин: контейнеры', order: orderBetween(listPages(doc).at(-1)!.order, null), detailOf: { pageId: DEFAULT_PAGE_ID, cellId: 'shop', elementId: 'e-shop' } })
    const detail = getCells(doc, 'detail')
    writeCell(detail, cell('boundary', { value: 'Магазин', style: { ...shop } }))
    writeCell(detail, cell('api', { parent: 'boundary', value: 'API\n[Container: Kotlin]', style: { ...api } }))
    writeCell(detail, cell('seq', { style: { [PART_KEY]: 'participant', codrawSeqKey: 'p1' } }))

    writePage(doc, 'view', {
      name: 'Ландшафт',
      order: orderBetween(listPages(doc).at(-1)!.order, null),
      view: { rule: { kind: 'containers', scope: 'e-shop', environment: null, owners: [], tags: ['core'], technologies: [] }, hidden: ['e-shop~e-api'], places: { 'e-shop~e-api': { x: 1, y: 2, width: 3, height: 4 } } },
    })
    const view = getCells(doc, 'view')
    writeCell(view, cell('v-e-shop~e-api', { value: 'API', style: { ...api, [COMPUTED_KEY]: 'e-shop~e-api' } }))
  })
  writeModelField(doc, 'e-api', 'parent', 'e-shop')
  setRuleEnabled(doc, 'edge-technology', false)
  setIssueHidden(doc, 'missing-technology:e-api', true)
  return doc
}

const pictures = async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })

async function saved(doc: Y.Doc): Promise<BoardFile> {
  return readBoardFile(await boardFileBytes(doc, 'Магазин', pictures))
}

/** A host that stores every picture at `url`. */
function hostAt(url: string | null): ImageHost & { stored: Blob[] } {
  const stored: Blob[] = []
  return {
    stored,
    store: async (image: Blob) => (stored.push(image), url === null ? null : { url, width: 10, height: 10 }),
    holds: () => false,
  }
}

/** The page entries without their keys of order, by id, in the order of the board. */
const pageEntries = (doc: Y.Doc) => listPages(doc).map((page) => ({ ...readPage(getPages(doc).get(page.id)!), id: page.id, order: undefined }))

/** The layers of a page without their keys of order. */
const layers = (doc: Y.Doc, pageId: string) =>
  Array.from(getCells(doc, pageId).entries())
    .map(([id, map]) => readCell(id, map))
    .filter((data) => data.kind === 'layer')
    .map(({ order: _order, ...data }) => data)
    .sort((a, b) => a.id.localeCompare(b.id))

describe('importBoardFile', () => {
  it('makes a new board equal to the board the file was saved from', async () => {
    const original = richBoard()
    const file = await saved(original)
    await placeBoardFileImages(file, hostAt(LOGO))
    const copy = board()

    const ids = importBoardFile(copy, file)

    expect(ids).toEqual([DEFAULT_PAGE_ID, 'detail', 'view'])
    expect(diffDocuments(original, copy).pages).toEqual([])
    expect(pageEntries(copy)).toEqual(pageEntries(original))
    for (const page of ids) expect(layers(copy, page)).toEqual(layers(original, page))
    expect(getElements(copy).toJSON()).toEqual(getElements(original).toJSON())
    expect(modelFieldOf(copy, 'e-api', 'parent')).toBe('e-shop')
    expect(getCheckSettings(copy).toJSON()).toEqual(getCheckSettings(original).toJSON())
    expect(readStatus(getCells(copy).get('shop'))).toEqual({ status: 'review', by: null, name: null, at: null })
    expect(viewOf(copy, 'view')?.rule.scope).toBe('e-shop')
  })

  it('brings elements of its own into the board it was saved from, and its links lead to its pages', async () => {
    const doc = richBoard()
    const file = await saved(doc)
    await placeBoardFileImages(file, hostAt(LOGO))
    renamePage(doc, 'detail', 'Детали')

    const ids = importBoardFile(doc, file, ALICE)

    expect(listPages(doc).map((page) => page.name)).toEqual(['Контекст', 'Детали', 'Ландшафт', 'Контекст', 'Магазин: контейнеры', 'Ландшафт'])
    const [context, detail, view] = ids as [string, string, string]
    expect(ids.some((id) => [DEFAULT_PAGE_ID, 'detail', 'view'].includes(id))).toBe(false)

    const imported = (pageId: string, cellId: string) => readCell(cellId, getCells(doc, pageId).get(cellId)!)
    const newShop = imported(context, 'shop').style[ELEMENT_KEY] as string
    const newApi = imported(detail, 'api').style[ELEMENT_KEY] as string
    expect([newShop, newApi]).not.toContain('e-shop')
    expect([newShop, newApi]).not.toContain('e-api')
    expect(imported(detail, 'boundary').style[ELEMENT_KEY]).toBe(newShop)
    expect(imported(view, 'v-e-shop~e-api').style).toMatchObject({ [ELEMENT_KEY]: newApi, [COMPUTED_KEY]: `${newShop}~${newApi}` })
    expect(imported(context, 'shop').style).toMatchObject({ [LINK_KEY]: pageLink(detail), codrawName: 'Магазин' })
    expect(readPage(getPages(doc).get(detail)!).detailOf).toEqual({ pageId: context, cellId: 'shop', elementId: newShop })
    expect(readPage(getPages(doc).get(view)!).view).toEqual({
      rule: { kind: 'containers', scope: newShop, environment: null, owners: [], tags: ['core'], technologies: [] },
      hidden: [`${newShop}~${newApi}`],
      places: { [`${newShop}~${newApi}`]: { x: 1, y: 2, width: 3, height: 4 } },
    })
    expect(modelFieldOf(doc, newApi, 'parent')).toBe(newShop)
    expect(getCheckSettings(doc).get(`hidden:missing-technology:${newApi}`)).toBe(true)
    expect(getCheckSettings(doc).get('hidden:missing-technology:e-api')).toBe(true)

    // The elements of the board stay as they were.
    expect(getElements(doc).get('e-api')!.get('name')).toBe('API')
    expect(readCell('shop', getCells(doc).get('shop')!).style[LINK_KEY]).toBe(pageLink('detail'))
    expect(readAttribution(getCells(doc, context).get('shop'))).toMatchObject({ by: ALICE.id, name: ALICE.name })
    expect(readAttribution(getCells(doc).get('shop'))).toBeNull()
  })

  it('takes the settings of the rules only into a board it replaces', async () => {
    const file = await saved(richBoard())
    const doc = board()
    doc.transact(() => writeCell(getCells(doc), cell('own')))

    importBoardFile(doc, file)

    expect(getCheckSettings(doc).get('rule:edge-technology')).toBeUndefined()
    expect(getCheckSettings(doc).get('hidden:missing-technology:e-api')).toBe(true)
    expect(listPages(doc)).toHaveLength(4)
  })

  it('is one change that the history of undo does not track', async () => {
    const file = await saved(richBoard())
    const doc = board()
    const origins: unknown[] = []
    doc.on('afterTransaction', (transaction: Y.Transaction) => origins.push(transaction.origin))

    importBoardFile(doc, file)

    expect(origins).toEqual([IMPORT_ORIGIN])
  })
})

describe('placeBoardFileImages', () => {
  it('stores the pictures that cells show on the board, once each', async () => {
    const file = await saved(richBoard())
    const host = hostAt(boardImageUrl(BOARD, '0199a000-0000-7000-8000-000000000002'))
    file.images.set('images/9.png', new Blob(['лишняя'], { type: 'image/png' }))

    await placeBoardFileImages(file, host)

    expect(host.stored).toHaveLength(1)
    const logo = file.pages[0]!.cells.find((one) => one.id === 'logo')!
    expect(logo.style.image).toBe(boardImageUrl(BOARD, '0199a000-0000-7000-8000-000000000002'))
  })

  it('writes a picture that could not be stored into its cell, so that it still shows', async () => {
    for (const host of [hostAt(null), null]) {
      const file = await saved(richBoard())
      await placeBoardFileImages(file, host)

      expect(file.pages[0]!.cells.find((one) => one.id === 'logo')!.style.image).toBe('data:image/png;base64,iVBORw==')
    }
  })
})
