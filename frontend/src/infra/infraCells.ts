import { layoutShapes, type LayoutEngine, type LayoutShape } from '../diagram/layout.ts'
import type { CellData } from '../diagram/model.ts'
import { findShape, type ShapePreset, type ShapeStyle } from '../diagram/shapes.ts'
import { SOURCE_KEY } from '../diagram/sources.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import type { InfraGraph, InfraNode } from './infraGraph.ts'

/** Width of text estimated from its length, where the canvas cannot measure it; 16 px a line of the default font. */
const CHAR_WIDTH = 7.5
const LINE_HEIGHT = 16
/** The widest shape a label widens: a longer line of an image runs past its sides. */
const MAX_WIDTH = 560

/** A shape whose label is written under it, as «Топик событий» and «Хранилище объектов». */
const captionBelow = (preset: ShapePreset) => preset.style.verticalLabelPosition === 'bottom'

const textWidth = (lines: string[]) => Math.ceil(Math.max(...lines.map((line) => line.length)) * CHAR_WIDTH)

/** The depth of the top and the right side of a `cube`; see `CubeShape` of `diagram/extensions.ts`. */
const CUBE_DEPTH = 20

/** The width of the small boxes on the left side of a UML `component`, with room between them and the label. */
const COMPONENT_BOXES = 24

/** The end of a `cylinder` that its label keeps clear of: a fifth of its length, as maxGraph draws it, 40 px at most. */
const cylinderEnd = (length: number) => Math.min(40, Math.round(length / 5))

interface Measured {
  /** The size of the shape, and the keys of its style that keep the label on its front. */
  shape: { width: number; height: number; style?: ShapeStyle }
  /** The size the shape takes in the layout, with a label written under it. */
  box: { width: number; height: number }
}

/** The size of the shape of a node, wide and tall enough for its label, but no smaller than in the palette. */
function measure(node: InfraNode): Measured {
  const preset = findShape(node.shape)!
  const text = { width: textWidth(node.lines) + 32, height: node.lines.length * LINE_HEIGHT + 20 }
  if (captionBelow(preset)) {
    const shape = { width: preset.width, height: preset.height }
    return { shape, box: { width: Math.max(shape.width, text.width - 32), height: shape.height + text.height - 16 } }
  }
  const fit = (width: number, height: number, style?: ShapeStyle): Measured => {
    const shape = { width: Math.min(MAX_WIDTH, Math.max(preset.width, width)), height: Math.max(preset.height, height), style }
    return { shape, box: shape }
  }
  // The label of a component keeps clear of the two small boxes on its left side.
  if (preset.style.shape === 'component') return fit(text.width + COMPONENT_BOXES, text.height, { spacingLeft: COMPONENT_BOXES })
  // The label of a cube is on its front, below its top and left of its right side.
  if (preset.style.shape === 'cube') {
    return fit(text.width + CUBE_DEPTH, text.height + CUBE_DEPTH, { spacingTop: CUBE_DEPTH, spacingRight: CUBE_DEPTH })
  }
  // The label of a cylinder keeps clear of its top, which is on the right of a cylinder lying on its side.
  if (preset.style.shape === 'cylinder') {
    const lying = preset.style.direction === 'south'
    const length = Math.ceil(((lying ? text.width : text.height) * 5) / 3)
    const measured = lying ? fit(length, text.height) : fit(text.width, length)
    const end = cylinderEnd(lying ? measured.shape.width : measured.shape.height)
    measured.shape.style = lying ? { spacingRight: end } : { spacingTop: end }
    return measured
  }
  return fit(text.width, text.height)
}

/**
 * Cells of the graph laid out along its edges in its direction, from left to right by default, with the top-left corner
 * at `origin`: a shape of the palette per node, a frame around the nodes of each frame, drawn under them, and an edge
 * per link.
 */
export async function infraCells(
  graph: InfraGraph,
  origin: { x: number; y: number },
  engine?: () => Promise<LayoutEngine>,
  sourcePrefix?: string,
): Promise<CellData[]> {
  const builder = new DiagramBuilder()
  const frames = graph.frames.map((frame) => builder.shape(frame.shape, 0, 0, { value: frame.label }))
  const sizes = graph.nodes.map(measure)
  const nodes = graph.nodes.map((node, index) => builder.shape(node.shape, 0, 0, { value: node.lines.join('\n'), ...sizes[index]!.shape }))
  const sourceMarks = new Map<string, string>()
  for (const edge of graph.edges) {
    const id = builder.edge(nodes[edge.source]!, nodes[edge.target]!, { value: edge.label })
    if (sourcePrefix) sourceMarks.set(id, `${sourcePrefix}:edge:${graph.nodes[edge.source]!.lines[0]}->${graph.nodes[edge.target]!.lines[0]}:${edge.label}`)
  }
  const cells = builder.build()
  if (sourcePrefix) {
    const byId = new Map(cells.map((cell) => [cell.id, cell]))
    graph.frames.forEach((frame, index) => sourceMarks.set(frames[index]!, `${sourcePrefix}:frame:${frame.label}`))
    graph.nodes.forEach((node, index) => sourceMarks.set(nodes[index]!, `${sourcePrefix}:node:${node.lines[0]}`))
    for (const [id, source] of sourceMarks) {
      const cell = byId.get(id)
      if (cell) cell.style = { ...cell.style, [SOURCE_KEY]: source }
    }
  }

  const shapes: LayoutShape[] = [
    ...frames.map((id) => ({ id, x: 0, y: 0, width: 0, height: 0, frame: true, parent: null })),
    ...graph.nodes.map((node, index) => ({
      id: nodes[index]!,
      x: 0,
      y: 0,
      ...sizes[index]!.box,
      frame: false,
      parent: node.frame === null ? null : frames[node.frame]!,
    })),
  ]
  const boxes = await layoutShapes(
    shapes,
    graph.edges.map((edge, index) => ({
      id: `edge-${index}`,
      source: nodes[edge.source]!,
      target: nodes[edge.target]!,
      ...(edge.label && { label: { width: textWidth([edge.label]) + 8, height: LINE_HEIGHT } }),
    })),
    graph.direction ?? 'right',
    engine,
  )
  const byId = new Map(cells.map((cell) => [cell.id, cell]))
  for (const id of frames) {
    const box = boxes.get(id)
    if (box) byId.get(id)!.geometry = { ...box, x: box.x + origin.x, y: box.y + origin.y }
  }
  graph.nodes.forEach((_, index) => {
    const cell = byId.get(nodes[index]!)!
    const box = boxes.get(cell.id)
    if (!box) return
    // A shape with its label under it stands at the middle of the top of its box.
    const { width } = sizes[index]!.shape
    cell.geometry = { ...cell.geometry!, x: Math.round(box.x + (box.width - width) / 2) + origin.x, y: box.y + origin.y }
  })
  return cells
}
