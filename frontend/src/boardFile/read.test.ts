import { describe, expect, it } from 'vitest'
import { EDGE_API_KEY, emptyEdgeApi, writeEdgeApi } from '../diagram/edgeApi.ts'
import { LOCKED_BY_KEY } from '../diagram/locks.ts'
import { zipFiles, type ZipFile } from '../lib/zip.ts'
import { BOARD_JSON, BoardFileError } from './format.ts'
import { readBoardFile } from './read.ts'

const encoder = new TextEncoder()

const fileOf = (json: unknown, extra: ZipFile[] = []) =>
  zipFiles([{ name: BOARD_JSON, data: encoder.encode(typeof json === 'string' ? json : JSON.stringify(json)), compress: true }, ...extra])

const board = (pages: unknown[], rest: Record<string, unknown> = {}) => ({ format: 'codraw', version: 1, title: 'Доска', pages, ...rest })

async function failure(bytes: Uint8Array | Promise<Uint8Array>): Promise<string> {
  const error = await readBoardFile(await bytes).then(
    () => null,
    (cause: unknown) => cause,
  )
  expect(error).toBeInstanceOf(BoardFileError)
  return (error as Error).message
}

describe('readBoardFile', () => {
  it('reads the pages, the cells with keys of order in the order of the file, the elements, the checks and the pictures', async () => {
    const bytes = await fileOf(
      board(
        [
          {
            id: 'page-1',
            name: 'Контейнеры',
            detailOf: { pageId: 'page-0', cellId: 'shop', elementId: 'e1' },
            view: { rule: { kind: 'containers', scope: 'e1' }, hidden: ['b', 'a'], places: { e2: { x: 1, y: 2, width: 3, height: 4 } } },
            cells: [
              { id: '1', kind: 'layer', value: 'Основной' },
              { id: 'b', value: 'Б', style: { [EDGE_API_KEY]: writeEdgeApi(emptyEdgeApi()) } },
              { id: 'a', value: 'А', geometry: { x: 5, width: 10 }, status: 'review', attrs: { tooltip: 'да' } },
              { id: 'a1', parent: 'a', style: { shape: 'image', image: 'images/1.png' } },
              { id: 'edge', kind: 'edge', source: 'a', target: 'b', geometry: { relative: true, points: [{ x: 1 }] } },
            ],
          },
        ],
        {
          elements: { e2: { name: 'API', tags: ['core'], parent: 'e1' } },
          checks: { 'rule:edge-label': false, 'hidden:x': true },
          images: ['images/1.png'],
        },
      ),
      [{ name: 'images/1.png', data: new Uint8Array([1, 2, 3]) }],
    )

    const file = await readBoardFile(bytes)

    expect(file.title).toBe('Доска')
    const [page] = file.pages
    expect(page).toMatchObject({
      id: 'page-1',
      name: 'Контейнеры',
      detailOf: { pageId: 'page-0', cellId: 'shop', elementId: 'e1' },
      view: { rule: { kind: 'containers', scope: 'e1' }, hidden: ['a', 'b'], places: { e2: { x: 1, y: 2, width: 3, height: 4 } } },
    })
    expect(page!.cells.map(({ order: _order, ...cell }) => cell)).toEqual([
      { id: '1', kind: 'layer', parent: '0', value: 'Основной', geometry: null, source: null, target: null, style: {} },
      { id: 'b', kind: 'vertex', parent: '1', value: 'Б', geometry: null, source: null, target: null, style: { [EDGE_API_KEY]: writeEdgeApi(emptyEdgeApi()) } },
      {
        id: 'a',
        kind: 'vertex',
        parent: '1',
        value: 'А',
        geometry: { x: 5, y: 0, width: 10, height: 0 },
        source: null,
        target: null,
        style: {},
        attrs: { tooltip: 'да' },
        status: 'review',
      },
      { id: 'a1', kind: 'vertex', parent: 'a', value: '', geometry: null, source: null, target: null, style: { shape: 'image', image: 'images/1.png' } },
      {
        id: 'edge',
        kind: 'edge',
        parent: '1',
        value: '',
        geometry: { x: 0, y: 0, width: 0, height: 0, relative: true, points: [{ x: 1, y: 0 }] },
        source: 'a',
        target: 'b',
        style: {},
      },
    ])
    const order = (id: string) => page!.cells.find((cell) => cell.id === id)!.order
    expect([order('b'), order('a'), order('edge')]).toEqual([order('b'), order('a'), order('edge')].sort())
    expect(file.elements).toEqual({ e2: { name: 'API', tags: ['core'], parent: 'e1' } })
    expect(file.checks).toEqual({ 'rule:edge-label': false, 'hidden:x': true })
    const picture = file.images.get('images/1.png')!
    expect(picture.type).toBe('image/png')
    expect(Array.from(new Uint8Array(await picture.arrayBuffer()))).toEqual([1, 2, 3])
  })

  it('drops what a file may not bring and puts what it cannot place into the main layer', async () => {
    const file = await readBoardFile(
      await fileOf(
        board([
          { id: 'page-1', name: 'А', cells: 'нет' },
          { id: 'page-1', name: 'Повтор', cells: [] },
          { name: 'Без id', cells: [] },
          {
            id: 'page-2',
            name: 42,
            view: { rule: { kind: 'никакой' } },
            cells: [
              { id: '0', value: 'Корень' },
              { id: 'link', style: { link: 'javascript:alert(1)', [LOCKED_BY_KEY]: 'Алиса', fill: { nested: true }, size: 'NaN', width: Infinity, tags: ['a', 1] } },
              { id: 'link', value: 'Повтор' },
              { id: 'odd', kind: 'group' },
              { id: 'lost', parent: 'nowhere' },
              { id: 'p', parent: 'q' },
              { id: 'q', parent: 'p' },
              { id: 'loose', kind: 'edge', source: 'nowhere', target: 'link', geometry: { x: '1', points: 'нет' } },
              { id: 'layer', kind: 'layer', parent: 'link' },
              { id: 'api', kind: 'edge', style: { [EDGE_API_KEY]: '{"broken"' } },
              { id: '', value: 'Пусто' },
            ],
          },
        ], { title: `  ${'Д'.repeat(300)}  `, images: ['../secret.png', 'img/lib/icon.svg', 'images/2.exe'], checks: { foo: true, 'rule:x': 'да' } }),
      ),
    )

    expect(file.title).toBe('Д'.repeat(200))
    expect(file.pages.map((page) => [page.id, page.name])).toEqual([
      ['page-1', 'А'],
      ['page-2', ''],
    ])
    expect(file.pages[0]!.cells).toEqual([])
    const [, page] = file.pages
    expect(page).not.toHaveProperty('view')
    const cells = Object.fromEntries(page!.cells.map((cell) => [cell.id, cell]))
    expect(Object.keys(cells)).toEqual(['link', 'lost', 'p', 'q', 'loose', 'layer', 'api'])
    expect(cells.link!.style).toEqual({ size: 'NaN' })
    expect(cells.lost!.parent).toBe('1')
    expect([cells.p!.parent, cells.q!.parent]).toEqual(['1', 'p'])
    expect(cells.loose).toMatchObject({ source: null, target: 'link', geometry: { x: 0, y: 0, width: 0, height: 0 } })
    expect(cells.layer!.parent).toBe('0')
    expect(cells.api!.style).toEqual({})
    expect(file.images.size).toBe(0)
    expect(file.checks).toEqual({})
  })

  it('tells a file that is not of CoDraw', async () => {
    expect(await failure(zipFiles([{ name: 'readme.txt', data: encoder.encode('привет') }]))).toBe('Это не файл CoDraw или draw.io')
    expect(await failure(fileOf({ format: 'excalidraw', version: 1, pages: [] }))).toBe('Это не файл CoDraw или draw.io')
    expect(await failure(fileOf('[1, 2]'))).toBe('Это не файл CoDraw или draw.io')
  })

  it('tells a damaged file', async () => {
    expect(await failure(fileOf('{"format": "codraw", '))).toBe('Файл .codraw повреждён')
    expect(await failure(fileOf(board([])))).toBe('Файл .codraw повреждён')
    expect(await failure(fileOf({ ...board([{ id: 'p', name: 'А', cells: [] }]), version: '1' }))).toBe('Файл .codraw повреждён')
    expect(await failure(fileOf(board([{ id: 'p', name: 'А', cells: [] }], { images: ['images/1.png'] })))).toBe('Файл .codraw повреждён')
    expect(await failure(encoder.encode('PK\x03\x04 и всё'))).toBe('Файл .codraw повреждён')

    const bytes = await fileOf(board([{ id: 'p', name: 'А', cells: [] }]))
    bytes[40] = bytes[40]! ^ 0xff
    expect(await failure(bytes)).toBe('Файл .codraw повреждён')
  })

  it('tells a file of a later version of the format', async () => {
    expect(await failure(fileOf({ ...board([{ id: 'p', name: 'А', cells: [] }]), version: 2 }))).toBe('Файл сохранён более новой версией CoDraw')
  })

  it('takes no board.json larger than its limit', async () => {
    const bytes = await fileOf(board([{ id: 'p', name: 'А', cells: [] }]))
    // The central directory says board.json unpacks into 100 MiB.
    const view = new DataView(bytes.buffer)
    const directory = view.getUint32(bytes.length - 22 + 16, true)
    view.setUint32(directory + 24, 100 * 1024 * 1024, true)
    expect(await failure(bytes)).toBe('Файл .codraw повреждён')
  })
})
