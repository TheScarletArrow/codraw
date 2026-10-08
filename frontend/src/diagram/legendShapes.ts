import {
  Cell,
  ChildChange,
  ConnectorShape,
  GeometryChange,
  GraphLayout,
  InternalEvent,
  Point,
  Rectangle,
  RectangleShape,
  Shape,
  ShapeRegistry,
  StyleChange,
  ValueChange,
  type AbstractCanvas2D,
  type CellState,
  type CellStyle,
  type EventObject,
  type Graph,
} from '@maxgraph/core'
import {
  isLegendStyle,
  layoutLegend,
  LEGEND_DEFAULTS,
  LEGEND_SHAPE,
  legendItems,
  legendRows,
  legendSettings,
  sameLegendLayout,
  sampleBox,
  sampleLine,
  type LegendItem,
  type LegendLayout,
  type LegendRecord,
  type LegendRowLayout,
} from './legend.ts'
import { measureLabel } from './textMeasure.ts'

/**
 * Legends on the canvas: the shape that draws a legend with the samples and names of its items, the layout that lists
 * the items of the page and sizes the legend to them in the same change of the model as the change of the page, and
 * the hooks of the graph that keep edges off a legend. The items and their layout are those of `legend.ts`.
 */

/** A legend of the canvas. */
export function isLegend(cell: Cell | null | undefined): boolean {
  return cell?.isVertex() === true && isLegendStyle(cell.getStyle() as Record<string, unknown>)
}

/** The latest layout of each legend; a new object only when the legend draws otherwise. */
const layouts = new WeakMap<Cell, LegendLayout>()
/** The layout each legend was drawn with last. */
const drawn = new WeakMap<Cell, LegendLayout>()

/** The cells of the model in drawing order, parents before their children, as records of a legend. */
export function modelRecords(graph: Graph): LegendRecord[] {
  const records: LegendRecord[] = []
  const visit = (cell: Cell) => {
    for (const child of cell.getChildren()) {
      const id = child.getId()
      if (id && (child.isVertex() || child.isEdge())) {
        records.push({
          id,
          kind: child.isEdge() ? 'edge' : 'vertex',
          parent: child.getParent()?.getId() ?? null,
          style: child.getStyle() as Record<string, unknown>,
        })
      }
      visit(child)
    }
  }
  const root = graph.getDataModel().getRoot()
  if (root) visit(root)
  return records
}

/** The legends of the model. */
export function modelLegends(graph: Graph): Cell[] {
  const legends: Cell[] = []
  const visit = (cell: Cell) => {
    for (const child of cell.getChildren()) {
      if (isLegend(child)) legends.push(child)
      visit(child)
    }
  }
  const root = graph.getDataModel().getRoot()
  if (root) visit(root)
  return legends
}

/** The items of the page of the graph, as every legend of it lists them. */
export function graphLegendItems(graph: Graph): LegendItem[] {
  return legendItems(modelRecords(graph))
}

/** The layout of a legend: the one its layout made last, or a new one before that. */
export function legendLayoutOf(graph: Graph, legend: Cell): LegendLayout {
  return layouts.get(legend) ?? computeLayout(graph, legend, graphLegendItems(graph))
}

function computeLayout(graph: Graph, legend: Cell, items: LegendItem[]): LegendLayout {
  const style = graph.getCellStyle(legend) as Record<string, unknown>
  const rows = legendRows(items, legendSettings(legend.getStyle() as Record<string, unknown>))
  return layoutLegend(String(legend.getValue() ?? ''), rows, style, measureLabel)
}

/**
 * Lists the items of the page for a legend and sizes it to them. The layout manager runs it in the change of the model
 * that changed the page: a change of this participant writes the new size with it, one of others changes the model
 * only, as the layouts of tables do.
 */
export class LegendGraphLayout extends GraphLayout {
  override execute(legend: Cell) {
    const graph = this.graph as Graph
    const next = computeLayout(graph, legend, graphLegendItems(graph))
    const previous = layouts.get(legend)
    const layout = previous && sameLegendLayout(previous, next) ? previous : next
    layouts.set(legend, layout)
    const geometry = legend.getGeometry()
    if (!geometry || (geometry.width === layout.width && geometry.height === layout.height)) return
    const sized = geometry.clone()
    sized.width = layout.width
    sized.height = layout.height
    graph.getDataModel().setGeometry(legend, sized)
  }
}

/**
 * The legends to lay out for a change of the model: all of them when a cell came or went or changed its look, a legend
 * itself when its title or its geometry changed, e.g. when a group around it was resized.
 */
export function legendsForChanges(graph: Graph, changes: readonly unknown[]): Cell[] {
  const own = new Set<Cell>()
  for (const change of changes) {
    if (change instanceof ChildChange || change instanceof StyleChange) return modelLegends(graph)
    if ((change instanceof ValueChange || change instanceof GeometryChange) && isLegend(change.cell)) own.add(change.cell)
  }
  return [...own]
}

/**
 * A record-like state of a cell for a sample: its style as the canvas draws it, without turning and shadow, and with its
 * own opacity: a cell that the filter of the page draws pale is a full sample all the same.
 */
function sampleState(graph: Graph, cell: Cell): CellState {
  const own = cell.getStyle()
  const style: CellStyle = {
    ...graph.getCellStyle(cell),
    rotation: 0,
    shadow: false,
    opacity: own.opacity ?? 100,
    textOpacity: own.textOpacity ?? 100,
  }
  return { cell, style, view: graph.getView() } as unknown as CellState
}

/** Draws the sample of a shape: the class of its shape draws it into the box of the sample. */
function paintShapeSample(c: AbstractCanvas2D, graph: Graph, laid: LegendRowLayout, x: number, y: number) {
  const cell = laid.row.cellId ? graph.getDataModel().getCell(laid.row.cellId) : null
  if (!cell) return
  const state = sampleState(graph, cell)
  const box = sampleBox(laid.row.ratio, laid.y, laid.height)
  const Sample = ShapeRegistry.get(String(state.style.shape ?? 'rectangle')) ?? RectangleShape
  c.save()
  try {
    // Shapes take their bounds and colors from their state too, so they are made without them.
    const sample = new (Sample as unknown as new () => Shape)()
    sample.apply(state)
    // The renderer gives a picture its address apart from its style; a logo of the palette has one.
    if (typeof state.style.image === 'string') Object.assign(sample, { imageSrc: state.style.image })
    sample.scale = 1
    sample.bounds = new Rectangle(x + box.x, y + box.y, box.width, box.height)
    sample.paint(c)
  } catch {
    // A shape that cannot be drawn apart from its cell leaves its row without a sample.
  } finally {
    c.restore()
  }
}

/** Draws the sample of an edge: a straight line across the room of a sample, with the markers and dashes of the edge. */
function paintEdgeSample(c: AbstractCanvas2D, graph: Graph, laid: LegendRowLayout, x: number, y: number) {
  const cell = laid.row.cellId ? graph.getDataModel().getCell(laid.row.cellId) : null
  if (!cell) return
  const state = sampleState(graph, cell)
  const { x1, x2, y: middle } = sampleLine(laid.y, laid.height)
  const line = new ConnectorShape([new Point(x + x1, y + middle), new Point(x + x2, y + middle)], '#1f2328', 1)
  line.apply(state)
  line.scale = 1
  line.bounds = new Rectangle(x + x1, y + middle - 6, x2 - x1, 12)
  c.save()
  try {
    line.paint(c)
  } finally {
    c.restore()
  }
}

/**
 * `codraw.legend`: a frame with its title at the top, a line under it and the rows of its items — the sample at the left,
 * the name after it — as its layout has them. The title is the label of the cell.
 */
class LegendShape extends Shape {
  constructor() {
    super()
    // The whole legend takes clicks: it is selected and dragged by any of its rows.
    this.shapePointerEvents = true
  }

  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.rect(x, y, w, h)
    if (this.fill && this.fill !== 'none') c.fillAndStroke()
    else c.stroke()
    const cell = this.state?.cell
    const graph = this.state?.view.graph as Graph | undefined
    if (!cell || !graph) return
    const layout = legendLayoutOf(graph, cell)
    drawn.set(cell, layout)
    c.setShadow(false)
    c.begin()
    c.moveTo(x, y + Math.min(h, layout.header))
    c.lineTo(x + w, y + Math.min(h, layout.header))
    c.stroke()
    const style = this.style ?? {}
    for (const laid of layout.rows) {
      if (laid.y + laid.height > h + 1) break
      if (laid.row.type === 'shape') paintShapeSample(c, graph, laid, x, y)
      if (laid.row.type === 'edge') paintEdgeSample(c, graph, laid, x, y)
      const item = laid.row.type === 'shape' || laid.row.type === 'edge'
      c.save()
      c.setFontColor(String(style.fontColor ?? '#1f2328'))
      c.setFontSize(Number(style.fontSize ?? 13))
      if (style.fontFamily) c.setFontFamily(style.fontFamily)
      c.setFontStyle(item ? 0 : 2)
      if (!item) c.setAlpha(0.6)
      const left = item ? layout.textX : LEGEND_DEFAULTS.spacingLeft
      c.text(x + left, y + laid.y + laid.height / 2, 0, 0, laid.row.label, 'left', 'middle', false, '', 'visible', false, 0, '')
      c.restore()
    }
  }

  /** The title takes the top of the legend, above the line. */
  override getLabelBounds(rect: Rectangle) {
    const cell = this.state?.cell
    const graph = this.state?.view.graph as Graph | undefined
    const header = cell && graph ? legendLayoutOf(graph, cell).header : rect.height
    return new Rectangle(rect.x, rect.y, rect.width, Math.min(rect.height, header * this.scale))
  }
}

/**
 * Hooks of the graph for legends: their look unless the cell has its own, no resizing and turning, since their items
 * set their size, no edges to them, and every legend whose rows changed drawn again, also when its size did not
 * change. Returns a function that removes the listener.
 */
export function configureLegends(graph: Graph): () => void {
  const getCellStyle = graph.getCellStyle.bind(graph)
  graph.getCellStyle = (cell) => {
    const style = getCellStyle(cell)
    if (!isLegend(cell)) return style
    return { ...style, ...LEGEND_DEFAULTS, ...cell.getStyle(), shape: LEGEND_SHAPE, resizable: false, rotatable: false }
  }
  const isValidSource = graph.isValidSource.bind(graph)
  graph.isValidSource = (cell) => !isLegend(cell) && isValidSource(cell)
  const isValidTarget = graph.isValidTarget.bind(graph)
  graph.isValidTarget = (cell) => !isLegend(cell) && isValidTarget(cell)

  const redraw = (_sender: unknown, _event: EventObject) => {
    const view = graph.getView()
    for (const legend of modelLegends(graph)) {
      const layout = layouts.get(legend)
      if (!layout || drawn.get(legend) === layout) continue
      const state = view.getState(legend)
      if (!state) continue
      state.style = graph.getCellStyle(legend)
      graph.cellRenderer.redraw(state, true, true)
    }
  }
  graph.getDataModel().addListener(InternalEvent.CHANGE, redraw)
  return () => graph.getDataModel().removeListener(redraw)
}

/** Adds the shape of legends. Safe to call more than once. */
export function registerLegendShapes() {
  ShapeRegistry.add(LEGEND_SHAPE, LegendShape)
}
