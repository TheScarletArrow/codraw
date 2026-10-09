import { Cell, Geometry } from '@maxgraph/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDrawio } from '../drawio/parse.ts'
import { boardImageUrl, imageStyle } from '../diagram/images.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { componentName, fileDraft, MissingPicturesError, OutsidePicturesError, selectionDraft } from './component.ts'

vi.mock('./preview.ts', () => ({
  previewOf: vi.fn(async () => 'data:image/png;base64,cHJldmlldw=='),
  previewOfImage: vi.fn(async () => 'data:image/png;base64,c2VsZWN0aW9u'),
}))

const BOARD = '0199a000-0000-7000-8000-000000000001'
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]
const u32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
const png = (width: number, height: number, name = 'logo.png') =>
  new File([new Uint8Array([...PNG_HEADER, ...u32(width), ...u32(height), 8, 6, 0, 0, 0])], name, { type: 'image/png' })

/** The image shapes of a component, as a paste reads them. */
async function pictures(content: string) {
  const [page] = await parseDrawio(content)
  return page!.cells.filter((cell) => cell.kind === 'vertex').map((cell) => ({ image: cell.style.image, ...cell.geometry }))
}

describe('components of picture files', () => {
  it('makes an image shape of a PNG in its natural size, fitted into 600 × 600, named after the file', async () => {
    const draft = await fileDraft(png(1920, 1080, 'Схема сети.png'), 2 * 1024 * 1024)

    expect(draft).toMatchObject({ name: 'Схема сети', preview: 'data:image/png;base64,cHJldmlldw==' })
    const [shape] = await pictures((draft as { content: string }).content)
    expect(shape).toMatchObject({ width: 600, height: 338 })
    expect(shape!.image).toMatch(/^data:image\/png;base64,/)
  })

  it('makes a vector image shape of a cleaned SVG of its size, or 64 × 64 without one', async () => {
    const svg = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" onload="alert(1)"><script>alert(1)</script><rect width="120" height="40"/></svg>'],
      'logo.svg',
      { type: 'image/svg+xml' },
    )
    const plain = new File(['<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>'], 'dot.svg', { type: '' })

    const draft = (await fileDraft(svg, 1024 * 1024)) as { name: string; content: string }
    const [shape] = await pictures(draft.content)
    expect(draft.name).toBe('logo')
    expect(shape).toMatchObject({ width: 120, height: 40 })
    const written = atob(String(shape!.image).replace('data:image/svg+xml;base64,', ''))
    expect(written).toContain('<rect')
    expect(written).not.toMatch(/script|onload/)

    const [dot] = await pictures(((await fileDraft(plain, 1024 * 1024)) as { content: string }).content)
    expect(dot).toMatchObject({ width: 64, height: 64 })
  })

  it('writes a picture of the type of its bytes, whatever the name of the file says', async () => {
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 33, 0, 64, 3, 0, 0, 0, 0, 0, 0, 0, 0])], 'photo.png', {
      type: 'image/png',
    })

    const [shape] = await pictures(((await fileDraft(jpeg, 1024)) as { content: string }).content)

    expect(shape!.image).toMatch(/^data:image\/jpeg;base64,/)
    expect(shape).toMatchObject({ width: 64, height: 33 })
  })

  it('tells why a file does not fit: its format, its size, or a broken file', async () => {
    expect(await fileDraft(new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' }), 1024)).toBe(
      'Формат не поддерживается: подходят PNG, JPEG, GIF, WebP и SVG',
    )
    expect(await fileDraft(png(10, 10), 10)).toBe('Изображение больше 1 КБ')
    expect(await fileDraft(new File(['not a png'], 'fake.png', { type: 'image/png' }), 1024)).toBe(
      'Формат не поддерживается: подходят PNG, JPEG, GIF, WebP и SVG',
    )
    expect(await fileDraft(new File(['<html/>'], 'page.svg', { type: 'image/svg+xml' }), 1024)).toBe('Файл не похож на SVG')
  })

  it('trims names and keeps them as long as the backend allows', () => {
    expect(componentName('  Шлюз   оплаты ')).toBe('Шлюз оплаты')
    expect(componentName('я'.repeat(100))).toHaveLength(80)
  })
})

describe('components of the selection', () => {
  const picture = boardImageUrl(BOARD, '0199a000-0000-7000-8000-000000000101')
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === picture ? new Response('png', { headers: { 'Content-Type': 'image/png' } }) : new Response(null, { status: 404 }),
      ),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  function editorWith(images: string[]) {
    const editor = createFakeEditor()
    const cells = images.map((image) => {
      const cell = new Cell('', new Geometry(0, 0, 100, 50), imageStyle(image) as never)
      cell.setVertex(true)
      return cell
    })
    editor.selectionComponent = vi.fn(() => ({ cells, image: { svg: '<svg/>', width: 100, height: 50, cellIds: null }, name: 'Логотип' }))
    return editor
  }

  it('writes the pictures of the board into the component, so that it shows them without the board', async () => {
    const draft = (await selectionDraft(editorWith([picture, 'https://example.com/a.png'])))!

    expect(draft.name).toBe('Логотип')
    expect(draft.preview).toBe('data:image/png;base64,c2VsZWN0aW9u')
    expect((await pictures(draft.content)).map((shape) => shape.image)).toEqual([
      `data:image/png;base64,${btoa('png')}`,
      'https://example.com/a.png',
    ])
  })

  it('cleans the SVG pictures of the selection, e.g. of a file of draw.io, as the backend expects them', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject><rect width="10" height="10"/></svg>'
    const encoded = `data:image/svg+xml,${encodeURIComponent(svg)}`

    const [shape] = await pictures((await selectionDraft(editorWith([encoded])))!.content)

    const written = atob(String(shape!.image).replace('data:image/svg+xml;base64,', ''))
    expect(written).toContain('<rect')
    expect(written).not.toContain('foreignObject')
  })

  it('fails for a picture at an address that a library does not keep, e.g. a stencil of draw.io', async () => {
    await expect(selectionDraft(editorWith(['img/lib/azure2/compute/VM.svg']))).rejects.toBeInstanceOf(OutsidePicturesError)
  })

  it('takes the given name, and fails when a picture of the board cannot be downloaded', async () => {
    expect((await selectionDraft(editorWith([]), ' Мой  компонент '))!.name).toBe('Мой компонент')
    await expect(selectionDraft(editorWith([boardImageUrl(BOARD, '0199a000-0000-7000-8000-000000000999')]))).rejects.toBeInstanceOf(
      MissingPicturesError,
    )
    expect(await selectionDraft(createFakeEditor())).toBeNull()
  })
})
