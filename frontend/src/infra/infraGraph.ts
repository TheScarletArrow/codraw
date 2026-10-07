import type { ShapeId } from '../diagram/shapes.ts'

/** A frame around nodes: a network of compose. */
export interface InfraFrame {
  shape: ShapeId
  label: string
}

/** A shape of the palette with a label of several lines, in a frame or on the page. */
export interface InfraNode {
  shape: ShapeId
  lines: string[]
  /** The index of its frame. */
  frame: number | null
}

/** A link between two nodes, by their indexes. */
export interface InfraEdge {
  source: number
  target: number
  label: string
}

/** What an import of infrastructure adds to a page, between the parse of its files and the cells. */
export interface InfraGraph {
  nodes: InfraNode[]
  frames: InfraFrame[]
  edges: InfraEdge[]
}
