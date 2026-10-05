import type { CellData, StyleValue } from '../diagram/model.ts'
import { layoutShapes, type LayoutEngine, type LayoutShape } from '../diagram/layout.ts'
import { findShape, type ShapeId } from '../diagram/shapes.ts'
import { schemaCells, type TableLink } from '../sql/erDiagram.ts'
import type { SqlColumn, SqlSchema, SqlTable } from '../sql/parseSql.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import type { Cardinality, ErDiagram, Flowchart, MermaidDiagram, NodeShape } from './parseMermaid.ts'

const SHAPES: Record<NodeShape, ShapeId> = {
  rectangle: 'rectangle',
  rounded: 'rounded',
  ellipse: 'ellipse',
  rhombus: 'rhombus',
  database: 'database',
}

/** Size of a shape that fits its label: the palette size at least, wider for long lines, taller for more lines. */
function fitted(preset: ShapeId, label: string): { width: number; height: number } {
  const shape = findShape(preset)!
  const lines = label.split('\n')
  const longest = Math.max(...lines.map((line) => line.length))
  return {
    width: Math.min(320, Math.max(shape.width, Math.ceil(longest * 7.5) + 32)),
    height: shape.height + (lines.length - 1) * 16,
  }
}

/** Style of an edge of a flowchart: its arrows, dashes and width. */
function edgeStyle(edge: Flowchart['edges'][number]): Record<string, StyleValue> {
  return {
    ...(edge.arrow === 'none' && { endArrow: 'none' }),
    ...(edge.arrow === 'both' && { startArrow: 'classic' }),
    ...(edge.dashed && { dashed: true }),
    ...(edge.thick && { strokeWidth: 3 }),
  }
}

/** Cells of a flowchart: shapes for nodes, frames for subgraphs around their nodes, laid out along the edges. */
async function flowchartCells(chart: Flowchart, origin: { x: number; y: number }, engine?: () => Promise<LayoutEngine>) {
  const builder = new DiagramBuilder()
  // Frames first, outer ones before inner ones, so that they are drawn under what they hold.
  const frames = new Map(chart.subgraphs.map((subgraph) => [subgraph.id, builder.shape('boundary', 0, 0, { value: subgraph.title })]))
  const nodes = new Map(
    chart.nodes.map((node) => {
      const preset = SHAPES[node.shape]
      return [node.id, builder.shape(preset, 0, 0, { value: node.label, ...fitted(preset, node.label) })]
    }),
  )
  for (const edge of chart.edges) {
    builder.edge(nodes.get(edge.source)!, nodes.get(edge.target)!, { value: edge.label, style: edgeStyle(edge) })
  }
  const cells = builder.build()
  const byId = new Map(cells.map((cell) => [cell.id, cell]))
  const frameOf = (subgraph: string | null) => (subgraph === null ? null : (frames.get(subgraph) ?? null))
  const shapes: LayoutShape[] = [
    ...chart.subgraphs.map((subgraph) => ({
      id: frames.get(subgraph.id)!,
      ...byId.get(frames.get(subgraph.id)!)!.geometry!,
      frame: true,
      parent: frameOf(subgraph.parent),
    })),
    ...chart.nodes.map((node) => ({
      id: nodes.get(node.id)!,
      ...byId.get(nodes.get(node.id)!)!.geometry!,
      frame: false,
      parent: frameOf(node.subgraph),
    })),
  ]
  const boxes = await layoutShapes(
    shapes,
    chart.edges.map((edge, index) => ({ id: `edge-${index}`, source: nodes.get(edge.source)!, target: nodes.get(edge.target)! })),
    chart.direction,
    engine,
  )
  for (const cell of cells) {
    const box = boxes.get(cell.id)
    if (!box || !cell.geometry) continue
    const frame = frames.size > 0 && [...frames.values()].includes(cell.id)
    cell.geometry = {
      ...cell.geometry,
      x: box.x + origin.x,
      y: box.y + origin.y,
      ...(frame && { width: box.width, height: box.height }),
    }
  }
  return cells
}

const MANY = new Set<Cardinality>(['zero-or-more', 'one-or-more'])

/** Markers of crow's foot for a cardinality. */
const MARKERS: Record<Cardinality, string> = {
  'zero-or-one': 'ERzeroToOne',
  one: 'ERmandOne',
  'zero-or-more': 'ERzeroToMany',
  'one-or-more': 'ERoneToMany',
}

/**
 * The column of `table` that refers to `referenced`: a column marked FK named after the referenced table, else the first
 * column marked FK that refers to nothing yet.
 */
function referencingColumn(table: SqlTable, referenced: string): (SqlColumn & { foreignKey?: boolean }) | undefined {
  const free = table.columns.filter(
    (column) => (column as { foreignKey?: boolean }).foreignKey && !table.foreignKeys.some((key) => key.columns.includes(column.name)),
  )
  const stem = referenced.toLowerCase().replace(/e?s$/, '')
  return free.find((column) => column.name.toLowerCase().startsWith(stem)) ?? free[0]
}

/**
 * Cells of an ER diagram: tables with their attributes. A relation becomes a reference between fields when the table on
 * its «many» side has a column marked FK for it, else an edge between the tables, with the markers of its cardinalities.
 */
async function erCells(diagram: ErDiagram, origin: { x: number; y: number }, engine?: () => Promise<LayoutEngine>) {
  const schema: SqlSchema = { tables: diagram.tables.map((table) => ({ ...table, foreignKeys: [] })), skipped: 0 }
  const table = (name: string) => schema.tables.find((candidate) => candidate.name === name)!
  const links: TableLink[] = []
  for (const relation of diagram.relations) {
    // The «many» side refers to the other; with no «many» side, the right one does.
    const rightRefers = MANY.has(relation.rightCardinality) || !MANY.has(relation.leftCardinality)
    const [from, fromCardinality, to, toCardinality] = rightRefers
      ? [relation.right, relation.rightCardinality, relation.left, relation.leftCardinality]
      : [relation.left, relation.leftCardinality, relation.right, relation.rightCardinality]
    const column = MANY.has(fromCardinality) && MANY.has(toCardinality) ? undefined : referencingColumn(table(from), to)
    if (column && table(to).columns.some((candidate) => candidate.primaryKey)) {
      // The markers of a reference follow from its column: unique for «one» on its side, required for «one» on the other.
      column.unique = !MANY.has(fromCardinality)
      column.notNull = toCardinality === 'one' || toCardinality === 'one-or-more'
      table(from).foreignKeys.push({ name: null, columns: [column.name], table: to, references: [] })
    } else {
      links.push({ from, to, label: relation.label, style: { startArrow: MARKERS[fromCardinality], endArrow: MARKERS[toCardinality] } })
    }
  }
  return schemaCells(schema, origin, engine, links)
}

/** Cells of a diagram of Mermaid laid out with its top-left corner at `origin`. */
export function mermaidCells(diagram: MermaidDiagram, origin: { x: number; y: number }, engine?: () => Promise<LayoutEngine>): Promise<CellData[]> {
  return diagram.kind === 'flowchart' ? flowchartCells(diagram, origin, engine) : erCells(diagram, origin, engine)
}

/** What the import of a diagram adds, for the summary before it. */
export function mermaidSummary(diagram: MermaidDiagram): string {
  if (diagram.kind === 'flowchart') {
    return `Узлов: ${diagram.nodes.length}, связей: ${diagram.edges.length}, рамок: ${diagram.subgraphs.length}, пропущено строк: ${diagram.skipped}`
  }
  return `Таблиц: ${diagram.tables.length}, связей: ${diagram.relations.length}, пропущено строк: ${diagram.skipped}`
}

