import { ImageExport, SvgCanvas2D, type Cell, type Graph } from '@maxgraph/core'
import { linkOf, parseLink } from './links.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** An image of cells of the canvas. */
export interface ExportedImage {
  /** The SVG document as text. */
  svg: string
  /** Size of the image in pixels at 100%. */
  width: number
  height: number
  /** Ids of the drawn cells of the page, without their descendants; `null` when the whole page is drawn. */
  cellIds: string[] | null
}

export interface SvgOptions {
  /** No background: what is not a shape stays transparent. */
  transparent?: boolean
  /**
   * Elements with a link to an address or to a board are links of the image, which viewers of SVG and PDF open in a new
   * window. Links to pages of the board are not: an image has no pages.
   */
  links?: boolean
}

/** Margin around the cells in an image, in pixels at 100%. */
export const IMAGE_BORDER = 10

/** Background of images: what the canvas shows under the diagram. */
export const IMAGE_BACKGROUND = '#ffffff'

/**
 * Draws `cells` with their descendants, in the given order, into an SVG document at 100% with a margin, whatever the
 * zoom and scroll of the canvas. maxGraph draws them with the code that draws the canvas, so custom shapes and markers
 * look the same, with the badges of the logos of their technologies; nothing else of the canvas (grid, handles, connection
 * points) is drawn. `null` when there is nothing.
 */
export function renderSvg(
  graph: Graph,
  cells: Cell[],
  { transparent = false, links = false }: SvgOptions = {},
): Omit<ExportedImage, 'cellIds'> | null {
  const view = graph.getView()
  const bounds = cells.length > 0 ? graph.getBoundingBox(cells) : null
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
  const scale = view.scale
  const border = IMAGE_BORDER
  const width = Math.ceil(bounds.width / scale + 2 * border)
  const height = Math.ceil(bounds.height / scale + 2 * border)

  // The serializer writes the namespace of the root as its `xmlns`.
  const root = document.createElementNS(SVG_NS, 'svg')
  root.setAttribute('version', '1.1')
  root.setAttribute('width', String(width))
  root.setAttribute('height', String(height))
  root.setAttribute('viewBox', `0 0 ${width} ${height}`)
  if (!transparent) {
    // Of the size of the image, in numbers: renderers of PDF do not resolve percentages.
    const backdrop = document.createElementNS(SVG_NS, 'rect')
    backdrop.setAttribute('width', String(width))
    backdrop.setAttribute('height', String(height))
    backdrop.setAttribute('fill', IMAGE_BACKGROUND)
    root.append(backdrop)
  }
  const content = document.createElementNS(SVG_NS, 'g')
  root.append(content)
  // Text measuring (e.g. backgrounds of edge labels) needs the elements in the page; hidden while drawing.
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;overflow:hidden;width:0;height:0'
  host.append(root)
  document.body.append(host)
  try {
    const canvas = new SvgCanvas2D(content, false)
    canvas.pointerEvents = false
    // Clips of labels and gradients refer to the image itself, not to the address of the board, which a saved file
    // and the PDF do not have.
    canvas.getBaseUrl = () => ''
    // Shapes scale the canvas by the zoom of the view and draw in coordinates without it: undo the zoom,
    // and move the top-left corner of the cells to the margin.
    canvas.scale(1 / scale)
    canvas.translate(border - bounds.x / scale, border - bounds.y / scale)
    const painter = new ImageExport()
    // The overlays of the shapes are the badges of the logos of their technologies (see `iconBadges.ts`).
    painter.includeOverlays = true
    if (links) painter.getLinkForCellState = (state) => imageLinkOf(state.cell)
    for (const cell of cells) {
      const state = view.getState(cell)
      if (state) painter.drawState(state, canvas)
    }
    // maxGraph writes the address as `xlink:href`, which old programs read; SVG 2 and the PDF renderer read `href`.
    for (const anchor of Array.from(content.getElementsByTagNameNS(SVG_NS, 'a'))) {
      anchor.setAttribute('href', anchor.getAttributeNS(XLINK_NS, 'href') ?? '')
      anchor.setAttribute('target', '_blank')
      anchor.setAttribute('rel', 'noopener noreferrer')
    }
  } finally {
    host.remove()
  }
  return { svg: new XMLSerializer().serializeToString(root), width, height }
}

/** The address that an element is a link to in an image: of a link to an address or a board, `null` for any other. */
function imageLinkOf(cell: Cell): string | null {
  const link = parseLink(linkOf(cell.getStyle()))
  return link && link.kind !== 'page' ? link.url : null
}

/**
 * Puts a diagram of draw.io into the `content` attribute of the root of an SVG image, as draw.io does for `.drawio.svg`
 * files: CoDraw and draw.io open the image for editing.
 */
export function embedDiagram(svg: string, diagramXml: string): string {
  const image = new DOMParser().parseFromString(svg, 'image/svg+xml')
  image.documentElement.setAttribute('content', diagramXml)
  return new XMLSerializer().serializeToString(image)
}
