import type { jsPDF } from 'jspdf'
import * as Y from 'yjs'
import type { DiagramEditor } from '../diagram/editor.ts'
import { isPageEmpty, listPages, type PageInfo } from '../diagram/pages.ts'
import type { LayerViews } from '../diagram/layerViews.ts'
import { renderPage } from '../diagram/renderPage.ts'
import type { ExportedImage, SvgOptions } from '../diagram/svgExport.ts'
import { PDF_FONT_NAMES, pdfFont, pdfFontFile, pdfFontStyle, type PdfFont, type PdfFontStyle } from './pdfFonts.ts'

/** The longest side of a page of a PDF, in points: Acrobat does not open larger pages. */
export const MAX_PDF_SIDE = 14_400

/** An image that becomes a page of a PDF. */
export type PdfImage = Pick<ExportedImage, 'svg' | 'width' | 'height'>

/**
 * Size of the page of a PDF, in points, for an image of `width` × `height` pixels at 100%: a point a pixel, smaller
 * in proportion when the longest side would exceed {@link MAX_PDF_SIDE}.
 */
export function pdfPageSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_PDF_SIDE / Math.max(width, height))
  return { width: width * scale, height: height * scale }
}

/** The pages of the board with objects, in their order: the pages of a PDF of the whole board. */
export function pdfPages(doc: Y.Doc): PageInfo[] {
  return listPages(doc).filter((page) => !isPageEmpty(doc, page.id))
}

/**
 * Images of the pages of a PDF of the whole board, see {@link pdfPages}. The page of the editor is drawn by the editor,
 * as for the other buttons of the export; the others are drawn out of sight once their edges are routed, with the layers
 * the participant shows on them (`layerViews`) and in the view of the plan of the editor.
 */
export async function boardImages(
  doc: Y.Doc,
  editor: DiagramEditor,
  options: SvgOptions = {},
  layerViews: LayerViews | null = null,
): Promise<ExportedImage[]> {
  const images: ExportedImage[] = []
  const view = editor.getState().plan.view
  for (const page of pdfPages(doc)) {
    const image =
      page.id === editor.pageId
        ? editor.exportSvg(options)
        : await renderPage(doc, page.id, options, layerViews?.page(page.id) ?? null, view)
    if (image) images.push(image)
  }
  return images
}

/** A face of the embedded fonts. */
interface Face {
  font: PdfFont
  style: PdfFontStyle
}

/** A line of a label, the face it is drawn with and how it is aligned. */
interface TextLine {
  element: Element
  text: string
  face: Face
  size: number
  anchor: string
}

/** The value of a presentation attribute of an element, set on it or on the nearest element around it that has one. */
const inherited = (element: Element, name: string) => element.closest(`[${name}]`)?.getAttribute(name) ?? null

/** The face of the embedded fonts that stands for the font an element inherits. */
const faceOf = (element: Element): Face => ({
  font: pdfFont(inherited(element, 'font-family') ?? ''),
  style: pdfFontStyle(inherited(element, 'font-weight'), inherited(element, 'font-style')),
})

/**
 * The elements of an image that set a font, and its texts, with the faces of the embedded fonts that draw them. All
 * of them get these faces, so that the PDF renderer never falls back to the standard fonts of PDF, which have no
 * Cyrillic.
 */
const fontedElements = (svg: Element) =>
  Array.from(svg.querySelectorAll('[font-family], [font-weight], [font-style], text'), (element) => ({ element, face: faceOf(element) }))

/**
 * The lines of the labels of an image. maxGraph writes a `<text>` a line, with the font on the group around; text with
 * parts of its own or with a position for each letter is left to the PDF renderer as it is.
 */
function textLines(svg: Element): TextLine[] {
  return Array.from(svg.querySelectorAll('text'))
    .filter((element) => element.childElementCount === 0 && !/[\s,]/.test(element.getAttribute('x')?.trim() ?? ''))
    .map((element) => ({
      element,
      // White space as the PDF renderer treats it: no line breaks, tabs as spaces, no repeated spaces at the ends.
      text: (element.textContent ?? '').replace(/[\n\r]/g, '').replace(/\t/g, ' ').trim().replace(/ +/g, ' '),
      face: faceOf(element),
      // 16px is the default size of SVG text, which maxGraph always sets anyway.
      size: parseFloat(inherited(element, 'font-size') ?? '') || 16,
      anchor: inherited(element, 'text-anchor') ?? 'start',
    }))
}

/** Reads a font file of the build into the binary string that jsPDF takes. */
async function loadFont(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`The font ${url} was not loaded: ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  return binary
}

/** Embeds the faces into the PDF, each file loaded once; jsPDF keeps only the letters it draws. */
async function embedFonts(pdf: jsPDF, faces: Face[]) {
  const unique = new Map(faces.map((face) => [`${face.font} ${face.style}`, face]))
  const files = await Promise.all(
    Array.from(unique.values(), async (face) => ({ ...face, data: await loadFont(pdfFontFile(face.font, face.style)) })),
  )
  for (const { font, style, data } of files) {
    const file = `${PDF_FONT_NAMES[font]}-${style}.ttf`
    pdf.addFileToVFS(file, data)
    pdf.addFont(file, PDF_FONT_NAMES[font], style, undefined, 'Identity-H')
  }
}

/** Sets the font of an element, and so of what it holds, to a face of the embedded fonts. */
function setFace(element: Element, { font, style }: Face) {
  element.setAttribute('font-family', PDF_FONT_NAMES[font])
  element.setAttribute('font-weight', style === 'bold' || style === 'bolditalic' ? 'bold' : 'normal')
  element.setAttribute('font-style', style === 'italic' || style === 'bolditalic' ? 'italic' : 'normal')
}

/**
 * Puts the start of a centred or right-aligned line where the line begins. The PDF renderer would measure the line
 * with the fonts of the browser, which the embedded fonts only stand for, so it is measured with the face that draws
 * it.
 */
function alignLine(pdf: jsPDF, { element, text, face, size, anchor }: TextLine) {
  if (anchor === 'middle' || anchor === 'end') {
    pdf.setFont(PDF_FONT_NAMES[face.font], face.style)
    pdf.setFontSize(size)
    const width = pdf.getTextWidth(text)
    const x = parseFloat(element.getAttribute('x') ?? '0') || 0
    element.setAttribute('x', String(x - (anchor === 'middle' ? width / 2 : width)))
  }
  element.setAttribute('text-anchor', 'start')
}

const orientation = ({ width, height }: { width: number; height: number }) => (width > height ? 'landscape' : 'portrait')

/**
 * A vector PDF with a page for each image, in their order, each the size of its image (see {@link pdfPageSize}).
 * Shapes stay lines and labels stay text in fonts embedded with the letters they use, so Cyrillic shows wherever the
 * file opens. jsPDF and svg2pdf.js, and the files of the fonts, load with the first PDF.
 */
export async function imagesToPdf(images: PdfImage[]): Promise<Blob> {
  if (images.length === 0) throw new Error('A PDF needs at least one page')
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
  const pages = images.map((image) => ({
    ...pdfPageSize(image.width, image.height),
    svg: document.importNode(new DOMParser().parseFromString(image.svg, 'image/svg+xml').documentElement, true),
  }))
  // Faces are read before any element changes: each depends on the elements around it.
  const fonted = pages.flatMap((page) => fontedElements(page.svg))
  const lines = pages.flatMap((page) => textLines(page.svg))
  const pdf = new jsPDF({
    unit: 'pt',
    format: [pages[0]!.width, pages[0]!.height],
    orientation: orientation(pages[0]!),
    compress: true,
    putOnlyUsedFonts: true,
  })
  await embedFonts(pdf, fonted.map(({ face }) => face))
  fonted.forEach(({ element, face }) => setFace(element, face))
  lines.forEach((line) => alignLine(pdf, line))
  // The PDF renderer starts each page in the style jsPDF has, which it takes to be the normal one.
  pdf.setFont('times', 'normal')

  // Drawn in the page, out of sight, as the image itself was.
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;overflow:hidden;width:0;height:0'
  document.body.append(host)
  try {
    for (const [index, page] of pages.entries()) {
      if (index > 0) pdf.addPage([page.width, page.height], orientation(page))
      host.replaceChildren(page.svg)
      // Images of the diagram are data; files from elsewhere would not show in the PNG either.
      await svg2pdf(page.svg, pdf, { x: 0, y: 0, width: page.width, height: page.height, loadImages: /^data:/i })
    }
  } finally {
    host.remove()
  }
  return pdf.output('blob')
}
