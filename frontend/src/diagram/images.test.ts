import { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  boardImageOf,
  boardImageUrl,
  cellImageUrls,
  dataUriToBlob,
  fittedImageSize,
  imageStyle,
  isImageStyle,
  needsStoring,
  pastesAsImage,
  replaceCellImages,
  storeImages,
  storePageImages,
  type ImageHost,
} from './images.ts'
import type { CellData } from './model.ts'

const BOARD = '0199a000-0000-7000-8000-000000000001'
const OTHER = '0199a000-0000-7000-8000-000000000002'
const IMAGE = '0199a000-0000-7000-8000-0000000000aa'
/** A PNG of one pixel. */
const PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** A host of the board {@link BOARD} that stores every picture as a new image and remembers what it got. */
function fakeHost(refuse = false) {
  const stored: Blob[] = []
  const host: ImageHost = {
    store: vi.fn(async (image: Blob) => {
      if (refuse) return null
      stored.push(image)
      return { url: boardImageUrl(BOARD, `0199a000-0000-7000-8000-00000000000${stored.length}`), width: 10, height: 10 }
    }),
    holds: (url) => boardImageOf(url)?.boardId === BOARD,
  }
  return { host, stored }
}

afterEach(() => vi.unstubAllGlobals())

describe('image shapes', () => {
  it('have the style of a picture of draw.io that keeps its proportions', () => {
    const style = imageStyle('/api/boards/b/images/i')

    expect(style).toEqual({
      shape: 'image',
      image: '/api/boards/b/images/i',
      aspect: 'fixed',
      imageAspect: false,
      verticalLabelPosition: 'bottom',
      verticalAlign: 'top',
    })
    expect(isImageStyle(style)).toBe(true)
    expect(isImageStyle({ shape: 'image' })).toBe(false)
    expect(isImageStyle({ shape: 'ellipse', image: 'x' })).toBe(false)
  })

  it('are as large as their pictures, but not larger than 600 × 600', () => {
    expect(fittedImageSize(320, 200)).toEqual({ width: 320, height: 200 })
    expect(fittedImageSize(1920, 1080)).toEqual({ width: 600, height: 338 })
    expect(fittedImageSize(500, 3000)).toEqual({ width: 100, height: 600 })
    expect(fittedImageSize(10_000, 1)).toEqual({ width: 600, height: 1 })
  })
})

describe('addresses of images', () => {
  it('name an image of a board by its path or by its full address on this site', () => {
    const path = boardImageUrl(BOARD, IMAGE)

    expect(path).toBe(`/api/boards/${BOARD}/images/${IMAGE}`)
    expect(boardImageOf(path)).toEqual({ boardId: BOARD, imageId: IMAGE })
    expect(boardImageOf(`${location.origin}${path}`)).toEqual({ boardId: BOARD, imageId: IMAGE })
    expect(boardImageOf(`https://example.com${path}`)).toBeNull()
    expect(boardImageOf('/api/boards/x/images/y')).toBeNull()
    expect(boardImageOf(PNG_DATA)).toBeNull()
  })

  it('need storing when they hold a raster picture or name an image of another board', () => {
    const { host } = fakeHost()

    expect(needsStoring(PNG_DATA, host)).toBe(true)
    expect(needsStoring(boardImageUrl(OTHER, IMAGE), host)).toBe(true)
    expect(needsStoring(boardImageUrl(BOARD, IMAGE), host)).toBe(false)
    expect(needsStoring('data:image/svg+xml,%3Csvg%2F%3E', host)).toBe(false)
    expect(needsStoring('https://example.com/logo.png', host)).toBe(false)
  })

  it('in data: give their pictures with their types', async () => {
    const picture = dataUriToBlob(PNG_DATA)!

    expect(picture.type).toBe('image/png')
    expect(Array.from(new Uint8Array(await picture.arrayBuffer()).slice(1, 4))).toEqual([0x50, 0x4e, 0x47])
    expect(dataUriToBlob('data:image/jpg;base64,AAAA')!.type).toBe('image/jpeg')
    expect(dataUriToBlob('data:image/svg+xml;base64,AAAA')).toBeNull()
    expect(dataUriToBlob('data:image/png;base64,!!!')).toBeNull()
  })
})

describe('pasting a picture', () => {
  it('takes the picture without text, or with the HTML of a copied image alone', () => {
    expect(pastesAsImage('', '')).toBe(true)
    expect(pastesAsImage('  ', '')).toBe(true)
    expect(pastesAsImage('https://example.com/a.png', '<meta charset="utf-8"><img src="https://example.com/a.png" alt="">')).toBe(true)
    expect(pastesAsImage('Имя\tТип', '<table><tr><td>Имя</td></tr></table>')).toBe(false)
    expect(pastesAsImage('Сервис', '')).toBe(false)
  })
})

describe('storing pictures on the board', () => {
  it('stores each picture once and leaves those that need no storing', async () => {
    const { host, stored } = fakeHost()
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['gif'], { type: 'image/gif' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const foreign = boardImageUrl(OTHER, IMAGE)

    const result = await storeImages([PNG_DATA, foreign, PNG_DATA, boardImageUrl(BOARD, IMAGE), 'https://example.com/a.png'], host)

    expect(stored.map((picture) => picture.type).sort()).toEqual(['image/gif', 'image/png'])
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(foreign, { credentials: 'same-origin' })
    expect([...result.keys()].sort()).toEqual([PNG_DATA, foreign].sort())
  })

  it('keeps the addresses of pictures that could not be had or stored', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })))
    const refusing = fakeHost(true)

    expect(await storeImages([boardImageUrl(OTHER, IMAGE)], fakeHost().host)).toEqual(new Map())
    expect(await storeImages([PNG_DATA], refusing.host)).toEqual(new Map())
  })

  it('points the cells of pages of a file at the stored pictures', async () => {
    const { host } = fakeHost()
    const cell = (id: string, image?: string): CellData => ({
      id,
      kind: 'vertex',
      parent: '1',
      order: 'a0',
      value: '',
      geometry: null,
      source: null,
      target: null,
      style: image ? { shape: 'image', image } : {},
    })
    const pages = [{ cells: [cell('a', PNG_DATA), cell('b')] }, { cells: [cell('c', PNG_DATA), cell('d', 'https://example.com/x.png')] }]

    await storePageImages(pages, host)

    expect(host.store).toHaveBeenCalledTimes(1)
    expect(pages.flatMap((page) => page.cells.map((one) => one.style.image ?? null))).toEqual([
      boardImageUrl(BOARD, '0199a000-0000-7000-8000-000000000001'),
      null,
      boardImageUrl(BOARD, '0199a000-0000-7000-8000-000000000001'),
      'https://example.com/x.png',
    ])
  })

  it('reads and replaces the pictures of cells and their children', () => {
    const group = new Cell('', null, { fillColor: 'none' })
    const inside = new Cell('', null, { shape: 'image', image: 'a' })
    group.insert(inside)
    const alone = new Cell('', null, { shape: 'image', image: 'b' })

    expect(cellImageUrls([group, alone])).toEqual(['a', 'b'])

    replaceCellImages([group, alone], new Map([['a', 'A']]))
    expect(inside.getStyle().image).toBe('A')
    expect(alone.getStyle().image).toBe('b')
  })
})
