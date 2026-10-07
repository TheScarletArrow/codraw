import type { ElkExtendedEdge, ElkNode, LayoutOptions } from 'elkjs/lib/elk-api'

/** Where a layout puts the shapes connected by an edge: the source left of the target, or above it. */
export type LayoutDirection = 'right' | 'down'

export interface LayoutBox {
  x: number
  y: number
  width: number
  height: number
}

/** A shape to lay out: a shape, a table or a group of the page, in page coordinates. */
export interface LayoutShape extends LayoutBox {
  id: string
  /** A frame holds the shapes whose centres lie inside it, and is resized around them. */
  frame: boolean
  /** The frame the shape is in, when it is known rather than found from where the shapes are, e.g. for a new diagram. */
  parent?: string | null
}

/** An edge between two shapes to lay out, its ends already lifted to them. */
export interface LayoutEdge {
  id: string
  source: string
  target: string
  /** The size of the label of the edge: the layout keeps room for it between the layers it joins. */
  label?: { width: number; height: number }
}

/** Lays out the graph of ELK; the default loads ELK on first use. */
export type LayoutEngine = (graph: ElkNode) => Promise<ElkNode>

/** Space between the edge of a frame and its shapes; the top leaves room for its caption. */
export const FRAME_PADDING = { top: 40, left: 20, bottom: 20, right: 20 }

/** Space between two layers of shapes along the direction of the layout. */
const BETWEEN_LAYERS = 80

const SPACING: LayoutOptions = {
  'elk.spacing.nodeNode': '40',
  'elk.layered.spacing.nodeNodeBetweenLayers': String(BETWEEN_LAYERS),
  'elk.spacing.componentComponent': '60',
}

/** Room around a label between the shapes of its edge. */
const LABEL_MARGIN = 8

/**
 * The label of ELK that keeps room for the label of an edge, or none when the label fits the space between layers.
 * ELK puts such a label into a layer of its own, with the space between layers on both sides: the label of ELK is that
 * much shorter than the label it keeps room for. ELK leaves out labels without text, which this one never shows.
 */
function roomForLabel(edge: LayoutEdge, direction: LayoutDirection) {
  if (!edge.label) return null
  const { width, height } = edge.label
  const length = (direction === 'right' ? width : height) + 2 * LABEL_MARGIN
  if (length <= BETWEEN_LAYERS) return null
  const room = Math.max(1, length - 2 * BETWEEN_LAYERS)
  return { id: `${edge.id}:label`, text: edge.id, ...(direction === 'right' ? { width: room, height } : { width, height: room }) }
}

const area = (box: LayoutBox) => box.width * box.height

const holds = (frame: LayoutBox, shape: LayoutBox) => {
  const x = shape.x + shape.width / 2
  const y = shape.y + shape.height / 2
  return x >= frame.x && x <= frame.x + frame.width && y >= frame.y && y <= frame.y + frame.height
}

/** The frame each shape is in: the one it names, else the smallest frame larger than the shape that holds its centre. */
export function frameParents(shapes: LayoutShape[]): Map<string, string | null> {
  const frames = shapes.filter((shape) => shape.frame).sort((a, b) => area(a) - area(b))
  return new Map(
    shapes.map((shape) => [
      shape.id,
      shape.parent !== undefined
        ? shape.parent
        : (frames.find((frame) => frame.id !== shape.id && area(frame) > area(shape) && holds(frame, shape))?.id ?? null),
    ]),
  )
}

/** The graph of ELK for the shapes and edges: frames with shapes become compound nodes, edges go to their lowest frame. */
export function layoutGraph(shapes: LayoutShape[], edges: LayoutEdge[], direction: LayoutDirection): ElkNode {
  const parents = frameParents(shapes)
  const nodes = new Map<string, ElkNode>(shapes.map((shape) => [shape.id, { id: shape.id, width: shape.width, height: shape.height }]))
  const root: ElkNode = {
    id: 'codraw:root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction === 'right' ? 'RIGHT' : 'DOWN',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      ...SPACING,
    },
    children: [],
    edges: [],
  }
  for (const shape of shapes) {
    const parentId = parents.get(shape.id)
    const parent = parentId ? nodes.get(parentId)! : root
    parent.children = [...(parent.children ?? []), nodes.get(shape.id)!]
  }
  // A frame with shapes takes its size from them; spacing applies inside each compound node of its own.
  for (const node of nodes.values()) {
    if (!node.children?.length) continue
    delete node.width
    delete node.height
    const { top, left, bottom, right } = FRAME_PADDING
    node.layoutOptions = { 'elk.padding': `[top=${top},left=${left},bottom=${bottom},right=${right}]`, ...SPACING }
  }

  const ancestors = (id: string) => {
    const chain: string[] = []
    for (let current = parents.get(id) ?? null; current; current = parents.get(current) ?? null) chain.push(current)
    return chain
  }
  for (const edge of edges) {
    if (edge.source === edge.target || !nodes.has(edge.source) || !nodes.has(edge.target)) continue
    const sourceAncestors = ancestors(edge.source)
    const targetAncestors = ancestors(edge.target)
    // An edge from a frame to a shape inside it has no place in the layers.
    if (sourceAncestors.includes(edge.target) || targetAncestors.includes(edge.source)) continue
    const common = sourceAncestors.find((id) => targetAncestors.includes(id))
    const container = common ? nodes.get(common)! : root
    const elkEdge: ElkExtendedEdge = { id: edge.id, sources: [edge.source], targets: [edge.target] }
    const label = roomForLabel(edge, direction)
    if (label) elkEdge.labels = [label]
    container.edges = [...(container.edges ?? []), elkEdge]
  }
  return root
}

/** The boxes of the laid out graph in page coordinates, shifted so that their top-left corner stays at `origin`. */
export function layoutBoxes(graph: ElkNode, origin: { x: number; y: number }): Map<string, LayoutBox> {
  const boxes = new Map<string, LayoutBox>()
  const collect = (node: ElkNode, offsetX: number, offsetY: number) => {
    for (const child of node.children ?? []) {
      const x = offsetX + (child.x ?? 0)
      const y = offsetY + (child.y ?? 0)
      boxes.set(child.id, { x, y, width: child.width ?? 0, height: child.height ?? 0 })
      collect(child, x, y)
    }
  }
  collect(graph, 0, 0)
  const left = Math.min(...[...boxes.values()].map((box) => box.x))
  const top = Math.min(...[...boxes.values()].map((box) => box.y))
  for (const box of boxes.values()) {
    box.x = Math.round(box.x - left + origin.x)
    box.y = Math.round(box.y - top + origin.y)
  }
  return boxes
}

let elk: Promise<LayoutEngine> | null = null

/** ELK is large: it is loaded with the first layout, as a chunk of its own. */
export const loadElk: () => Promise<LayoutEngine> = () =>
  (elk ??= import('elkjs/lib/elk.bundled.js').then(({ default: ELK }) => {
    const instance = new ELK()
    return (graph: ElkNode) => instance.layout(graph)
  }))

/**
 * New boxes of the shapes, laid out in layers along the edges in `direction`, with frames around the shapes inside
 * them; the laid out shapes keep the top-left corner they had together.
 */
export async function layoutShapes(
  shapes: LayoutShape[],
  edges: LayoutEdge[],
  direction: LayoutDirection,
  engine: () => Promise<LayoutEngine> = loadElk,
): Promise<Map<string, LayoutBox>> {
  if (shapes.length === 0) return new Map()
  const origin = { x: Math.min(...shapes.map((shape) => shape.x)), y: Math.min(...shapes.map((shape) => shape.y)) }
  const layout = await engine()
  return layoutBoxes(await layout(layoutGraph(shapes, edges, direction)), origin)
}
