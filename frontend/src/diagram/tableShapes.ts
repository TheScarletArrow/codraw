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
import { isBaseTable } from './baseTables.ts'
import { isTableIndexStyle, isTableStyle, TABLE_INDEX_GAP, type ShapeStyle } from './shapes.ts'
import {
  BADGE_HEIGHT,
  BASE_BADGE,
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
import { isViewTable, viewBadge } from './views.ts'

/** Shape of a field drawn in columns; set when the field is drawn, never stored. */
export const TABLE_FIELD_SHAPE = 'codraw.tableField'

const BADGE_FONT_SIZE = 9
const BASE_BADGE_COLOR = '#57606a'
const VIEW_BADGE_COLOR = '#0e7490'

const KEY_COLOR = '#b7791f'
const LINK_COLOR = '#2563eb'
const UNIQUE_COLOR = '#7c3aed'
const INDEX_COLOR = '#0d9488'
/** Size of the caption of the block of indexes. */
const CAPTION_FONT_SIZE = 9
/** Opacity of the texts after the name of a field, so that the name stands out. */
const MUTED = 0.6
/** What a field without text shows, so that it can be found and named. */
export const FIELD_PLACEHOLDER = 'имя поля'
/** What an index without text shows. */
export const INDEX_PLACEHOLDER = 'имя (столбцы)'
/** The caption of the block of indexes of a table. */
export const INDEXES_CAPTION = 'Индексы'

function isTable(cell: Cell | null | undefined): boolean {
  return cell?.isVertex() === true && isTableStyle(cell.getStyle() as ShapeStyle)
}

/** A row of a table that is an index, not a field. */
export function isIndexRow(cell: Cell | null | undefined): boolean {
  return cell?.isVertex() === true && isTable(cell.getParent()) && isTableIndexStyle(cell.getStyle() as Record<string, unknown>)
}

/** A field of a table that is drawn in columns: one of its own shape, not, e.g., a styled row of a draw.io file. */
export function isColumnField(cell: Cell | null | undefined): boolean {
  if (!cell?.isVertex() || !isTable(cell.getParent()) || isIndexRow(cell)) return false
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

/** The rows of the fields of a table, with the references of their edges, and of its indexes, by cell. */
export function tableRowsOf(graph: AbstractGraph, table: Cell): Map<Cell, TableRow> {
  const cached = caches.get(graph)?.get(table)
  if (cached) return cached
  const fields = table.getChildren().filter(isColumnField)
  const indexes = table.getChildren().filter(isIndexRow)
  const rows = tableRows(
    fields.map((field) => ({ text: String(field.getValue() ?? ''), font: fontOf(graph, field), reference: referenceOf(field) })),
    measureLabel,
    indexes.map((index) => ({ text: String(index.getValue() ?? ''), font: fontOf(graph, index), reference: null })),
    { view: isViewTable(table) },
  )
  const result = new Map([...fields, ...indexes].map((row, index) => [row, rows[index]!]))
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
  } else if (icon === 'index') {
    // A bolt: an index makes lookups fast.
    c.setFillColor(INDEX_COLOR)
    c.setStrokeWidth(0)
    c.begin()
    c.moveTo(x + 7.5, y + 0.5)
    c.lineTo(x + 2, y + 7)
    c.lineTo(x + 5.5, y + 7)
    c.lineTo(x + 4.5, y + 11.5)
    c.lineTo(x + 10, y + 5)
    c.lineTo(x + 6.5, y + 5)
    c.close()
    c.fill()
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

/** The placeholder of a row without text, from `x` and as wide as `w`, in the middle of the height `h` from `y`. */
function paintPlaceholder(
  c: AbstractCanvas2D,
  placeholder: string,
  style: { fontColor?: unknown; fontSize?: unknown },
  x: number,
  y: number,
  w: number,
  h: number,
) {
  c.save()
  c.setAlpha(0.4)
  c.setFontColor(String(style.fontColor ?? '#1f2328'))
  c.setFontSize(Number(style.fontSize ?? 13))
  c.setFontStyle(2)
  c.text(x, y + h / 2, Math.max(0, w - ROW_PADDING), h, placeholder, 'left', 'middle', false, '', 'hidden', true, 0, '')
  c.restore()
}

/**
 * `codraw.tableField`: the icons of keys and the columns after the name, which the label of the field draws; for an
 * index, its icon and what follows its name.
 */
class TableFieldShape extends RectangleShape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    super.paintVertexShape(c, x, y, w, h)
    const cell = this.state?.cell
    const table = cell?.getParent()
    const graph = this.state?.view.graph
    const row = cell && table && graph && tableRowsOf(graph, table).get(cell)
    if (!row) return
    if (!String(cell.getValue() ?? '').trim()) {
      // On the canvas only, not in an exported image, and not while the field is being named.
      const onCanvas = (c as unknown as { root?: Element }).root === this.node
      const placeholder = isIndexRow(cell) ? INDEX_PLACEHOLDER : FIELD_PLACEHOLDER
      if (onCanvas && !graph.isEditing(cell)) paintPlaceholder(c, placeholder, this.style ?? {}, x + row.nameX, y, w - row.nameX, h)
      return
    }
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

/**
 * A swimlane that, as a table with a database, has the badge of the database at the left of its header, as a base
 * table the badge of a base at the right, as a view the badge of a view there, and above its indexes a line with their
 * caption.
 */
class TableShape extends SwimlaneShape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    // The swimlane moves the canvas to its top-left corner.
    super.paintVertexShape(c, x, y, w, h)
    const cell = this.state && isTable(this.state.cell) ? this.state.cell : null
    const vendor = cell ? vendorOf(cell.getStyle()) : null
    const top = (Math.min(this.getTitleSize(), h) - BADGE_HEIGHT) / 2
    if (vendor) paintBadge(c, BADGE_X, top, vendor.badge, vendor.color, vendor.textColor)
    const view = cell ? viewBadge(cell.getStyle() as Record<string, unknown>) : null
    if (view) paintBadge(c, w - BADGE_X - badgeWidth(view), top, view, VIEW_BADGE_COLOR, '#ffffff')
    else if (isBaseTable(cell)) paintBadge(c, w - BADGE_X - badgeWidth(BASE_BADGE), top, BASE_BADGE, BASE_BADGE_COLOR, '#ffffff')
    const firstIndex = cell?.getChildren().find(isIndexRow)?.getGeometry()
    if (firstIndex) this.paintIndexesCaption(c, w, firstIndex.y - TABLE_INDEX_GAP)
  }

  /** A line across the table at `top` and the caption of the indexes under it. */
  private paintIndexesCaption(c: AbstractCanvas2D, w: number, top: number) {
    const style = this.style ?? {}
    c.save()
    c.setShadow(false)
    c.setDashed(false)
    c.setStrokeWidth(1)
    c.setStrokeColor(String(style.strokeColor ?? '#1f2328'))
    c.begin()
    c.moveTo(0, top)
    c.lineTo(w, top)
    c.stroke()
    c.setAlpha(MUTED)
    c.setFontColor(String(style.fontColor ?? '#1f2328'))
    c.setFontSize(CAPTION_FONT_SIZE)
    c.setFontStyle(1)
    c.text(ICON_X, top + TABLE_INDEX_GAP / 2, 0, 0, INDEXES_CAPTION, 'left', 'middle', false, '', 'visible', false, 0, '')
    c.restore()
  }
}

function paintBadge(c: AbstractCanvas2D, x: number, top: number, badge: string, color: string, textColor: string) {
  const width = badgeWidth(badge)
  c.save()
  c.setAlpha(1)
  c.setShadow(false)
  c.setDashed(false)
  c.setFillColor(color)
  c.roundrect(x, top, width, BADGE_HEIGHT, 4, 4)
  c.fill()
  c.setFontColor(textColor)
  c.setFontSize(BADGE_FONT_SIZE)
  c.setFontStyle(1)
  c.text(x + width / 2, top + BADGE_HEIGHT / 2, 0, 0, badge, 'center', 'middle', false, '', 'visible', false, 0, '')
  c.restore()
}

/** Adds the shape of fields and the swimlane that draws the database of a table. Safe to call more than once. */
export function registerTableShapes() {
  ShapeRegistry.add(TABLE_FIELD_SHAPE, TableFieldShape)
  ShapeRegistry.add('swimlane', TableShape)
}
