import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { boardImageUrl, IMAGE_PLACEHOLDER } from '../diagram/images.ts'
import { DEFAULT_PAGE_ID, getCells, initializeDocument, LAYER_CELL_ID, writeCell } from '../diagram/model.ts'
import { addPage } from '../diagram/pages.ts'
import { blobToDataUri, embeddedImages, inlineImages, PDF_IMAGE_TYPES } from './inlineImages.ts'

const XLINK_NS = 'http://www.w3.org/1999/xlink'
const BOARD = '0199a000-0000-7000-8000-000000000001'
const LOGO = boardImageUrl(BOARD, '0199a000-0000-7000-8000-0000000000aa')
const PHOTO = boardImageUrl(BOARD, '0199a000-0000-7000-8000-0000000000bb')

/** An SVG image as maxGraph draws it, with pictures at these addresses. */
const svgWith = (...hrefs: string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="${XLINK_NS}" width="100" height="100">` +
  hrefs.map((href) => `<image x="0" y="0" width="40" height="20" xlink:href="${href}" preserveAspectRatio="none"/>`).join('') +
  '</svg>'

const hrefs = (svg: string) =>
  Array.from(new DOMParser().parseFromString(svg, 'image/svg+xml').getElementsByTagName('image'), (image) =>
    image.getAttributeNS(XLINK_NS, 'href'),
  )

/** A `fetch` of pictures of this site: those in `pictures` by address, anything else not found. */
function stubFetch(pictures: Record<string, Blob>) {
  const fetchMock = vi.fn(async (url: string) => {
    const picture = pictures[new URL(url, location.href).pathname]
    return picture ? { ok: true, blob: async () => picture } : { ok: false, status: 404 }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const png = new Blob(['png'], { type: 'image/png' })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('pictures in saved images', () => {
  it('go into the image as data: addresses, each downloaded once, from the cache of the browser', async () => {
    const fetchMock = stubFetch({ [LOGO]: png })

    const svg = await inlineImages(svgWith(LOGO, `${location.origin}${LOGO}`))

    const data = await blobToDataUri(png)
    expect(hrefs(svg)).toEqual([data, data])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(LOGO, { credentials: 'same-origin', cache: 'force-cache' })
    expect(svg).not.toContain('/api/')
  })

  it('stay addresses at other sites, and become the placeholder when they cannot be downloaded', async () => {
    stubFetch({})

    const svg = await inlineImages(svgWith('https://example.com/a.png', PHOTO))

    expect(hrefs(svg)).toEqual(['https://example.com/a.png', IMAGE_PLACEHOLDER])
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"')
  })

  it('leave an image without pictures and pictures in data: addresses as they are', async () => {
    const fetchMock = stubFetch({})
    const plain = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'
    const embedded = svgWith('data:image/gif;base64,R0lGODlh', 'data:image/svg+xml,%3Csvg%2F%3E')

    expect(await inlineImages(plain)).toBe(plain)
    expect(hrefs(await inlineImages(embedded))).toEqual(['data:image/gif;base64,R0lGODlh', 'data:image/svg+xml,%3Csvg%2F%3E'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('become PNG for a type that is not kept, and shrink to a scale of their size on the image', async () => {
    const drawn: number[][] = []
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 400, height: 200, close: () => {} })))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: (_image: unknown, _x: number, _y: number, width: number, height: number) => drawn.push([width, height]),
    } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, done, type) {
      done(new Blob([`${type} ${this.width}×${this.height}`], { type }))
    })
    stubFetch({ [LOGO]: new Blob(['gif'], { type: 'image/gif' }), [PHOTO]: new Blob(['x'.repeat(1000)], { type: 'image/jpeg' }) })

    const pdf = await inlineImages(svgWith(LOGO, PHOTO), { types: PDF_IMAGE_TYPES })
    const small = await inlineImages(svgWith(PHOTO), { maxScale: 2 })

    expect(hrefs(pdf)[0]).toBe(await blobToDataUri(new Blob(['image/png 400×200'], { type: 'image/png' })))
    // A JPEG that PDF keeps stays as it is.
    expect(hrefs(pdf)[1]).toBe(await blobToDataUri(new Blob(['x'.repeat(1000)], { type: 'image/jpeg' })))
    // Drawn 40 × 20: at most 80 × 40, and still JPEG.
    expect(hrefs(small)[0]).toBe(await blobToDataUri(new Blob(['image/jpeg 80×40'], { type: 'image/jpeg' })))
    expect(drawn).toEqual([
      [400, 200],
      [80, 40],
    ])
  })
})

describe('pictures in a .drawio file', () => {
  it('are those of the board on all its pages or on one, without those that cannot be downloaded', async () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const second = addPage(doc, DEFAULT_PAGE_ID, 'Вторая')
    const picture = (id: string, image: string) => ({
      id,
      kind: 'vertex' as const,
      parent: LAYER_CELL_ID,
      order: 'a0',
      value: '',
      geometry: { x: 0, y: 0, width: 10, height: 10 },
      source: null,
      target: null,
      style: { shape: 'image', image },
    })
    doc.transact(() => {
      writeCell(getCells(doc), picture('logo', LOGO))
      writeCell(getCells(doc), picture('remote', 'https://example.com/a.png'))
      writeCell(getCells(doc, second), picture('photo', PHOTO))
    })
    stubFetch({ [LOGO]: png })

    expect(await embeddedImages(doc)).toEqual(new Map([[LOGO, await blobToDataUri(png)]]))
    expect(await embeddedImages(doc, second)).toEqual(new Map())
  })
})
