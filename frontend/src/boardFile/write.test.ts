import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { setIssueHidden, setRuleEnabled } from '../checks/checks.ts'
import { writeAttribution, writeTextAuthor } from '../diagram/attribution.ts'
import { boardImageUrl } from '../diagram/images.ts'
import { LOCKED_BY_KEY, LOCKED_KEY } from '../diagram/locks.ts'
import {
  DEFAULT_PAGE_ID,
  ELEMENT_KEY,
  getCells,
  initializeDocument,
  LAYER_CELL_ID,
  orderBetween,
  ROOT_CELL_ID,
  writeCell,
  type CellData,
} from '../diagram/model.ts'
import { writeModelField } from '../diagram/boardModel.ts'
import { addPage, renamePage } from '../diagram/pages.ts'
import { STATUS_KEY, writeStatus } from '../diagram/status.ts'
import { exportDrawio } from '../drawio/serialize.ts'
import { openZip } from '../lib/zip.ts'
import { BOARD_JSON, type BoardFileJson } from './format.ts'
import { boardFileBytes, boardFileJson, packImages } from './write.ts'

const BOARD = '0199a000-0000-7000-8000-00000000b0a1'
const imageUrl = (n: number) => boardImageUrl(BOARD, `0199a000-0000-7000-8000-${String(n).padStart(12, '0')}`)

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
  value: '',
  geometry: { x: 10, y: 20, width: 120, height: 60 },
  source: null,
  target: null,
  style: {},
  ...overrides,
})

/** Bytes that deflate does not shrink, as those of a photo. */
function noise(length: number, seed = 7): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  for (let index = 0; index < length; index++) {
    seed = (seed * 1103515245 + 12345) >>> 0
    bytes[index] = seed >>> 24
  }
  return bytes
}

const png = (bytes: Uint8Array<ArrayBuffer>) => new Blob([bytes], { type: 'image/png' })

async function unpack(bytes: Uint8Array) {
  const archive = openZip(bytes, { entries: 100, total: 10 * 1024 * 1024 })
  const json = JSON.parse(new TextDecoder().decode((await archive.read(BOARD_JSON))!)) as BoardFileJson
  return { archive, json }
}

describe('boardFileJson', () => {
  it('writes the pages in their order and the cells in drawing order without fields at their defaults', () => {
    const doc = board()
    renamePage(doc, DEFAULT_PAGE_ID, 'Контекст')
    const second = addPage(doc, DEFAULT_PAGE_ID, 'Контейнеры')
    doc.transact(() => {
      const cells = getCells(doc)
      writeCell(cells, cell('notes', { kind: 'layer', parent: ROOT_CELL_ID, value: 'Заметки', geometry: null, order: 'b0' }))
      writeCell(cells, cell('b', { value: 'Б', order: 'a2', geometry: { x: 0, y: 0, width: 80, height: 0 } }))
      writeCell(cells, cell('a', { value: 'А', order: 'a1', style: { rounded: true, tags: ['x'] } }))
      writeCell(cells, cell('child', { parent: 'a', order: 'a0', geometry: null }))
      writeCell(cells, cell('sticky', { parent: 'notes', value: 'Идея' }))
      writeCell(cells, cell('orphan', { parent: 'gone', order: 'a3' }))
      writeCell(
        cells,
        cell('edge', {
          kind: 'edge',
          order: 'a4',
          source: 'a',
          target: 'b',
          geometry: { x: 0, y: 0, width: 0, height: 0, relative: true, points: [{ x: 5, y: 6 }] },
        }),
      )
    })

    const json = boardFileJson(doc, 'Архитектура')

    expect(json).toMatchObject({ format: 'codraw', version: 1, title: 'Архитектура' })
    expect(json.pages.map((page) => [page.id, page.name])).toEqual([
      [DEFAULT_PAGE_ID, 'Контекст'],
      [second, 'Контейнеры'],
    ])
    expect(json.pages[0]!.cells).toEqual([
      { id: '1', kind: 'layer' },
      { id: 'a', value: 'А', geometry: { x: 10, y: 20, width: 120, height: 60 }, style: { rounded: true, tags: ['x'] } },
      { id: 'child', parent: 'a' },
      { id: 'b', value: 'Б', geometry: { width: 80 } },
      // The canvas shows a cell whose parent is gone in the main layer, and so does the file.
      { id: 'orphan', geometry: { x: 10, y: 20, width: 120, height: 60 } },
      { id: 'edge', kind: 'edge', geometry: { relative: true, points: [{ x: 5, y: 6 }] }, source: 'a', target: 'b' },
      { id: 'notes', kind: 'layer', value: 'Заметки' },
      { id: 'sticky', parent: 'notes', value: 'Идея', geometry: { x: 10, y: 20, width: 120, height: 60 } },
    ])
    expect(json.pages[1]!.cells).toEqual([{ id: '1', kind: 'layer' }])
    expect(json).not.toHaveProperty('elements')
    expect(json).not.toHaveProperty('checks')
    expect(json).not.toHaveProperty('images')
  })

  it('keeps the properties of an element once, with its place in the model, and the settings of the checks', () => {
    const doc = board()
    const second = addPage(doc, DEFAULT_PAGE_ID, 'Контейнеры')
    const props = { codrawName: 'API', codrawTechnology: 'Kotlin', codrawTags: ['core', 'pci'] }
    doc.transact(() => {
      writeCell(getCells(doc), cell('system', { value: 'Платежи', style: { [ELEMENT_KEY]: 'e-system', codrawName: 'Платежи', codrawKind: 'c4SoftwareSystem' } }))
      writeCell(getCells(doc), cell('api', { value: 'API', style: { [ELEMENT_KEY]: 'e-api', ...props } }))
      writeCell(getCells(doc, second), cell('api-2', { value: 'API', style: { [ELEMENT_KEY]: 'e-api', ...props } }))
    })
    writeModelField(doc, 'e-api', 'parent', 'e-system')
    setRuleEnabled(doc, 'edge-technology', false)
    setIssueHidden(doc, 'edge-label:page-1/edge', true)

    const json = boardFileJson(doc, 'Платежи')

    expect(json.pages[0]!.cells.find((one) => one.id === 'api')!.style).toEqual({ [ELEMENT_KEY]: 'e-api' })
    expect(json.pages[1]!.cells.find((one) => one.id === 'api-2')!.style).toEqual({ [ELEMENT_KEY]: 'e-api' })
    expect(json.elements).toEqual({
      'e-api': { name: 'API', technology: 'Kotlin', tags: ['core', 'pci'], parent: 'e-system' },
      'e-system': { name: 'Платежи', kind: 'c4SoftwareSystem' },
    })
    expect(json.checks).toEqual({ 'rule:edge-technology': false, 'hidden:edge-label:page-1/edge': true })
  })

  it('carries statuses and locks without who set them, and nothing of who changed what', () => {
    const doc = board()
    const alice = { id: '0199a000-0000-7000-8000-0000000000a1', name: 'Алиса' }
    const bob = { id: '0199a000-0000-7000-8000-0000000000b1', name: 'Боб' }
    doc.transact(() => {
      const cells = getCells(doc)
      writeCell(cells, cell('api', { value: 'API', style: { [LOCKED_KEY]: true, [LOCKED_BY_KEY]: alice.name } }))
      writeCell(cells, cell('sticky', { value: 'Идея', style: { codrawShape: 'sticky' } }))
      writeStatus(cells.get('api')!, 'review', bob, 1_700_000_000_000)
      writeAttribution(cells.get('api')!, alice, 1_700_000_000_000)
      writeTextAuthor(cells.get('sticky')!, bob)
      const layer = cells.get(LAYER_CELL_ID)!.get('style') as Y.Map<unknown>
      layer.set(LOCKED_KEY, true)
      layer.set(LOCKED_BY_KEY, bob.name)
    })

    const json = boardFileJson(doc, 'Доска')
    const text = JSON.stringify(json)

    expect(json.pages[0]!.cells.find((one) => one.id === 'api')).toMatchObject({ status: 'review', style: { [LOCKED_KEY]: true } })
    expect(json.pages[0]!.cells.find((one) => one.id === '1')).toEqual({ id: '1', kind: 'layer', style: { [LOCKED_KEY]: true } })
    for (const personal of [alice.id, alice.name, bob.id, bob.name, LOCKED_BY_KEY, 'modifiedAt', 'statusAt', 'textAuthor']) {
      expect(text).not.toContain(personal)
    }
    expect(getCells(doc).get('api')!.get(STATUS_KEY)).toBe('review')
  })
})

describe('packImages', () => {
  it('packs each picture once, those with the same bytes under other addresses too, and leaves out what it cannot get', async () => {
    const doc = board()
    const logo = noise(1000)
    const pictures = new Map<string, Blob>([
      [imageUrl(1), png(logo)],
      [imageUrl(2), png(new Uint8Array(logo))],
      [imageUrl(3), new Blob([noise(500, 3)], { type: 'image/jpeg' })],
      [imageUrl(4), new Blob(['<svg/>'], { type: 'image/svg+xml' })],
    ])
    const downloads: string[] = []
    const download = async (url: string) => (downloads.push(url), pictures.get(url) ?? null)
    doc.transact(() => {
      const cells = getCells(doc)
      for (const [index, url] of [imageUrl(1), imageUrl(1), imageUrl(2), imageUrl(3), imageUrl(4), imageUrl(5)].entries()) {
        writeCell(cells, cell(`image-${index}`, { style: { shape: 'image', image: url } }))
      }
      writeCell(cells, cell('outside', { style: { shape: 'image', image: 'https://example.com/logo.png' } }))
    })

    const { paths, files } = await packImages(doc, download)

    expect(downloads.sort()).toEqual([imageUrl(1), imageUrl(2), imageUrl(3), imageUrl(4), imageUrl(5)].sort())
    expect(files.map((file) => file.name)).toEqual(['images/1.png', 'images/2.jpg'])
    expect(Object.fromEntries(paths)).toEqual({
      [imageUrl(1)]: 'images/1.png',
      [imageUrl(2)]: 'images/1.png',
      [imageUrl(3)]: 'images/2.jpg',
    })
    const json = boardFileJson(doc, 'Доска', paths)
    const images = Object.fromEntries(json.pages[0]!.cells.map((one) => [one.id, one.style?.image]))
    expect(images).toMatchObject({
      'image-0': 'images/1.png',
      'image-1': 'images/1.png',
      'image-2': 'images/1.png',
      'image-3': 'images/2.jpg',
      'image-4': imageUrl(4),
      'image-5': imageUrl(5),
      outside: 'https://example.com/logo.png',
    })
    expect(json.images).toEqual(['images/1.png', 'images/2.jpg'])
  })
})

describe('boardFileBytes', () => {
  it('is a ZIP archive of board.json and the pictures of the board', async () => {
    const doc = board()
    doc.transact(() => writeCell(getCells(doc), cell('logo', { style: { shape: 'image', image: imageUrl(1) } })))

    const bytes = await boardFileBytes(doc, 'Доска', async () => png(noise(300)))
    const { archive, json } = await unpack(bytes)

    expect(archive.names).toEqual([BOARD_JSON, 'images/1.png'])
    expect(json.images).toEqual(['images/1.png'])
    expect(Array.from((await archive.read('images/1.png'))!)).toEqual(Array.from(noise(300)))
  })

  it('is several times smaller than the .drawio file of the same board', async () => {
    const doc = board()
    const logo = noise(40 * 1024)
    doc.transact(() => {
      const cells = getCells(doc)
      for (let index = 0; index < 100; index++) {
        writeCell(
          cells,
          cell(`s${index}`, {
            value: `Сервис ${index}\n[Container: Kotlin]`,
            geometry: { x: (index % 10) * 200, y: Math.floor(index / 10) * 150, width: 160, height: 80 },
            style: {
              rounded: true,
              whiteSpace: 'wrap',
              fillColor: '#dae8fc',
              strokeColor: '#6c8ebf',
              [ELEMENT_KEY]: `e${index}`,
              codrawName: `Сервис ${index}`,
              codrawKind: 'c4Container',
              codrawTechnology: 'Kotlin',
              codrawOwner: 'Команда платежей',
              codrawTags: ['core'],
            },
          }),
        )
        if (index > 0) {
          writeCell(cells, cell(`l${index}`, { kind: 'edge', source: `s${index - 1}`, target: `s${index}`, geometry: { x: 0, y: 0, width: 0, height: 0, relative: true }, style: { endArrow: 'block', codrawTechnology: 'HTTP' } }))
        }
      }
      for (let index = 0; index < 5; index++) {
        writeCell(cells, cell(`logo${index}`, { geometry: { x: index * 100, y: 2000, width: 64, height: 64 }, style: { shape: 'image', image: imageUrl(1) } }))
      }
    })

    const codraw = await boardFileBytes(doc, 'Платежи', async () => png(logo))
    const uri = `data:image/png;base64,${btoa(String.fromCharCode(...logo))}`
    const drawio = new TextEncoder().encode(exportDrawio(doc, new Map([[imageUrl(1), uri]])))

    expect(codraw.length * 3).toBeLessThan(drawio.length)
  })
})
