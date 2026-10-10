import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from '../diagram/editor.ts'
import { DEFAULT_PAGE_ID, initializeDocument } from '../diagram/model.ts'
import { addPage } from '../diagram/pages.ts'
import type { ExportedImage, SvgOptions } from '../diagram/svgExport.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { NO_FILTER } from '../diagram/pageFilter.ts'
import { boardImages, imagesToPdf, MAX_PDF_SIDE, pdfPages, pdfPageSize } from './pdf.ts'
import { pdfFontFile } from './pdfFonts.ts'
import sansRegular from './pdfFonts/LiberationSans-Regular.ttf?inline'
import serifBold from './pdfFonts/LiberationSerif-Bold.ttf?inline'

/** A board with a page for each list of labels of shapes; a page without labels stays empty. */
function board(...pages: { name: string; labels: string[]; style?: Record<string, string | number> }[]) {
  const doc = new Y.Doc()
  initializeDocument(doc)
  const ids = pages.map((page, index) => (index === 0 ? DEFAULT_PAGE_ID : addPage(doc, null, page.name)))
  pages.forEach(({ labels, style }, index) => {
    if (labels.length === 0) return
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { pageId: ids[index] })
    const builder = new DiagramBuilder()
    labels.forEach((value, at) => builder.shape('rectangle', at * 200, at * 50, { value, width: 120, height: 60, style }))
    editor.insertCells(builder.build())
    editor.destroy()
    container.remove()
  })
  return { doc, ids }
}

describe('PDF pages', () => {
  it('makes a point of a pixel, and the longest side no longer than a PDF allows', () => {
    expect(pdfPageSize(300, 200)).toEqual({ width: 300, height: 200 })
    expect(pdfPageSize(28_800, 2000)).toEqual({ width: MAX_PDF_SIDE, height: 1000 })
    expect(pdfPageSize(1000, 20_000)).toEqual({ width: 720, height: MAX_PDF_SIDE })
  })

  it('takes the pages of the board with objects, in their order', () => {
    const { doc, ids } = board(
      { name: 'Контейнеры', labels: ['Сервис'] },
      { name: 'Пусто', labels: [] },
      { name: 'Данные', labels: ['База'] },
    )

    expect(pdfPages(doc).map((page) => page.id)).toEqual([ids[0], ids[2]])
  })

  it('has the editor draw its page and draws the others out of sight', async () => {
    const { doc, ids } = board({ name: 'Контейнеры', labels: ['Сервис'] }, { name: 'Данные', labels: ['База'] })
    const editor = createFakeEditor({ pageId: ids[1] })
    const drawn: ExportedImage = { svg: '<svg/>', width: 10, height: 10, cellIds: null }
    vi.mocked(editor.exportSvg).mockReturnValue(drawn)

    const images = await boardImages(doc, editor, { transparent: true })

    expect(images).toHaveLength(2)
    expect(images[0]!.svg).toContain('Сервис')
    expect(images[0]!.svg).toMatch(/<svg[^>]*><g>/)
    expect(images[1]).toBe(drawn)
    expect(editor.exportSvg).toHaveBeenCalledWith({ transparent: true, onlyVisible: false })
  })

  it('draws only what matches the filter of the canvas on every page with only the visible', async () => {
    const { doc, ids } = board({ name: 'Контейнеры', labels: ['Сервис', 'Склад'] }, { name: 'Данные', labels: ['База'] })
    const editor = createFakeEditor({ pageId: ids[1] })
    vi.mocked(editor.exportSvg).mockReturnValue({ svg: '<svg/>', width: 10, height: 10, cellIds: null })
    vi.mocked(editor.currentFilter).mockReturnValue({ ...NO_FILTER, kinds: ['service'] })

    const images = await boardImages(doc, editor, { onlyVisible: true })

    expect(editor.exportSvg).toHaveBeenCalledWith({ onlyVisible: true })
    // The other page shows its shapes of the kind chosen: none of the plain rectangles of this board.
    expect(images).toHaveLength(1)
  })
})

describe('PDF of images', () => {
  const editors: DiagramEditor[] = []
  let fetched: string[]

  beforeEach(() => {
    fetched = []
    // jsdom measures no text; the PDF measures its lines with its own fonts anyway.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    })
    // The files of the fonts, as the build serves them.
    const files = new Map([
      [pdfFontFile('sans', 'normal'), sansRegular],
      [pdfFontFile('serif', 'bold'), serifBold],
    ])
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url)
      const data = files.get(url)
      if (!data) return new Response(null, { status: 404 })
      return new Response(Uint8Array.from(atob(data.split(',')[1]!), (char) => char.charCodeAt(0)))
    })
  })

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (SVGElement.prototype as { getBBox?: unknown }).getBBox
  })

  /** The image of a page with shapes with the labels, as the export draws it. */
  function image(labels: string[], style?: Record<string, string | number>, options?: SvgOptions): ExportedImage {
    const { doc } = board({ name: 'Страница', labels, style })
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc)
    editors.push(editor)
    return editor.exportSvg(options)!
  }

  /** The text of a PDF file with its streams inflated. */
  async function pdfText(blob: Blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const raw = new TextDecoder('latin1').decode(bytes)
    const streams = await Promise.all(
      Array.from(raw.matchAll(/<<([^<>]*\/FlateDecode[^<>]*)>>\s*stream\r?\n/g), async (match) => {
        const start = match.index + match[0].length
        const length = Number(/\/Length (\d+)/.exec(match[1]!)![1])
        const inflated = new Response(bytes.slice(start, start + length)).body!.pipeThrough(new DecompressionStream('deflate'))
        return new TextDecoder('latin1').decode(await new Response(inflated).arrayBuffer())
      }),
    )
    return { raw, streams }
  }

  it('makes a page of each image, of its size', async () => {
    const first = image(['Сервис', 'База'])
    const second = image(['Очередь'])

    const pdf = await imagesToPdf([first, second])

    expect(pdf.type).toBe('application/pdf')
    const { raw } = await pdfText(pdf)
    expect(raw.match(/\/Type \/Page\b(?!s)/g)).toHaveLength(2)
    const boxes = Array.from(raw.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g), ([, width, height]) => [Number(width), Number(height)])
    expect(boxes).toEqual([
      [first.width, first.height],
      [second.width, second.height],
    ])
  })

  it('embeds the fonts of the labels only, with the letters they use, and keeps the labels text', async () => {
    const pdf = await imagesToPdf([image(['Сервис']), image(['Платежи'], { fontFamily: 'Georgia', fontStyle: 1 })])

    expect(fetched).toEqual([pdfFontFile('sans', 'normal'), pdfFontFile('serif', 'bold')])
    const { raw, streams } = await pdfText(pdf)
    expect(raw.match(/\/FontFile2/g)).toHaveLength(2)
    // No text falls back to the standard fonts, which have no Cyrillic.
    expect(raw).not.toMatch(/\/BaseFont \/(Helvetica|Courier|Times-(Bold|Italic))/)
    // Glyphs of the letters map back to them: «С» of «Сервис» and «П» of «Платежи».
    const unicode = streams.filter((stream) => stream.includes('beginbfchar') || stream.includes('beginbfrange')).join('\n')
    expect(unicode).toMatch(/<0421>/i)
    expect(unicode).toMatch(/<041F>/i)
    // A font subset, not the whole file of 400 KB.
    expect(pdf.size).toBeLessThan(100_000)
  })

  it('puts centred labels where they begin, measured with the embedded font', async () => {
    const page = image(['Сервис'])
    const x = Number(/<text x="([\d.]+)"/.exec(page.svg)![1])

    const pdf = await imagesToPdf([page])

    // The page draws the text from its start, left of the centre of the shape by half its width: «Сервис» in Arial of
    // 13px is about 45 wide.
    const { streams } = await pdfText(pdf)
    const [, start] = streams.map((stream) => / ([\d.]+) [\d.]+ Tm\s*<[0-9a-f]+> Tj/i.exec(stream)).find(Boolean)!
    expect(x - Number(start)).toBeCloseTo(22.5, -0.5)
  })

  it('draws the gradient as a shading, the shadow translucent and the rounded corners as curves', async () => {
    const plain = await pdfText(await imagesToPdf([image(['Сервис'])]))
    const styled = await pdfText(
      await imagesToPdf([image(['Сервис'], { gradientColor: '#ffffff', gradientDirection: 'east', shadow: 1, rounded: 1, arcSize: 30 })]),
    )

    expect(plain.raw).not.toMatch(/\/ShadingType 2/)
    expect(plain.raw).not.toMatch(/\/ca 0\.25/)
    expect(styled.raw).toMatch(/\/ShadingType 2/)
    expect(styled.raw).toMatch(/\/ca 0\.25/)
    const curves = (streams: string[]) => streams.join('\n').match(/ c\n/g)?.length ?? 0
    expect(curves(styled.streams)).toBeGreaterThan(curves(plain.streams))
  })

  it('makes an element with a link to an address a link of the page', async () => {
    const pdf = await imagesToPdf([image(['Документация'], { link: 'https://docs.example.com/payments' }, { links: true })])

    const { raw } = await pdfText(pdf)
    expect(raw).toMatch(/\/Subtype \/Link/)
    expect(raw).toContain('/URI (https://docs.example.com/payments)')
  })

  it('fails when a font cannot be loaded', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 503 }))

    await expect(imagesToPdf([image(['Сервис'])])).rejects.toThrow()
  })
})
