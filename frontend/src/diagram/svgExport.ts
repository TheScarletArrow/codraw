import { ImageExport, SvgCanvas2D, type Cell, type Graph } from '@maxgraph/core'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** An image of cells of the canvas. */
export interface ExportedImage {
  /** The SVG document as text. */
  svg: string
  /** Size of the image in pixels at 100%. */
  width: number
  height: number
}

/** Margin around the cells in an image, in pixels at 100%. */
export const IMAGE_BORDER = 10

/** Background of images: what the canvas shows under the diagram. */
export const IMAGE_BACKGROUND = '#ffffff'

/**
 * Draws `cells` with their descendants, in the given order, into an SVG document at 100% with a margin and a white
 * background, whatever the zoom and scroll of the canvas. maxGraph draws them with the code that draws the canvas, so custom shapes and markers look
 * the same; nothing else of the canvas (grid, handles, connection points) is drawn. `null` when there is nothing.
 */
export function renderSvg(graph: Graph, cells: Cell[]): ExportedImage | null {
  const view = graph.getView()
  const bounds = cells.length > 0 ? graph.getBoundingBox(cells) : null
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
  const scale = view.scale
  const border = IMAGE_BORDER
  const width = Math.ceil(bounds.width / scale + 2 * border)
  const height = Math.ceil(bounds.height / scale + 2 * border)

  const root = document.createElementNS(SVG_NS, 'svg')
  root.setAttribute('xmlns', SVG_NS)
  root.setAttribute('version', '1.1')
  root.setAttribute('width', String(width))
  root.setAttribute('height', String(height))
  root.setAttribute('viewBox', `0 0 ${width} ${height}`)
  const backdrop = document.createElementNS(SVG_NS, 'rect')
  backdrop.setAttribute('width', '100%')
  backdrop.setAttribute('height', '100%')
  backdrop.setAttribute('fill', IMAGE_BACKGROUND)
  root.append(backdrop)
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
    // Shapes scale the canvas by the zoom of the view and draw in coordinates without it: undo the zoom,
    // and move the top-left corner of the cells to the margin.
    canvas.scale(1 / scale)
    canvas.translate(border - bounds.x / scale, border - bounds.y / scale)
    const painter = new ImageExport()
    for (const cell of cells) {
      const state = view.getState(cell)
      if (state) painter.drawState(state, canvas)
    }
  } finally {
    host.remove()
  }
  return { svg: new XMLSerializer().serializeToString(root), width, height }
}
