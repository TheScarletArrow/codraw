import {
  InternalEvent,
  RectangleShape,
  ShapeRegistry,
  SwimlaneShape,
  type AbstractCanvas2D,
  type AbstractGraph,
  type Cell,
} from '@maxgraph/core'
import { vendorOf } from '../sql/dbVendors.ts'
import { plainText, sourceRefers, splitField } from '../sql/tableField.ts'
import { measureLabel, type LabelStyle } from './autoWidth.ts'
import { isTableStyle, type ShapeStyle } from './shapes.ts'
import {
  BADGE_HEIGHT,
  BADGE_X,
  badgeWidth,
  ICON_SIZE,
  ICON_STEP,
  ICON_X,
  ROW_PADDING,
  tableRows,
  type FieldIcon,
  type TableRow,
} from './tableRows.ts'

/** Shape of a field drawn in columns; set when the field is drawn, never stored. */
export const TABLE_FIELD_SHAPE = 'codraw.tableField'

const BADGE_FONT_SIZE = 9

const KEY_COLOR = '#b7791f'
const LINK_COLOR = '#2563eb'
const UNIQUE_COLOR = '#7c3aed'
/** Opacity of the texts after the name of a field, so that the name stands out. */
const MUTED = 0.6

function isTable(cell: Cell | null | undefined): boolean {
  return cell?.isVertex() === true && isTableStyle(cell.getStyle() as ShapeStyle)
}

/** A field of a table that is drawn in columns: one of its own shape, not, e.g., a styled row of a draw.io file. */
export function isColumnField(cell: Cell | null | undefined): boolean {
  if (!cell?.isVertex() || !isTable(cell.getParent())) return false
  const shape = cell.getStyle().shape
  return shape === undefined || shape === 'rectangle'
}

/** The field that `field` refers to through one of its edges, as `table.field`; `null` when it refers to none. */
function referenceOf(field: Cell): string | null {
  const keys = splitField(String(field.getValue() ?? ''))
  if (!keys) return null
  for (const edge of field.getEdges()) {
    const source = edge.getTerminal(true)
    const target = edge.getTerminal(false)
    const other = source === field ? target : source
    if (!other || other === field || !isTable(other.getParent())) continue
    const otherKeys = splitField(String(other.getValue() ?? ''))
    if (!otherKeys) continue
    const style = edge.getStyle() as Record<string, unknown>
    const refers = source === field ? sourceRefers(keys, otherKeys, style) : !sourceRefers(otherKeys, keys, style)
    if (refers) return `${plainText(String(other.getParent()!.getValue() ?? ''))}.${otherKeys.name}`
  }
  return null
}

/** The font of a cell from its own style, not from the style it is drawn with, which needs the rows of its table. */
function fontOf(graph: AbstractGraph, cell: Cell): LabelStyle {
  const stylesheet = graph.getStylesheet()
  const { fontSize, fontFamily, fontStyle } = stylesheet.getCellStyle(cell.getStyle(), stylesheet.getDefaultVertexStyle() ?? {})
  return { fontSize, fontFamily, fontStyle }
}

/** Rows of tables by table, of graphs whose model clears them on every change; see {@link watchTableRows}. */
const caches = new WeakMap<AbstractGraph, Map<Cell, Map<Cell, TableRow>>>()

/** Keeps the rows of the tables of the graph until its model changes, so that a table is laid out once per drawing. */
export function watchTableRows(graph: AbstractGraph): () => void {
  const cache = new Map<Cell, Map<Cell, TableRow>>()
  caches.set(graph, cache)
  const clear = () => cache.clear()
  graph.getDataModel().addListener(InternalEvent.EXECUTE, clear)
  return () => {
    graph.getDataModel().removeListener(clear)
    caches.delete(graph)
  }
}

/** The rows of the fields of a table, by field, with the references of their edges. */
export function tableRowsOf(graph: AbstractGraph, table: Cell): Map<Cell, TableRow> {
  const cached = caches.get(graph)?.get(table)
  if (cached) return cached
  const fields = table.getChildren().filter(isColumnField)
  const rows = tableRows(
    fields.map((field) => ({ text: String(field.getValue() ?? ''), font: fontOf(graph, field), reference: referenceOf(field) })),
    measureLabel,
  )
  const result = new Map(fields.map((field, index) => [field, rows[index]!]))
  caches.get(graph)?.set(table, result)
  return result
}

/** Tables whose rows show what the field or edge `cell` has: its own, and those its references lead to or come from. */
export function tablesShowing(cell: Cell): Cell[] {
  const tables = new Set<Cell>()
  const add = (field: Cell | null) => {
    const table = isTable(field) ? field : (field?.getParent() ?? null)
    if (!table || !isTable(table) || tables.has(table)) return
    tables.add(table)
    for (const child of table.getChildren()) {
      for (const edge of child.getEdges()) {
        for (const end of [edge.getTerminal(true), edge.getTerminal(false)]) {
          if (end && isTable(end.getParent())) tables.add(end.getParent()!)
        }
      }
    }
  }
  if (cell.isEdge()) {
    add(cell.getTerminal(true))
    add(cell.getTerminal(false))
  } else {
    add(cell)
  }
  return [...tables]
}

function paintIcon(c: AbstractCanvas2D, icon: FieldIcon, x: number, y: number) {
  c.save()
  c.setStrokeWidth(1.5)
  c.setDashed(false)
  if (icon === 'key') {
    c.setStrokeColor(KEY_COLOR)
    c.ellipse(x, y + 3, 6, 6)
    c.stroke()
    c.begin()
    c.moveTo(x + 6, y + 6)
    c.lineTo(x + ICON_SIZE, y + 6)
    c.moveTo(x + 9, y + 6)
    c.lineTo(x + 9, y + 9)
    c.moveTo(x + ICON_SIZE - 0.75, y + 6)
    c.lineTo(x + ICON_SIZE - 0.75, y + 8.5)
    c.stroke()
  } else if (icon === 'unique') {
    c.setStrokeColor(UNIQUE_COLOR)
    c.setFillColor(UNIQUE_COLOR)
    c.begin()
    c.moveTo(x + 6, y + 1.5)
    c.lineTo(x + 10.5, y + 6)
    c.lineTo(x + 6, y + 10.5)
    c.lineTo(x + 1.5, y + 6)
    c.close()
    c.fillAndStroke()
  } else {
    c.setStrokeColor(LINK_COLOR)
    c.roundrect(x, y + 3.5, 7, 5, 2.5, 2.5)
    c.stroke()
    c.roundrect(x + 5, y + 3.5, 7, 5, 2.5, 2.5)
    c.stroke()
  }
  c.restore()
}

/** `codraw.tableField`: the icons of keys and the columns after the name, which the label of the field draws. */
class TableFieldShape extends RectangleShape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    super.paintVertexShape(c, x, y, w, h)
    const cell = this.state?.cell
    const table = cell?.getParent()
    const row = cell && table && tableRowsOf(this.state!.view.graph, table).get(cell)
    if (!row) return
    row.icons.forEach((icon, index) => paintIcon(c, icon, x + ICON_X + index * ICON_STEP, y + (h - ICON_SIZE) / 2))
    const style = this.style ?? {}
    c.save()
    c.setAlpha(MUTED)
    c.setFontColor(String(style.fontColor ?? '#1f2328'))
    c.setFontSize(Number(style.fontSize ?? 13))
    if (style.fontFamily) c.setFontFamily(style.fontFamily)
    // Bold and italic as the name has them; the underline is for the name only.
    c.setFontStyle(Number(style.fontStyle ?? 0) & 3)
    for (const column of row.columns) {
      const width = w - column.x - ROW_PADDING
      if (width <= 0) break
      c.text(x + column.x, y + h / 2, width, h, column.text, 'left', 'middle', false, '', 'hidden', true, 0, '')
    }
    c.restore()
  }
}

/** A swimlane that, as a table with a database, has the badge of the database at the left of its header. */
class TableShape extends SwimlaneShape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    // The swimlane moves the canvas to its top-left corner.
    super.paintVertexShape(c, x, y, w, h)
    const vendor = this.state && isTable(this.state.cell) ? vendorOf(this.state.cell.getStyle()) : null
    if (!vendor) return
    const width = badgeWidth(vendor.badge)
    const top = (Math.min(this.getTitleSize(), h) - BADGE_HEIGHT) / 2
    c.save()
    c.setAlpha(1)
    c.setShadow(false)
    c.setFillColor(vendor.color)
    c.roundrect(BADGE_X, top, width, BADGE_HEIGHT, 4, 4)
    c.fill()
    c.setFontColor(vendor.textColor)
    c.setFontSize(BADGE_FONT_SIZE)
    c.setFontStyle(1)
    c.text(BADGE_X + width / 2, top + BADGE_HEIGHT / 2, 0, 0, vendor.badge, 'center', 'middle', false, '', 'visible', false, 0, '')
    c.restore()
  }
}

/** Adds the shape of fields and the swimlane that draws the database of a table. Safe to call more than once. */
export function registerTableShapes() {
  ShapeRegistry.add(TABLE_FIELD_SHAPE, TableFieldShape)
  ShapeRegistry.add('swimlane', TableShape)
}
