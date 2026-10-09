import type { ElementProperties } from '../diagram/elementKinds.ts'
import type { LayoutDirection } from '../diagram/layout.ts'
import type { ShapeId } from '../diagram/shapes.ts'

/** A frame around nodes: a network of compose, a namespace of Kubernetes, a module of Terraform. */
export interface InfraFrame {
  shape: ShapeId
  label: string
  /** The index of the frame it is in: a module in a module. */
  parent?: number | null
  /** What identifies it in its source for the next import, when its label does not: the address of a module. */
  key?: string
}

/** A shape of the palette with a label of several lines, in a frame or on the page. */
export interface InfraNode {
  shape: ShapeId
  lines: string[]
  /** The index of its frame. */
  frame: number | null
  /** What identifies it in its source for the next import, when its first line does not: the address of a resource. */
  key?: string
  /** Properties of its element: the shape gets an element of its own with them. */
  element?: Partial<ElementProperties>
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
  /** Where the layout puts the target of a link: right of its source, as by default, or under it. */
  direction?: LayoutDirection
}

export interface InfraOptions {
  /** Addresses of other services in environment variables become links. */
  environment: boolean
  /** Shapes of C4: Container, Database and External System. */
  c4: boolean
}

/** Links between nodes, one a direction, labelled with the labels of all the reasons for it. */
export class InfraEdges {
  private readonly edges = new Map<string, InfraEdge & { labels: string[] }>()

  /** Adds a link, or a label to the link in the same direction; a link to itself or to no node is no link. */
  add(source: number, target: number | undefined, label: string) {
    if (target === undefined || target === source) return
    const key = `${source}:${target}`
    let edge = this.edges.get(key)
    if (!edge) {
      edge = { source, target, label: '', labels: [] }
      this.edges.set(key, edge)
    }
    if (label && !edge.labels.includes(label)) {
      edge.labels.push(label)
      edge.label = edge.labels.join(', ')
    }
  }

  /** The links in the order they were first added. */
  list(): InfraEdge[] {
    return [...this.edges.values()].map(({ source, target, label }) => ({ source, target, label }))
  }
}
