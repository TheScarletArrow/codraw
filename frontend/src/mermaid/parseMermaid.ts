import type { SqlColumn, SqlTable } from '../sql/parseSql.ts'
import { parseSequence, type SequenceMermaid } from './sequenceMermaid.ts'

/** How a node of a flowchart is drawn, as far as the palette has it. */
export type NodeShape = 'rectangle' | 'rounded' | 'ellipse' | 'rhombus' | 'database'

export interface FlowNode {
  id: string
  label: string
  shape: NodeShape
  /** The innermost subgraph the node was first mentioned in. */
  subgraph: string | null
}

export interface FlowEdge {
  source: string
  target: string
  label: string
  /** `-->` points at the target, `---` points nowhere, `<-->` at both ends. */
  arrow: 'end' | 'none' | 'both'
  /** `-.->` */
  dashed: boolean
  /** `==>` */
  thick: boolean
}

export interface FlowSubgraph {
  id: string
  title: string
  parent: string | null
}

export interface Flowchart {
  kind: 'flowchart'
  /** Layers along the edges: `LR` and `RL` go right, `TD`, `TB` and `BT` go down. */
  direction: 'right' | 'down'
  nodes: FlowNode[]
  edges: FlowEdge[]
  subgraphs: FlowSubgraph[]
  /** Lines that draw nothing CoDraw has: styles, classes, clicks, and lines not understood. */
  skipped: number
}

/** Cardinality of one end of a relation of an ER diagram. */
export type Cardinality = 'zero-or-one' | 'one' | 'zero-or-more' | 'one-or-more'

export interface ErRelation {
  /** The entity on the left of the relation and its cardinality. */
  left: string
  leftCardinality: Cardinality
  right: string
  rightCardinality: Cardinality
  label: string
}

export interface ErDiagram {
  kind: 'er'
  tables: SqlTable[]
  relations: ErRelation[]
  skipped: number
}

export type MermaidDiagram = Flowchart | ErDiagram | SequenceMermaid

export class MermaidError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MermaidError'
  }
}

/** Whether the text is a diagram of Mermaid that CoDraw draws: a flowchart, an ER diagram or a sequence diagram. */
export function isMermaid(text: string): boolean {
  return /^(flowchart|graph|erDiagram|sequenceDiagram)\b/.test(firstLine(text))
}

/** The first line that is not empty, a comment or front matter. */
function firstLine(text: string): string {
  return meaningfulLines(text)[0] ?? ''
}

/** Lines without comments (`%%`), front matter (`---` … `---`) and blanks, trimmed. */
function meaningfulLines(text: string): string[] {
  const lines = text.split(/\r?\n/)
  let start = 0
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    start = end === -1 ? 0 : end + 1
  }
  return lines
    .slice(start)
    .map((line) => line.replace(/%%.*$/, '').trim())
    .filter((line) => line !== '')
}

/** The diagram of the text; throws {@link MermaidError} for other kinds of diagrams. */
export function parseMermaid(text: string): MermaidDiagram {
  const lines = meaningfulLines(text)
  const header = lines[0] ?? ''
  if (/^(flowchart|graph)\b/.test(header)) return parseFlowchart(header, lines.slice(1))
  if (/^erDiagram\b/.test(header)) return parseErDiagram(lines.slice(1))
  if (/^sequenceDiagram\b/.test(header)) return parseSequence(lines.slice(1))
  throw new MermaidError(
    'CoDraw рисует из Mermaid блок-схемы (flowchart, graph), ER-диаграммы (erDiagram) и диаграммы последовательности (sequenceDiagram)',
  )
}

/** Text of a label: quotes and Markdown marks away, `<br>` as a new line. */
function labelText(raw: string): string {
  let text = raw.trim()
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) text = text.slice(1, -1)
  if (text.startsWith('`') && text.endsWith('`') && text.length >= 2) text = text.slice(1, -1)
  return text
    .replace(/\s*<br\s*\/?>\s*/gi, '\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*(?!\*)(.+?)\*/g, '$1$2')
    .replace(/#quot;/g, '"')
    .trim()
}

/** Opening and closing marks of the shapes of nodes, longer marks first. */
const NODE_SHAPES: [string, string, NodeShape][] = [
  ['(((', ')))', 'ellipse'],
  ['((', '))', 'ellipse'],
  ['([', '])', 'rounded'],
  ['[[', ']]', 'rectangle'],
  ['[(', ')]', 'database'],
  ['{{', '}}', 'rectangle'],
  ['[/', '/]', 'rectangle'],
  ['[/', '\\]', 'rectangle'],
  ['[\\', '\\]', 'rectangle'],
  ['[\\', '/]', 'rectangle'],
  ['[', ']', 'rectangle'],
  ['(', ')', 'rounded'],
  ['{', '}', 'rhombus'],
  ['>', ']', 'rectangle'],
]

const NODE_ID = /^[\p{L}\p{N}_]+(?:[.-][\p{L}\p{N}_]+)*/u

/** Reads a statement of a flowchart from left to right. */
class Line {
  at = 0
  readonly text: string

  constructor(text: string) {
    this.text = text
  }

  get rest() {
    return this.text.slice(this.at)
  }

  get done() {
    return this.at >= this.text.length
  }

  spaces() {
    while (/\s/.test(this.text[this.at] ?? '')) this.at++
  }

  /** A node: its id and, when the line gives them, its label and shape. */
  node(): { id: string; label?: string; shape?: NodeShape } | null {
    this.spaces()
    const id = NODE_ID.exec(this.rest)?.[0]
    if (!id) return null
    this.at += id.length
    for (const [open, close, shape] of NODE_SHAPES) {
      if (!this.rest.startsWith(open)) continue
      const label = this.until(open.length, close)
      if (label === null) continue
      return { id, label: labelText(label), shape }
    }
    // The new syntax `A@{ shape: …, label: "…" }`: its label, drawn as a rectangle.
    if (this.rest.startsWith('@{')) {
      const end = this.rest.indexOf('}')
      const body = this.rest.slice(2, end === -1 ? undefined : end)
      this.at += end === -1 ? this.rest.length : end + 1
      const label = /label:\s*("[^"]*"|[^,}]+)/.exec(body)?.[1]
      return { id, label: label === undefined ? undefined : labelText(label), shape: 'rectangle' }
    }
    // `:::class` after a node only styles it.
    const style = /^:::[\w-]+/.exec(this.rest)
    if (style) this.at += style[0].length
    return { id }
  }

  /** The text from `skip` characters ahead to `close`, which is taken too; quotes may hold the closing mark. */
  private until(skip: number, close: string): string | null {
    let index = this.at + skip
    if (this.text[index] === '"') {
      const quote = this.text.indexOf('"', index + 1)
      if (quote === -1) return null
      index = quote + 1
    }
    const end = this.text.indexOf(close, index)
    if (end === -1) return null
    const label = this.text.slice(this.at + skip, end)
    this.at = end + close.length
    const style = /^:::[\w-]+/.exec(this.rest)
    if (style) this.at += style[0].length
    return label
  }

  /** An edge between nodes, with its label written inside the line or between bars. */
  edge(): Omit<FlowEdge, 'source' | 'target'> | null {
    this.spaces()
    const rest = this.rest
    // `A -- text --> B`, `A -. text .-> B`, `A == text ==> B`
    const inline = /^(<?)(--|==|-\.)\s+(?!>)(.*?)\s+(-{2,}>|-{3,}|={2,}>|={3,}|\.+->|\.+-)/.exec(rest)
    const plain = /^(<?)(-{2,}>|-{3,}|={2,}>|={3,}|-\.+->|-\.+-|--[ox]|==[ox])/.exec(rest)
    const match = inline ?? plain
    if (!match) return null
    this.at += match[0].length
    const operator = inline ? `${inline[2]}${inline[4]}` : plain![2]!
    let label = inline ? inline[3]! : ''
    this.spaces()
    const barred = /^\|([^|]*)\|/.exec(this.rest)
    if (barred) {
      label = barred[1]!
      this.at += barred[0].length
    }
    const pointed = operator.endsWith('>')
    return {
      label: labelText(label),
      arrow: match[1] === '<' && pointed ? 'both' : pointed ? 'end' : 'none',
      dashed: operator.includes('.'),
      thick: operator.includes('='),
    }
  }

  ampersand(): boolean {
    this.spaces()
    if (this.text[this.at] !== '&') return false
    this.at++
    return true
  }
}

const IGNORED = /^(style|classDef|class|linkStyle|click|direction|accTitle|accDescr|title)\b/

function parseFlowchart(header: string, lines: string[]): Flowchart {
  const way = /^(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/.exec(header)?.[1] ?? 'TD'
  const chart: Flowchart = { kind: 'flowchart', direction: way === 'LR' || way === 'RL' ? 'right' : 'down', nodes: [], edges: [], subgraphs: [], skipped: 0 }
  const nodes = new Map<string, FlowNode>()
  const open: string[] = []
  const mention = (found: { id: string; label?: string; shape?: NodeShape }) => {
    const existing = nodes.get(found.id)
    if (existing) {
      if (found.label !== undefined) existing.label = found.label
      if (found.shape) existing.shape = found.shape
      // A node defined before goes into the subgraph that lists it.
      existing.subgraph ??= open.at(-1) ?? null
      return
    }
    const node: FlowNode = { id: found.id, label: found.label ?? found.id, shape: found.shape ?? 'rectangle', subgraph: open.at(-1) ?? null }
    nodes.set(found.id, node)
    chart.nodes.push(node)
  }

  for (const raw of lines.flatMap((line) => line.split(';')).map((line) => line.trim()).filter(Boolean)) {
    const subgraph = /^subgraph\s+(.*)$/.exec(raw)
    if (subgraph) {
      const spec = subgraph[1]!.trim()
      const titled = /^([\p{L}\p{N}_-]+)\s*\[(.*)\]$/u.exec(spec)
      const id = titled ? titled[1]! : /^"/.test(spec) ? `subgraph-${chart.subgraphs.length + 1}` : spec
      const title = labelText(titled ? titled[2]! : spec)
      chart.subgraphs.push({ id, title, parent: open.at(-1) ?? null })
      open.push(id)
      continue
    }
    if (raw === 'end') {
      open.pop()
      continue
    }
    if (IGNORED.test(raw)) {
      chart.skipped++
      continue
    }
    const line = new Line(raw)
    const group = () => {
      const found: { id: string; label?: string; shape?: NodeShape }[] = []
      do {
        const node = line.node()
        if (!node) return null
        found.push(node)
      } while (line.ampersand())
      return found
    }
    let left = group()
    if (!left) {
      chart.skipped++
      continue
    }
    left.forEach(mention)
    let understood = true
    while (!line.done) {
      const edge = line.edge()
      const right = edge && group()
      if (!edge || !right) {
        understood = false
        break
      }
      right.forEach(mention)
      for (const source of left) for (const target of right) chart.edges.push({ source: source.id, target: target.id, ...edge })
      left = right
      line.spaces()
    }
    if (!understood) chart.skipped++
  }
  // A subgraph that is the end of an edge is drawn as its frame; its id is not a node.
  const frames = new Set(chart.subgraphs.map((subgraph) => subgraph.id))
  chart.nodes = chart.nodes.filter((node) => !frames.has(node.id))
  chart.edges = chart.edges.filter((edge) => !frames.has(edge.source) && !frames.has(edge.target))
  return chart
}

const CARDINALITIES: Record<string, Cardinality> = {
  '|o': 'zero-or-one',
  'o|': 'zero-or-one',
  '||': 'one',
  '}o': 'zero-or-more',
  'o{': 'zero-or-more',
  '}|': 'one-or-more',
  '|{': 'one-or-more',
}

const ENTITY = String.raw`("[^"]+"|[\p{L}\p{N}_-]+)(?:\[[^\]]*\])?`
const RELATION = new RegExp(String.raw`^${ENTITY}\s+(\|o|\|\||\}o|\}\|)(--|\.\.)(o\||\|\||o\{|\|\{)\s+${ENTITY}\s*(?::\s*(.*))?$`, 'u')
const ENTITY_START = new RegExp(String.raw`^${ENTITY}\s*\{$`, 'u')

const entityName = (raw: string) => (raw.startsWith('"') ? raw.slice(1, -1) : raw)

function parseErDiagram(lines: string[]): ErDiagram {
  const diagram: ErDiagram = { kind: 'er', tables: [], relations: [], skipped: 0 }
  const table = (name: string) => {
    let found = diagram.tables.find((candidate) => candidate.name === name)
    if (!found) {
      found = { name, columns: [], foreignKeys: [], indexes: [] }
      diagram.tables.push(found)
    }
    return found
  }
  let current: SqlTable | null = null
  // A block may sit on one line, `A { int id PK }`: its braces start lines of their own.
  const split = lines.flatMap((line) =>
    RELATION.test(line)
      ? [line]
      : line
          .replace(/\{(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '{\n')
          .replace(/\}(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '\n}')
          .split('\n')
          .map((part) => part.trim())
          .filter(Boolean),
  )
  for (const line of split) {
    if (current) {
      if (line === '}') {
        current = null
        continue
      }
      const attribute = /^(\S+)\s+(\S+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"[^"]*")?$/.exec(line)
      if (!attribute) {
        diagram.skipped++
        continue
      }
      const keys = (attribute[3] ?? '').split(/\s*,\s*/)
      const column: SqlColumn & { foreignKey?: boolean } = {
        name: attribute[2]!,
        type: attribute[1]!.replace(/_/g, ' ').replace(/\s+\(/g, '('),
        primaryKey: keys.includes('PK'),
        notNull: keys.includes('PK'),
        unique: keys.includes('UK'),
      }
      if (keys.includes('FK')) column.foreignKey = true
      current.columns.push(column)
      continue
    }
    const start = ENTITY_START.exec(line)
    if (start) {
      current = table(entityName(start[1]!))
      continue
    }
    const relation = RELATION.exec(line)
    if (relation) {
      const left = table(entityName(relation[1]!)).name
      const right = table(entityName(relation[5]!)).name
      diagram.relations.push({
        left,
        leftCardinality: CARDINALITIES[relation[2]!]!,
        right,
        rightCardinality: CARDINALITIES[relation[4]!]!,
        label: labelText(relation[6] ?? ''),
      })
      continue
    }
    const lone = new RegExp(String.raw`^${ENTITY}$`, 'u').exec(line)
    if (lone) table(entityName(lone[1]!))
    else diagram.skipped++
  }
  return diagram
}
