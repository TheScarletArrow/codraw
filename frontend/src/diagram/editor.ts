import {
  Cell,
  CellEditorHandler,
  Client,
  ConnectionHandler,
  FitPlugin,
  Geometry,
  Graph,
  GraphDataModel,
  Guide,
  ImageBox,
  InternalEvent,
  KeyHandler,
  LayoutManager,
  PopupMenuHandler,
  SelectionHandler,
  Point as GraphPoint,
  RubberBandHandler,
  StackLayout,
  StyleDefaultsConfig,
  getDefaultPlugins,
  type CellState,
  type CellStyle,
  type EventObject,
  type ImageShape,
  type StyleArrowValue,
} from '@maxgraph/core'
import * as Y from 'yjs'
import { allowsAutoWidth, anchoredX, AUTO_WIDTH_KEY, fittedWidth, hasAutoWidth, measureLabel, type Align } from './autoWidth.ts'
import { createUndoManager, DiagramBinding, LOCAL_ORIGIN } from './binding.ts'
import type { MenuTarget } from './canvasMenu.ts'
import { canReadSystemClipboard, clipboard, writeSystemClipboard } from './clipboard.ts'
import { clipboardText, readClipboardText } from './clipboardFormat.ts'
import { registerDiagramExtensions } from './extensions.ts'
import { DEFAULT_PAGE_ID, getCells, type StyleValue } from './model.ts'
import { blocksPlacement, placeConnected, type Side } from './quickConnect.ts'
import { touchedByRegion } from './regionSelection.ts'
import { renderSvg, type ExportedImage, type SvgOptions } from './svgExport.ts'
import {
  findShape,
  groupShapes,
  isTableStyle,
  markedStyle,
  shapeGroup,
  shapeGroupOf,
  TABLE_FIELD_HEIGHT,
  TABLE_FIELD_STYLE,
  TABLE_HEADER_HEIGHT,
  type ShapeId,
  type ShapeGroup,
  type ShapePreset,
  type ShapeStyle,
} from './shapes.ts'
import { clampFontSize, nextFontSize, tableFieldHeight, tableHeaderHeight } from './textSize.ts'

export interface Point {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export type EdgeEnd = 'start' | 'end'

/** Markers of the selected edges; `null` for an end where the edges have different markers. */
export interface EdgeMarkers {
  start: string | null
  end: string | null
}

export type ColorTarget = 'fill' | 'stroke' | 'font'

/** Colors of the selected objects; `null` for a color that differs between them. */
export interface SelectionColors {
  fill: string | null
  stroke: string | null
  font: string | null
  /** Shapes are selected, so the fill can be changed; edges have no fill. */
  hasShapes: boolean
}

/** How a line is drawn: whole, in dashes or in dots. */
export type LineDash = 'solid' | 'dashed' | 'dotted'

/** How an edge goes from its source to its target. */
export type EdgeShape = 'straight' | 'orthogonal' | 'curved'

/** Where the text of a label is in its shape. */
export type TextAlign = 'left' | 'center' | 'right'

export type FontStyleFlag = 'bold' | 'italic' | 'underline'

/** Which side or centre line of the selected area the shapes line up on. */
export type ShapeAlign = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

export type Direction = 'horizontal' | 'vertical'

/** Lines of the selected objects; `null` for a value that differs between them. */
export interface SelectionLine {
  width: number | null
  dash: LineDash | null
  /** Shape of the selected edges; `null` without edges, when it differs, or for a routing CoDraw does not offer. */
  edgeShape: EdgeShape | null
  hasEdges: boolean
}

/** Text of the selected objects. */
export interface SelectionText {
  /** Size of the text; `null` when it differs between the selected objects. */
  fontSize: number | null
  /** Every selected object has the text bold, italic or underlined. */
  bold: boolean
  italic: boolean
  underline: boolean
  /** Alignment of the text; `null` when it differs between the selected objects. */
  align: TextAlign | null
  /**
   * The width of the selected shapes follows their labels: `true` when it does for all of them that allow it, `null`
   * when no selected shape allows it.
   */
  autoWidth: boolean | null
}

/** Position and size of the selected shapes; `null` for a value that differs between them. */
export interface SelectionGeometry {
  x: number | null
  y: number | null
  width: number | null
  height: number | null
  /** A selected shape is not a table, whose height its fields set, so the height can be changed. */
  canSetHeight: boolean
}

/** The selected shape that the arrows continue, and the shapes of its group they offer. */
export interface QuickConnectSource {
  cellId: string
  shapes: ShapeId[]
}

export interface EditorState {
  canUndo: boolean
  canRedo: boolean
  scale: number
  /** A table or a field of a table is selected, so a field can be added. */
  tableSelected: boolean
  /** Markers of the selected edges, or `null` when no edge is selected. */
  edgeMarkers: EdgeMarkers | null
  /** Colors of the selection, or `null` when nothing is selected. */
  colors: SelectionColors | null
  /** Lines of the selection, or `null` when nothing is selected. */
  line: SelectionLine | null
  /** Text of the selection, or `null` when nothing is selected. */
  text: SelectionText | null
  /** Position and size of the selected shapes, or `null` when no shape is selected; fields are not shapes here. */
  geometry: SelectionGeometry | null
  /** The single selected shape with a group, or `null` when there is none. */
  quickConnect: QuickConnectSource | null
  /** The clipboard of the browser tab holds something to paste, or the browser lets the page read the system's. */
  canPaste: boolean
  /** Number of selected shapes that can be aligned and distributed: shapes of their own, not fields of tables. */
  arrange: number
  /** At least two selected shapes or edges of one parent can become a group. */
  canGroup: boolean
  /** A group is selected. */
  canUngroup: boolean
  /** The page has shapes or edges, so it has an image. */
  hasCells: boolean
  /** The selection has a shape, so copying takes something. */
  canCopy: boolean
}

/** A right click on the canvas, reported after maxGraph has updated the selection for it. */
export interface ContextMenuRequest {
  /** Point of the click relative to the visible top-left corner of the canvas. */
  x: number
  y: number
  /** The same point in diagram coordinates. */
  point: Point
  target: MenuTarget
}

/** Editor of one board page: a maxGraph canvas bound to the Yjs document. */
export interface DiagramEditor {
  readonly graph: Graph
  /** The page whose cells the canvas shows. */
  readonly pageId: string
  /** The participant may only view the page: the commands that would change it do nothing. */
  readonly readOnly: boolean
  /** Adds a palette shape centred at `center` (diagram coordinates) or in the middle of the visible area. */
  addShape(shape: ShapeId, center?: Point): Cell | null
  /** Adds a field under the selected field (or at the end of the selected table) and starts editing it. */
  addTableField(): Cell | null
  /**
   * Adds a shape of the group of the selected shape on its `side` and connects the selected shape to it, as one undo
   * step, and selects the new shape.
   */
  addConnectedShape(side: Side, shape: ShapeId): Cell | null
  /**
   * Puts the selected shapes, tables of selected fields and the edges between them into the clipboard of the tab and,
   * in the format of draw.io, into the clipboard of the system: into `data` of a clipboard event, or through the
   * Clipboard API.
   */
  copy(data?: DataTransfer | null): void
  /** Copies like {@link copy} and removes what was copied, as one undo step. */
  cut(data?: DataTransfer | null): void
  /**
   * Adds `text` of the clipboard of the system, or without it the clipboard of the tab, as one undo step: cells of
   * CoDraw or draw.io shifted further with every paste of the same content, or with their top-left corner at `at`;
   * other text as a text shape in the middle of the visible area, or with its top-left corner at `at`.
   */
  paste(at?: Point, text?: string): void
  /** Adds a shifted copy of what {@link copy} would copy, without changing the clipboard. */
  duplicate(): void
  bringToFront(): void
  sendToBack(): void
  /** Selects all shapes and edges of the page. */
  selectAll(): void
  /** Moves the selected shapes and edges by (dx, dy), a selected field with its table, as one undo step. */
  moveSelection(dx: number, dy: number): void
  /** Swaps the ends of the selected edge with its bend points, as one undo step. */
  reverseEdge(): void
  /** Lines the selected shapes up on a side or a centre line of the area they cover, as one undo step. */
  alignShapes(align: ShapeAlign): void
  /** Spaces at least three selected shapes evenly between the outermost ones, as one undo step. */
  distributeShapes(direction: Direction): void
  /** Puts the selected shapes of one parent and the edges between them into a new group and selects it. */
  group(): Cell | null
  /** Moves the shapes of the selected groups back to the page in their places and selects them. */
  ungroup(): void
  /** Starts editing the label of the selected element. */
  editLabel(): void
  deleteSelection(): void
  /** Gives the keyboard to the canvas, so that its shortcuts work, unless a label is being edited. */
  focus(): void
  /**
   * Draws the page, or with `selectionOnly` what {@link copy} would take, into an SVG image at 100%; `null` when there
   * is nothing to draw.
   */
  exportSvg(options?: SvgOptions & { selectionOnly?: boolean }): ExportedImage | null
  /** Reports right clicks on the canvas; returns an unsubscribe function. */
  onContextMenu(listener: (request: ContextMenuRequest) => void): () => void
  /** Sets the marker of the start or the end of the selected edges. */
  setEdgeMarker(end: EdgeEnd, marker: string): void
  /** Sets the fill (shapes only), line or text color of the selected objects as one undo step. */
  setColor(target: ColorTarget, color: string): void
  /** Sets the text size of the selected objects and of the fields of selected tables as one undo step. */
  setFontSize(size: number): void
  /** Makes the text of each object {@link setFontSize} would change one size of the row larger or smaller. */
  stepFontSize(direction: 1 | -1): void
  /**
   * Turns a font style on for the objects {@link setFontSize} would change, or off when all of them have it, as one undo
   * step.
   */
  toggleFontStyle(flag: FontStyleFlag): void
  /** Aligns the text of the objects {@link setFontSize} would change, as one undo step. */
  setTextAlign(align: TextAlign): void
  /** Sets the width or the dash of the lines of the selected objects, or the shape of the selected edges, as one undo step. */
  setLineStyle(changes: { width?: number; dash?: LineDash; edgeShape?: EdgeShape }): void
  /** Turns on or off the width that follows the label for the selected shapes that allow it; on, it fits them at once. */
  setAutoWidth(enabled: boolean): void
  /** Sets the position or size of the selected shapes as one undo step; tables keep the height of their fields. */
  setGeometry(changes: Partial<Box>): void
  /** Converts a client (viewport) position to diagram coordinates. */
  toDiagramPoint(clientX: number, clientY: number): Point
  /** Converts diagram coordinates to a position relative to the visible top-left corner of the canvas. */
  toCanvasPoint(point: Point): Point
  /** Bounds of a cell relative to the visible top-left corner of the canvas, or `null` if it is not shown. */
  cellBounds(id: string): Box | null
  /** Size of the visible area of the canvas, without scrollbars. */
  viewportSize(): { width: number; height: number }
  /** Scrolls (or, beyond the scrollable area, pans) the canvas so that a diagram point is in its middle. */
  centerOn(point: Point): void
  /** Reports the pointer position over the canvas in diagram coordinates, and `null` when it leaves. */
  onPointerMove(listener: (point: Point | null) => void): () => void
  /** Reports the ids of the selected cells whenever the selection changes. */
  onSelectionChange(listener: (ids: string[]) => void): () => void
  /** Reports that the picture on the screen moved: scrolling, zooming or changed cells. */
  onViewChange(listener: () => void): () => void
  /** Increases with every view change; lets React re-render positions computed from the view. */
  getViewVersion(): number
  undo(): void
  redo(): void
  zoomIn(): void
  zoomOut(): void
  zoomActual(): void
  /** Scales and scrolls the canvas so that the whole page is visible, at most at 100%. */
  zoomToFit(): void
  getState(): EditorState
  /** Calls `listener` whenever {@link getState} changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
  destroy(): void
}

/** Connection point shown next to the right border of a hovered shape; dragging it creates an edge. */
const CONNECT_ICON = new ImageBox(
  'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6.5" fill="#2563eb" stroke="#fff" stroke-width="1.5"/><path d="M6 5l3 3-3 3" fill="none" stroke="#fff" stroke-width="1.5"/></svg>',
    ),
  16,
  16,
)

/** The smallest width and height of a shape that can be typed in. */
export const MIN_SHAPE_SIZE = 10

/** Limits of the width of a line. */
export const MIN_LINE_WIDTH = 1
export const MAX_LINE_WIDTH = 20

/** Pattern of a dotted line: dashes of one width with gaps of two, in widths of the line. */
const DOTTED_PATTERN = '1 2'

/** Style of a group: the `group` style of draw.io, a container without a fill and a border. */
const GROUP_STYLE = {
  fillColor: 'none',
  strokeColor: 'none',
  verticalAlign: 'top',
  pointerEvents: false,
} as const satisfies CellStyle

/** Margin around the page when it is fitted into the canvas, in pixels. */
const FIT_MARGIN = 20

/** Bits of the `fontStyle` style key. */
const FONT_STYLE_BITS: Record<FontStyleFlag, number> = { bold: 1, italic: 2, underline: 4 }

/** Property of the canvas element that exposes the editor to end-to-end tests. */
export const EDITOR_PROPERTY = '__codrawEditor'

const KEY_BACKSPACE = 8
const KEY_DELETE = 46
const KEY_A = 65
const KEY_B = 66
const KEY_D = 68
const KEY_G = 71
const KEY_H = 72
const KEY_I = 73
const KEY_U = 85
const KEY_Y = 89
const KEY_Z = 90
const KEY_F2 = 113
const KEY_LEFT = 37
const KEY_UP = 38
const KEY_RIGHT = 39
const KEY_DOWN = 40

/** Arrow keys and the directions they move the selection in. */
const ARROWS = [
  [KEY_LEFT, -1, 0],
  [KEY_UP, 0, -1],
  [KEY_RIGHT, 1, 0],
  [KEY_DOWN, 0, 1],
] as const

/** Color of the guides that show where a dragged shape lines up with others: the color of the selection. */
const GUIDE_COLOR = '#2563eb'

/** Shift of a duplicate, and of every next paste of the same clipboard with the keyboard. */
const PASTE_OFFSET = 20

/** Height of a line of a label in sizes of its font, as maxGraph draws labels. */
const LINE_HEIGHT = 1.2

/** Room above and below the lines of a pasted text, so that one line has the height of the «Текст» of the palette. */
const TEXT_PADDING = 14

export interface DiagramEditorOptions {
  /** The page to show; the default page of a new board by default. */
  pageId?: string
  /**
   * History of the page that outlives the editor, e.g. to keep it while the user visits other pages.
   * Without it the editor keeps its own history and destroys it with itself.
   */
  undoManager?: Y.UndoManager
  /**
   * The participant may only view the page: they select, copy, scroll and zoom, but cannot move, resize, connect,
   * edit or delete anything, and nothing they do is written to the document.
   */
  readOnly?: boolean
}

/** Commands of the editor that change the page; a read-only editor ignores them. */
const CHANGING_COMMANDS = [
  'addShape',
  'addTableField',
  'addConnectedShape',
  'cut',
  'paste',
  'duplicate',
  'moveSelection',
  'bringToFront',
  'sendToBack',
  'reverseEdge',
  'alignShapes',
  'distributeShapes',
  'group',
  'ungroup',
  'editLabel',
  'deleteSelection',
  'setEdgeMarker',
  'setColor',
  'setFontSize',
  'stepFontSize',
  'toggleFontStyle',
  'setTextAlign',
  'setLineStyle',
  'setAutoWidth',
  'setGeometry',
  'undo',
  'redo',
] as const satisfies readonly (keyof DiagramEditor)[]

export function createDiagramEditor(
  container: HTMLElement,
  document: Y.Doc,
  { pageId = DEFAULT_PAGE_ID, undoManager: sharedUndoManager, readOnly = false }: DiagramEditorOptions = {},
): DiagramEditor {
  const model = new GraphDataModel()
  const cells = getCells(document, pageId)
  const undoManager = sharedUndoManager ?? createUndoManager(cells)

  const graph = new Graph(container, model, [...getDefaultPlugins(), RubberBandHandler])
  // After the graph: the first graph registers the default shapes of maxGraph, including its own `rectangle`.
  registerDiagramExtensions()
  graph.setPanning(true)
  graph.setConnectable(true)
  graph.setAllowDanglingEdges(false)
  graph.setDropEnabled(false)
  graph.setGridEnabled(true)
  graph.setGridSize(10)
  // Tables are the only containers, and they are never collapsed.
  graph.options.foldingEnabled = false
  // Labels are plain text: rendering HTML from other participants would allow script injection.
  graph.setHtmlLabels(false)
  configureStyles(graph)
  configureConnections(graph)
  configureSelection(graph)
  configureRegionSelection(graph)
  // Resizing a group scales what it holds, as in draw.io; tables lay their fields out themselves.
  graph.isRecursiveResize = (state?: CellState | null) => !!state && isGroup(state.cell)
  const fitter = graph.getPlugin<FitPlugin>('fit')
  // A small diagram is not blown up.
  if (fitter) fitter.maxFitScale = 1
  if (readOnly) {
    // Locked cells cannot be moved, resized, bent or disconnected.
    graph.setCellsLocked(true)
    graph.setCellsEditable(false)
    graph.setCellsDeletable(false)
    graph.setCellsCloneable(false)
    graph.setConnectable(false)
  }
  const layoutManager = new LayoutManager(graph)
  const tableLayout = new TableLayout(graph)
  layoutManager.getLayout = (cell) => (isTable(cell) ? tableLayout : null)
  // Bound only now, so that the stored cells are laid out like any later change of other participants.
  const binding = new DiagramBinding(model, cells, LOCAL_ORIGIN, readOnly)
  const cellEditor = graph.getPlugin<CellEditorHandler>('CellEditorHandler')
  // Commit a label when its editor loses focus, e.g. when the user clicks the palette or the toolbar.
  if (cellEditor) cellEditor.blurEnabled = true

  const selectedEdges = () => graph.getSelectionCells().filter((cell) => cell.isEdge())
  const selectedTable = (): Cell | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    if (!cell || isTable(cell)) return cell
    const parent = cell.getParent()
    return isTable(parent) ? parent : null
  }
  /** The single selected shape with a group; a table field is part of its table, not a shape of its own. */
  const quickConnectSource = (): { cell: Cell; group: ShapeGroup } | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    if (!cell?.isVertex() || isTable(cell.getParent())) return null
    const group = shapeGroupOf(cell.getStyle() as ShapeStyle)
    return group ? { cell, group } : null
  }
  const quickConnect = (): QuickConnectSource | null => {
    const source = quickConnectSource()
    return source ? { cellId: source.cell.getId()!, shapes: groupShapes(source.group).map((shape) => shape.id) } : null
  }
  const markerOf = (edge: Cell, end: EdgeEnd) =>
    String(graph.getCellStyle(edge)[end === 'start' ? 'startArrow' : 'endArrow'] ?? 'none')
  const sameMarker = (edges: Cell[], end: EdgeEnd) => same(edges.map((edge) => markerOf(edge, end)))
  // The stored color, or the default of shapes or edges; the merged style drops `none`, so it cannot tell.
  const colorOf = (cell: Cell, target: ColorTarget) => {
    const stylesheet = graph.getStylesheet()
    const defaults = cell.isEdge() ? stylesheet.getDefaultEdgeStyle() : stylesheet.getDefaultVertexStyle()
    const key = COLOR_KEYS[target]
    return String(cell.getStyle()[key] ?? defaults[key] ?? 'none')
  }
  const selectionColors = (): SelectionColors | null => {
    const cells = graph.getSelectionCells()
    if (cells.length === 0) return null
    const shapes = cells.filter((cell) => cell.isVertex())
    return {
      fill: shapes.length > 0 ? same(shapes.map((cell) => colorOf(cell, 'fill'))) : null,
      stroke: same(cells.map((cell) => colorOf(cell, 'stroke'))),
      font: same(cells.map((cell) => colorOf(cell, 'font'))),
      hasShapes: shapes.length > 0,
    }
  }

  /** Selected cells and the fields of selected tables: the text of a table is its name and its fields. */
  const textCells = (): Cell[] => {
    const cells = new Set<Cell>()
    for (const cell of graph.getSelectionCells()) {
      cells.add(cell)
      if (isTable(cell)) cell.getChildren().forEach((field) => cells.add(field))
    }
    return [...cells]
  }
  const fontSizeOf = (cell: Cell) => Number(graph.getCellStyle(cell).fontSize ?? StyleDefaultsConfig.fontSize)
  /** A shape with a size of its own: not a field, which its table places, nor a label of an edge. */
  const isFreeShape = (cell: Cell) =>
    cell.isVertex() && !isTable(cell.getParent()) && cell.getGeometry() !== null && !cell.getGeometry()!.relative
  const allowsAutoWidthCell = (cell: Cell) => isFreeShape(cell) && allowsAutoWidth(graph.getCellStyle(cell) as ShapeStyle)
  const autoWidthCells = () => graph.getSelectionCells().filter(allowsAutoWidthCell)
  const geometryCells = () => graph.getSelectionCells().filter(isFreeShape)
  /** Selected cells that can become a group: those of the parent of the first one, fields of tables aside. */
  const groupableCells = (): Cell[] => {
    const cells = graph.getSelectionCells().filter((cell) => !isTable(cell.getParent()))
    const parent = cells[0]?.getParent()
    if (!parent) return []
    return cells.filter((cell) => cell.getParent() === parent).sort((a, b) => parent.getIndex(a) - parent.getIndex(b))
  }
  const canGroup = () => groupableCells().filter((cell) => cell.isVertex()).length >= 2
  const fontStyleOf = (cell: Cell) => Number(graph.getCellStyle(cell).fontStyle ?? 0)
  const hasFontStyle = (cells: Cell[], flag: FontStyleFlag) =>
    cells.every((cell) => (fontStyleOf(cell) & FONT_STYLE_BITS[flag]) !== 0)
  const selectionText = (): SelectionText | null => {
    const cells = textCells()
    if (cells.length === 0) return null
    const shapes = autoWidthCells()
    return {
      fontSize: same(cells.map(fontSizeOf)),
      bold: hasFontStyle(cells, 'bold'),
      italic: hasFontStyle(cells, 'italic'),
      underline: hasFontStyle(cells, 'underline'),
      align: same(cells.map((cell) => alignOf(graph.getCellStyle(cell)))),
      autoWidth: shapes.length > 0 ? shapes.every((cell) => hasAutoWidth(cell.getStyle())) : null,
    }
  }
  const selectionLine = (): SelectionLine | null => {
    const cells = graph.getSelectionCells()
    if (cells.length === 0) return null
    const edges = cells.filter((cell) => cell.isEdge())
    return {
      width: same(cells.map(lineWidthOf)),
      dash: same(cells.map(lineDashOf)),
      edgeShape: edges.length > 0 ? same(edges.map(edgeShapeOf)) : null,
      hasEdges: edges.length > 0,
    }
  }
  const selectionGeometry = (): SelectionGeometry | null => {
    const cells = geometryCells()
    if (cells.length === 0) return null
    const value = (key: keyof Box) => same(cells.map((cell) => cell.getGeometry()![key]))
    return {
      x: value('x'),
      y: value('y'),
      width: value('width'),
      height: value('height'),
      canSetHeight: cells.some((cell) => !isTable(cell)),
    }
  }

  /** Sets a style key of cells, or removes it with `undefined`, in one change of the model. */
  const setStyleValue = (cells: Cell[], key: string, value: StyleValue | undefined) => {
    model.batchUpdate(() => {
      for (const cell of cells) {
        const style = cell.getClonedStyle() as Record<string, unknown>
        if (style[key] === value) continue
        if (value === undefined) delete style[key]
        else style[key] = value
        model.setStyle(cell, style as CellStyle)
      }
    })
  }
  const setHeight = (cell: Cell, height: number) => {
    const geometry = cell.getGeometry()
    if (!geometry || geometry.height === height) return
    const resized = geometry.clone()
    resized.height = height
    model.setGeometry(cell, resized)
  }
  /** Width that fits the longest line of the label of a shape, or of a table and its fields; `null` without text. */
  const fittedWidthOf = (shape: Cell): number | null => {
    const gridSize = graph.isGridEnabled() ? graph.getGridSize() : 0
    const widths = (isTable(shape) ? [shape, ...shape.getChildren()] : [shape]).flatMap((part) => {
      const label = graph.getLabel(part)
      if (!label) return []
      const style = { fontSize: fontSizeOf(part), ...graph.getCellStyle(part) }
      return [fittedWidth(measureLabel(label, style), style, gridSize)]
    })
    return widths.length > 0 ? Math.max(...widths) : null
  }
  /**
   * Fits the width of the shapes with auto width among `cells`, and of the tables of the fields among them, to their
   * labels, keeping the place of the label. Called inside the change that changed the labels, so it is the same undo step.
   */
  const fitAutoWidth = (cells: Cell[]) => {
    const shapes = new Set<Cell>()
    for (const cell of cells) {
      const shape = isTable(cell.getParent()) ? cell.getParent()! : cell
      if (allowsAutoWidthCell(shape) && hasAutoWidth(shape.getStyle())) shapes.add(shape)
    }
    if (shapes.size === 0) return
    model.batchUpdate(() => {
      for (const shape of shapes) {
        const geometry = shape.getGeometry()!
        const width = fittedWidthOf(shape)
        if (width === null || width === geometry.width) continue
        const fitted = geometry.clone()
        // A table keeps its left edge, so that its fields stay where they are while one of them changes.
        fitted.x = anchoredX(geometry.x, geometry.width, width, isTable(shape) ? 'left' : alignOf(graph.getCellStyle(shape)))
        fitted.width = width
        model.setGeometry(shape, fitted)
      }
    })
  }
  /**
   * Sets text sizes in one change: fields and headers of tables get the height that fits their text, and shapes with
   * auto width fit their width.
   */
  const applyFontSizes = (cells: Cell[], sizeOf: (cell: Cell) => number) => {
    if (cells.length === 0) return
    graph.stopEditing(false)
    model.batchUpdate(() => {
      for (const cell of cells) {
        const size = sizeOf(cell)
        setStyleValue([cell], 'fontSize', size)
        if (isTable(cell)) setStyleValue([cell], 'startSize', tableHeaderHeight(size))
        else if (isTable(cell.getParent())) setHeight(cell, tableFieldHeight(size))
      }
      fitAutoWidth(cells)
    })
  }

  // The label of a shape with auto width changes inside this event, so the new width is a part of the same change.
  const handleLabelChanged = (_sender: unknown, event: EventObject) => fitAutoWidth([event.getProperty('cell') as Cell])
  graph.addListener(InternalEvent.LABEL_CHANGED, handleLabelChanged)
  // Only the participant resizes cells this way (layouts set geometries directly): a width set by hand replaces the
  // auto width, in the same change.
  const handleResize = (_sender: unknown, event: EventObject) => {
    const cells = event.getProperty('cells') as Cell[]
    const previous = event.getProperty('prev') as (Geometry | null)[]
    const resized = cells.filter(
      (cell, index) => hasAutoWidth(cell.getStyle()) && previous[index] && previous[index].width !== cell.getGeometry()?.width,
    )
    setStyleValue(resized, AUTO_WIDTH_KEY, undefined)
  }
  graph.addListener(InternalEvent.RESIZE_CELLS, handleResize)

  const readState = (): EditorState => {
    const edges = selectedEdges()
    return {
      canUndo: !readOnly && undoManager.canUndo(),
      canRedo: !readOnly && undoManager.canRedo(),
      scale: graph.getView().scale,
      tableSelected: selectedTable() !== null,
      edgeMarkers: edges.length > 0 ? { start: sameMarker(edges, 'start'), end: sameMarker(edges, 'end') } : null,
      colors: selectionColors(),
      line: selectionLine(),
      text: selectionText(),
      geometry: selectionGeometry(),
      quickConnect: readOnly ? null : quickConnect(),
      canPaste: !readOnly && (clipboard.read() !== null || canReadSystemClipboard()),
      arrange: geometryCells().length,
      canGroup: !readOnly && canGroup(),
      canUngroup: !readOnly && graph.getSelectionCells().some(isGroup),
      hasCells: graph.getDefaultParent().getChildCount() > 0,
      canCopy: graph.getSelectionCells().some((cell) => cell.isVertex()),
    }
  }
  // Cached so that the same state object is returned until something changes (useSyncExternalStore).
  let state = readState()
  const listeners = new Set<() => void>()
  const notify = () => {
    state = readState()
    listeners.forEach((listener) => listener())
  }
  undoManager.on('stack-item-added', notify)
  undoManager.on('stack-item-popped', notify)
  undoManager.on('stack-cleared', notify)
  graph.getView().addListener(InternalEvent.SCALE, notify)
  graph.getView().addListener(InternalEvent.SCALE_AND_TRANSLATE, notify)
  // The selection and the markers of the selected edges, also when another participant changes them.
  graph.getSelectionModel().addListener(InternalEvent.CHANGE, notify)
  model.addListener(InternalEvent.CHANGE, notify)

  const removeSelection = () => {
    if (graph.isEditing() || graph.isSelectionEmpty()) return
    const cells = graph.getSelectionCells()
    const tables = cells.flatMap((cell) => (isTable(cell.getParent()) ? [cell.getParent()!] : []))
    model.batchUpdate(() => {
      graph.removeCells(cells, true)
      // A table with auto width fits the fields that are left; a removed table has no parent any more.
      fitAutoWidth(tables.filter((table) => table.getParent() !== null))
    })
  }
  const keyHandler = new KeyHandler(graph)
  // maxGraph reads only Ctrl; on macOS the shortcuts are Cmd.
  keyHandler.isControlDown = (event) => event.ctrlKey || (Client.IS_MAC && event.metaKey)
  // Ctrl+C, Ctrl+X and Ctrl+V are clipboard events (see below): binding them would cancel the keys, and the events with
  // them.
  keyHandler.bindControlKey(KEY_A, () => editor.selectAll())
  if (!readOnly) {
    keyHandler.bindKey(KEY_DELETE, removeSelection)
    keyHandler.bindKey(KEY_BACKSPACE, removeSelection)
    keyHandler.bindControlKey(KEY_Z, () => editor.undo())
    keyHandler.bindControlShiftKey(KEY_Z, () => editor.redo())
    keyHandler.bindControlKey(KEY_Y, () => editor.redo())
    keyHandler.bindControlKey(KEY_D, () => editor.duplicate())
    keyHandler.bindKey(KEY_F2, () => editor.editLabel())
    keyHandler.bindControlKey(KEY_B, () => editor.toggleFontStyle('bold'))
    keyHandler.bindControlKey(KEY_I, () => editor.toggleFontStyle('italic'))
    keyHandler.bindControlKey(KEY_U, () => editor.toggleFontStyle('underline'))
    keyHandler.bindControlKey(KEY_G, () => editor.group())
    keyHandler.bindControlShiftKey(KEY_G, () => editor.ungroup())
    // A pixel, or with Shift a step of the grid, as in draw.io; not snapped to the grid.
    for (const [key, dx, dy] of ARROWS) {
      keyHandler.bindKey(key, () => editor.moveSelection(dx, dy))
      keyHandler.bindShiftKey(key, () => editor.moveSelection(dx * graph.getGridSize(), dy * graph.getGridSize()))
    }
  }
  // The scale is the participant's own, so a participant who may only view fits the page too.
  keyHandler.bindControlShiftKey(KEY_H, () => editor.zoomToFit())

  // The browser fires clipboard events at the focused element, or at the body when nothing has the focus; maxGraph
  // takes keys from both. While a label is edited, the browser copies and pastes its text.
  const page = container.ownerDocument
  const isCanvasEvent = (event: Event) => {
    const target = event.target
    if (graph.isEditing()) return false
    return target === page.body || target === page.documentElement || (target instanceof Node && container.contains(target))
  }
  const handleCopy = (event: ClipboardEvent) => {
    if (!isCanvasEvent(event) || !event.clipboardData || cellsToCopy().length === 0) return
    event.preventDefault()
    editor.copy(event.clipboardData)
  }
  const handleCut = (event: ClipboardEvent) => {
    if (readOnly || !isCanvasEvent(event) || !event.clipboardData || cellsToCopy().length === 0) return
    event.preventDefault()
    editor.cut(event.clipboardData)
  }
  const handlePaste = (event: ClipboardEvent) => {
    if (readOnly || !isCanvasEvent(event)) return
    event.preventDefault()
    editor.paste(undefined, event.clipboardData?.getData('text/plain') ?? '')
  }
  page.addEventListener('copy', handleCopy)
  page.addEventListener('cut', handleCut)
  page.addEventListener('paste', handlePaste)
  let destroyed = false

  // maxGraph cancels pointerdown, so the canvas would not take focus and its keyboard shortcuts would
  // not work after clicking a palette button. The in-place label editor keeps its own focus.
  const focusCanvas = (event: PointerEvent) => {
    if (!(event.target instanceof HTMLElement && event.target.isContentEditable)) {
      container.focus({ preventScroll: true })
    }
  }
  container.addEventListener('pointerdown', focusCanvas, true)

  const handleWheel = (event: Event, up: boolean) => {
    const wheel = event as WheelEvent
    if (!wheel.ctrlKey && !wheel.metaKey) return
    if (up) graph.zoomIn()
    else graph.zoomOut()
    InternalEvent.consume(event)
  }
  InternalEvent.addMouseWheelListener(handleWheel, container)

  const toDiagramPoint = (clientX: number, clientY: number): Point => {
    const rect = container.getBoundingClientRect()
    const { scale, translate } = graph.getView()
    return {
      x: (clientX - rect.left + container.scrollLeft) / scale - translate.x,
      y: (clientY - rect.top + container.scrollTop) / scale - translate.y,
    }
  }

  const visibleCenter = (): Point => {
    const rect = container.getBoundingClientRect()
    return toDiagramPoint(rect.left + container.clientWidth / 2, rect.top + container.clientHeight / 2)
  }

  const pointerListeners = new Set<(point: Point | null) => void>()
  const handlePointerMove = (event: PointerEvent) => {
    const point = toDiagramPoint(event.clientX, event.clientY)
    pointerListeners.forEach((listener) => listener(point))
  }
  const handlePointerLeave = () => pointerListeners.forEach((listener) => listener(null))
  // Captured: maxGraph stops pointer events on connection points and selection handles from bubbling up.
  container.addEventListener('pointermove', handlePointerMove, true)
  container.addEventListener('pointerleave', handlePointerLeave)

  const menuListeners = new Set<(request: ContextMenuRequest) => void>()
  const menuTarget = (): MenuTarget => {
    const cells = graph.getSelectionCells()
    if (cells.length === 0) return 'canvas'
    if (cells.length > 1) return 'selection'
    const cell = cells[0]!
    if (cell.isEdge()) return 'edge'
    if (isTable(cell.getParent())) return 'field'
    if (isGroup(cell)) return 'group'
    return isTable(cell) ? 'table' : 'shape'
  }
  // maxGraph decides when a right click is a menu click (not panning), and selects the cell under the pointer
  // first. It shows no menu of its own: the factory adds no items to it.
  const popupMenu = graph.getPlugin<PopupMenuHandler>('PopupMenuHandler')
  if (popupMenu) {
    popupMenu.factoryMethod = (_menu, _cell, event) => {
      if (graph.isEditing()) return
      const rect = container.getBoundingClientRect()
      const request: ContextMenuRequest = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        point: toDiagramPoint(event.clientX, event.clientY),
        target: menuTarget(),
      }
      menuListeners.forEach((listener) => listener(request))
    }
  }
  // The label editor keeps the menu of the browser, with its text actions and spelling suggestions.
  const preventBrowserMenu = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLElement && event.target.isContentEditable)) event.preventDefault()
  }
  container.addEventListener('contextmenu', preventBrowserMenu)

  const selectionListeners = new Set<(ids: string[]) => void>()
  const handleSelectionChange = () => {
    const ids = graph.getSelectionCells().flatMap((cell) => cell.getId() ?? [])
    selectionListeners.forEach((listener) => listener(ids))
  }
  graph.getSelectionModel().addListener(InternalEvent.CHANGE, handleSelectionChange)

  let viewVersion = 0
  const viewListeners = new Set<() => void>()
  const notifyView = () => {
    viewVersion++
    viewListeners.forEach((listener) => listener())
  }
  container.addEventListener('scroll', notifyView)
  graph.getView().addListener(InternalEvent.SCALE, notifyView)
  graph.getView().addListener(InternalEvent.TRANSLATE, notifyView)
  graph.getView().addListener(InternalEvent.SCALE_AND_TRANSLATE, notifyView)
  model.addListener(InternalEvent.CHANGE, notifyView)

  const listen = <T>(set: Set<T>, listener: T) => {
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }

  /** Inserts a palette shape with its children; the caller wraps it in a model update. */
  const insertShape = (shape: ShapePreset, parent: Cell, x: number, y: number): Cell => {
    const cell = graph.insertVertex({
      parent,
      value: shape.value,
      position: [x, y],
      size: [shape.width, shape.height],
      style: markedStyle(shape) as CellStyle,
    })
    let childY = isTableStyle(shape.style) ? TABLE_HEADER_HEIGHT : 0
    for (const child of shape.children ?? []) {
      graph.insertVertex({
        parent: cell,
        value: child.value,
        position: [0, childY],
        size: [shape.width, child.height],
        style: { ...child.style } as CellStyle,
      })
      childY += child.height
    }
    fitAutoWidth([cell])
    return cell
  }

  /** The selection with fields and shapes of groups replaced by their tables and groups, and the edges between them. */
  const cellsToCopy = (): Cell[] => {
    const layer = graph.getDefaultParent()
    // The ancestor on the page: a field belongs to its table, a shape of a group to the group.
    const owner = (cell: Cell) => {
      let current = cell
      while (current.getParent() && current.getParent() !== layer) current = current.getParent()!
      return current
    }
    const shapes = new Set(
      graph
        .getSelectionCells()
        .filter((cell) => cell.isVertex())
        .map(owner),
    )
    const copied = (terminal: Cell | null) => terminal !== null && shapes.has(owner(terminal))
    const edges = graph
      .getDefaultParent()
      .getChildren()
      .filter((cell) => cell.isEdge() && copied(cell.getTerminal(true)) && copied(cell.getTerminal(false)))
    return [...shapes, ...edges]
  }
  /** Adds clones of `cells` moved by (dx, dy) as one undo step and selects them. */
  const insertCopies = (cells: Cell[], dx: number, dy: number) => {
    graph.stopEditing(false)
    graph.setSelectionCells(graph.importCells(cells, dx, dy, graph.getDefaultParent()))
    container.focus({ preventScroll: true })
  }
  /** Puts clones of `cells` into the clipboard of the tab and their text into the clipboard of the system. */
  const copyCells = (cells: Cell[], data?: DataTransfer | null) => {
    // Clones without a graph: the copied cells may change or be removed before they are pasted.
    const clones = graph.cloneCells(cells, false)
    const text = clipboardText(clones)
    clipboard.put(clones, text)
    if (data) data.setData('text/plain', text)
    else writeSystemClipboard(text)
    notify()
  }
  /** Adds copies of clipboard cells: with their top-left corner at `at`, or shifted further with every paste. */
  const pasteCells = (cells: Cell[] | null, at?: Point) => {
    if (!cells) return
    if (at) {
      const bounds = graph.getBoundingBoxFromGeometry(cells, false)
      insertCopies(cells, at.x - (bounds?.x ?? 0), at.y - (bounds?.y ?? 0))
    } else {
      const shift = clipboard.nextPaste() * PASTE_OFFSET
      insertCopies(cells, shift, shift)
    }
  }
  /**
   * Adds a text shape with `text`: with its top-left corner at `at`, or in the middle of the visible area. The height
   * holds all lines, the width follows the longest one.
   */
  const addText = (text: string, at?: Point) => {
    const preset = findShape('text')!
    const lines = text.split(/\r?\n/).length
    const fontSize = Number(graph.getStylesheet().getDefaultVertexStyle().fontSize ?? StyleDefaultsConfig.fontSize)
    const height = Math.max(preset.height, Math.ceil(lines * fontSize * LINE_HEIGHT + TEXT_PADDING))
    const center = visibleCenter()
    const x = at ? at.x : center.x - preset.width / 2
    const y = at ? at.y : center.y - height / 2
    graph.stopEditing(false)
    model.beginUpdate()
    let cell: Cell
    try {
      cell = insertShape({ ...preset, value: text.replace(/\r\n/g, '\n'), height }, graph.getDefaultParent(), x, y)
      // The fitted width keeps the centre of the text; a text pasted at a point starts there.
      const geometry = cell.getGeometry()!
      if (at && geometry.x !== at.x) {
        const placed = geometry.clone()
        placed.x = at.x
        model.setGeometry(cell, placed)
      }
    } finally {
      model.endUpdate()
    }
    graph.setSelectionCell(cell)
    container.focus({ preventScroll: true })
  }
  /** Selected cells without table fields: the table layout, not the user, orders fields. */
  const selectedShapesAndEdges = () => graph.getSelectionCells().filter((cell) => !isTable(cell.getParent()))

  const editor: DiagramEditor = {
    graph,
    pageId,
    readOnly,
    addShape(shapeId, center = visibleCenter()) {
      const shape = findShape(shapeId)
      if (!shape) return null
      const size = graph.getGridSize()
      const snap = (value: number) => Math.round(value / size) * size
      const parent = graph.getDefaultParent()
      const vertices = Array.from({ length: parent.getChildCount() }, (_, index) => parent.getChildAt(index)).filter(
        (cell) => cell.isVertex(),
      )
      const occupied = (cx: number, cy: number) =>
        vertices.some((cell) => {
          const geometry = cell.getGeometry()
          return (
            geometry !== null &&
            Math.abs(geometry.x + geometry.width / 2 - cx) < size &&
            Math.abs(geometry.y + geometry.height / 2 - cy) < size
          )
        })
      // Repeated clicks would stack shapes on top of each other; cascade them instead.
      let { x: cx, y: cy } = center
      while (occupied(cx, cy)) {
        cx += 2 * size
        cy += 2 * size
      }
      const x = snap(cx - shape.width / 2)
      const y = snap(cy - shape.height / 2)
      // The shape and its children, e.g. the first field of a table, are one change and one undo step.
      model.beginUpdate()
      let cell: Cell
      try {
        cell = insertShape(shape, parent, x, y)
      } finally {
        model.endUpdate()
      }
      graph.setSelectionCell(cell)
      container.focus({ preventScroll: true })
      return cell
    },
    addTableField() {
      const table = selectedTable()
      if (!table) return null
      const selected = graph.getSelectionCell()
      const fields = Array.from({ length: table.getChildCount() }, (_, index) => table.getChildAt(index))
      const after = selected !== table ? selected : (fields.at(-1) ?? null)
      // The new field has the text size and the height of the field it follows.
      const fontSize = (after?.getStyle() as ShapeStyle | undefined)?.fontSize
      const height = after?.getGeometry()?.height ?? TABLE_FIELD_HEIGHT
      // The table layout stacks fields in the order of the cells and fixes the position.
      const field = new Cell('', new Geometry(0, TABLE_HEADER_HEIGHT, table.getGeometry()!.width, height), {
        ...TABLE_FIELD_STYLE,
        ...(fontSize !== undefined && { fontSize }),
      } as CellStyle)
      field.setVertex(true)
      graph.addCell(field, table, after ? table.getIndex(after) + 1 : fields.length)
      graph.setSelectionCell(field)
      graph.startEditingAtCell(field)
      return field
    },
    addConnectedShape(side, shapeId) {
      const shape = findShape(shapeId)
      const selected = quickConnectSource()
      const geometry = selected?.cell.getGeometry()
      // Only shapes of the same notation are connected this way.
      if (!shape || !selected || !geometry || shapeGroup(shape.id) !== selected.group) return null
      const source = selected.cell
      graph.stopEditing(false)
      const parent = source.getParent()!
      const obstacles = parent
        .getChildren()
        .filter((cell) => cell !== source && cell.isVertex() && blocksPlacement(cell.getStyle() as ShapeStyle))
        .flatMap((cell) => cell.getGeometry() ?? [])
      const { x, y } = placeConnected(geometry, shape, side, obstacles)
      model.beginUpdate()
      let cell: Cell
      try {
        cell = insertShape(shape, parent, x, y)
        graph.insertEdge({ parent, value: '', source, target: cell })
      } finally {
        model.endUpdate()
      }
      graph.setSelectionCell(cell)
      container.focus({ preventScroll: true })
      return cell
    },
    copy(data) {
      const cells = cellsToCopy()
      if (cells.length === 0) return
      copyCells(cells, data)
    },
    cut(data) {
      const cells = cellsToCopy()
      if (cells.length === 0) return
      graph.stopEditing(false)
      copyCells(cells, data)
      graph.removeCells(cells, true)
    },
    paste(at, text) {
      if (text === undefined || text === clipboard.text()) {
        pasteCells(clipboard.read(), at)
        return
      }
      // Reading a compressed diagram of draw.io takes a moment.
      void readClipboardText(text).then((content) => {
        if (destroyed || !content) return
        if (content.kind === 'text') {
          addText(content.text, at)
          return
        }
        clipboard.put(content.cells, text)
        pasteCells(content.cells, at)
        notify()
      })
    },
    duplicate() {
      const cells = cellsToCopy()
      if (cells.length > 0) insertCopies(cells, PASTE_OFFSET, PASTE_OFFSET)
    },
    bringToFront() {
      const cells = selectedShapesAndEdges()
      if (cells.length > 0) graph.orderCells(false, cells)
    },
    sendToBack() {
      const cells = selectedShapesAndEdges()
      if (cells.length > 0) graph.orderCells(true, cells)
    },
    selectAll() {
      graph.stopEditing(false)
      graph.selectAll()
    },
    moveSelection(dx, dy) {
      // A field moves with its table: the table layout places fields.
      const cells = new Set(graph.getSelectionCells().map((cell) => (isTable(cell.getParent()) ? cell.getParent()! : cell)))
      const movable = graph.getMovableCells([...cells])
      if (movable.length === 0 || (dx === 0 && dy === 0)) return
      graph.stopEditing(false)
      graph.moveCells(movable, dx, dy)
    },
    alignShapes(align) {
      const cells = geometryCells()
      if (cells.length < 2) return
      graph.stopEditing(false)
      graph.alignCells(align, cells)
    },
    distributeShapes(direction) {
      const cells = geometryCells()
      if (cells.length < 3) return
      const horizontal = direction === 'horizontal'
      const size = (cell: Cell) => (horizontal ? cell.getGeometry()!.width : cell.getGeometry()!.height)
      // On the page: a shape in a group has its geometry relative to the group, and may be selected with others.
      const offset = (cell: Cell) => {
        let sum = 0
        for (let parent = cell.getParent(); parent && parent !== graph.getDefaultParent(); parent = parent.getParent()) {
          const geometry = parent.getGeometry()
          if (geometry) sum += horizontal ? geometry.x : geometry.y
        }
        return sum
      }
      const start = (cell: Cell) => offset(cell) + (horizontal ? cell.getGeometry()!.x : cell.getGeometry()!.y)
      const sorted = [...cells].sort((a, b) => start(a) - start(b))
      const first = sorted[0]!
      const last = sorted.at(-1)!
      const sizes = sorted.reduce((sum, cell) => sum + size(cell), 0)
      // Equal gaps rather than equal steps of centres: shapes of different sizes look even.
      const gap = (start(last) + size(last) - start(first) - sizes) / (sorted.length - 1)
      graph.stopEditing(false)
      model.batchUpdate(() => {
        let position = start(first) + size(first) + gap
        for (const cell of sorted.slice(1, -1)) {
          const moved = cell.getGeometry()!.clone()
          if (horizontal) moved.x = position - offset(cell)
          else moved.y = position - offset(cell)
          model.setGeometry(cell, moved)
          position += size(cell) + gap
        }
      })
    },
    group() {
      if (!canGroup()) return null
      graph.stopEditing(false)
      const group = new Cell('', new Geometry(), { ...GROUP_STYLE })
      group.setVertex(true)
      group.setConnectable(false)
      // maxGraph moves the cells into the group relative to it, and edges between them follow (maintainEdgeParent).
      graph.groupCells(group, 0, groupableCells())
      graph.setSelectionCell(group)
      container.focus({ preventScroll: true })
      return group
    },
    ungroup() {
      const groups = graph.getSelectionCells().filter(isGroup)
      if (groups.length === 0) return
      graph.stopEditing(false)
      graph.setSelectionCells(graph.ungroupCells(groups))
      container.focus({ preventScroll: true })
    },
    reverseEdge() {
      const edge = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
      if (!edge?.isEdge()) return
      graph.stopEditing(false)
      const source = edge.getTerminal(true)
      const target = edge.getTerminal(false)
      model.beginUpdate()
      try {
        model.setTerminal(edge, target, true)
        model.setTerminal(edge, source, false)
        const geometry = edge.getGeometry()
        if (geometry) {
          const reversed = geometry.clone()
          reversed.points = geometry.points ? [...geometry.points].reverse() : geometry.points
          reversed.sourcePoint = geometry.targetPoint
          reversed.targetPoint = geometry.sourcePoint
          model.setGeometry(edge, reversed)
        }
        const style = edge.getStyle() as Record<string, unknown>
        if (END_STYLE_KEYS.some(([exit, entry]) => exit in style || entry in style)) {
          const swapped = { ...style }
          for (const [exit, entry] of END_STYLE_KEYS) {
            delete swapped[exit]
            delete swapped[entry]
            if (style[entry] !== undefined) swapped[exit] = style[entry]
            if (style[exit] !== undefined) swapped[entry] = style[exit]
          }
          model.setStyle(edge, swapped as CellStyle)
        }
      } finally {
        model.endUpdate()
      }
    },
    editLabel() {
      const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
      if (cell) graph.startEditingAtCell(cell)
    },
    deleteSelection: removeSelection,
    exportSvg({ selectionOnly = false, ...options } = {}) {
      const copied = selectionOnly ? new Set(cellsToCopy()) : null
      // In the order of the page, so that what lies on top on the canvas lies on top in the image.
      const cells = graph
        .getDefaultParent()
        .getChildren()
        .filter((cell) => !copied || copied.has(cell))
      if (copied && cells.length === 0) return null
      const image = renderSvg(graph, cells, options)
      return image && { ...image, cellIds: copied ? cells.flatMap((cell) => cell.getId() ?? []) : null }
    },
    focus() {
      if (!graph.isEditing()) container.focus({ preventScroll: true })
    },
    onContextMenu: (listener) => listen(menuListeners, listener),
    setEdgeMarker(end, marker) {
      const edges = selectedEdges()
      if (edges.length === 0) return
      graph.stopEditing(false)
      graph.setCellStyles(end === 'start' ? 'startArrow' : 'endArrow', marker as StyleArrowValue, edges)
    },
    setColor(target, color) {
      const cells = graph.getSelectionCells().filter((cell) => target !== 'fill' || cell.isVertex())
      if (cells.length === 0) return
      graph.stopEditing(false)
      graph.setCellStyles(COLOR_KEYS[target], color, cells)
    },
    setFontSize(size) {
      applyFontSizes(textCells(), () => clampFontSize(size))
    },
    stepFontSize(direction) {
      applyFontSizes(textCells(), (cell) => nextFontSize(fontSizeOf(cell), direction))
    },
    toggleFontStyle(flag) {
      const cells = textCells()
      if (cells.length === 0) return
      const bit = FONT_STYLE_BITS[flag]
      const on = !hasFontStyle(cells, flag)
      graph.stopEditing(false)
      model.batchUpdate(() => {
        for (const cell of cells) {
          const next = on ? fontStyleOf(cell) | bit : fontStyleOf(cell) & ~bit
          setStyleValue([cell], 'fontStyle', next === 0 ? undefined : next)
        }
        // Bold and italic text is wider.
        fitAutoWidth(cells)
      })
    },
    setTextAlign(align) {
      const cells = textCells()
      if (cells.length === 0) return
      graph.stopEditing(false)
      // Centred is the default of shapes and edges; fields of tables store their left alignment.
      setStyleValue(cells, 'align', align === 'center' ? undefined : align)
    },
    setLineStyle({ width, dash, edgeShape }) {
      const cells = graph.getSelectionCells()
      if (cells.length === 0) return
      graph.stopEditing(false)
      // Default values are kept by removing their keys, as draw.io does.
      model.batchUpdate(() => {
        if (width !== undefined) {
          const clamped = Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, width))
          setStyleValue(cells, 'strokeWidth', clamped === MIN_LINE_WIDTH ? undefined : clamped)
        }
        if (dash !== undefined) {
          setStyleValue(cells, 'dashed', dash === 'solid' ? undefined : true)
          setStyleValue(cells, 'dashPattern', dash === 'dotted' ? DOTTED_PATTERN : undefined)
        }
        const edges = cells.filter((cell) => cell.isEdge())
        if (edgeShape !== undefined && edges.length > 0) {
          // Without edgeStyle an edge follows the orthogonal default of CoDraw.
          setStyleValue(edges, 'edgeStyle', edgeShape === 'straight' ? 'none' : undefined)
          setStyleValue(edges, 'curved', edgeShape === 'curved' ? true : undefined)
        }
      })
    },
    setAutoWidth(enabled) {
      const cells = autoWidthCells()
      if (cells.length === 0) return
      graph.stopEditing(false)
      model.batchUpdate(() => {
        setStyleValue(cells, AUTO_WIDTH_KEY, enabled ? true : undefined)
        fitAutoWidth(cells)
      })
    },
    setGeometry({ x, y, width, height }) {
      const cells = geometryCells()
      if (cells.length === 0) return
      graph.stopEditing(false)
      model.batchUpdate(() => {
        for (const cell of cells) {
          const geometry = cell.getGeometry()!
          const next = geometry.clone()
          if (graph.isCellMovable(cell)) {
            if (x !== undefined) next.x = x
            if (y !== undefined) next.y = y
          }
          if (graph.isCellResizable(cell)) {
            if (width !== undefined) next.width = Math.max(MIN_SHAPE_SIZE, width)
            // The fields of a table set its height.
            if (height !== undefined && !isTable(cell)) next.height = Math.max(MIN_SHAPE_SIZE, height)
          }
          if (next.x === geometry.x && next.y === geometry.y && next.width === geometry.width && next.height === geometry.height) {
            continue
          }
          model.setGeometry(cell, next)
          // A width set by hand replaces the auto width.
          if (next.width !== geometry.width) setStyleValue([cell], AUTO_WIDTH_KEY, undefined)
        }
      })
    },
    toDiagramPoint,
    toCanvasPoint({ x, y }) {
      const { scale, translate } = graph.getView()
      return {
        x: (x + translate.x) * scale - container.scrollLeft,
        y: (y + translate.y) * scale - container.scrollTop,
      }
    },
    cellBounds(id) {
      const cell = model.getCell(id)
      const state = cell ? graph.getView().getState(cell) : null
      if (!state) return null
      return { x: state.x - container.scrollLeft, y: state.y - container.scrollTop, width: state.width, height: state.height }
    },
    viewportSize: () => ({ width: container.clientWidth, height: container.clientHeight }),
    centerOn({ x, y }) {
      const view = graph.getView()
      const { scale, translate } = view
      const left = (x + translate.x) * scale - container.clientWidth / 2
      const top = (y + translate.y) * scale - container.clientHeight / 2
      const clamp = (value: number, max: number) => Math.max(0, Math.min(value, Math.max(0, max)))
      const scrollLeft = clamp(left, container.scrollWidth - container.clientWidth)
      const scrollTop = clamp(top, container.scrollHeight - container.clientHeight)
      container.scrollLeft = scrollLeft
      container.scrollTop = scrollTop
      // What scrolling cannot reach, panning does.
      const dx = left - container.scrollLeft
      const dy = top - container.scrollTop
      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) view.setTranslate(translate.x - dx / scale, translate.y - dy / scale)
      notifyView()
    },
    onPointerMove: (listener) => listen(pointerListeners, listener),
    onSelectionChange: (listener) => listen(selectionListeners, listener),
    onViewChange: (listener) => listen(viewListeners, listener),
    getViewVersion: () => viewVersion,
    undo() {
      graph.stopEditing(false)
      undoManager.undo()
    },
    redo() {
      graph.stopEditing(false)
      undoManager.redo()
    },
    zoomIn: () => graph.zoomIn(),
    zoomOut: () => graph.zoomOut(),
    zoomActual: () => graph.zoomActual(),
    zoomToFit() {
      fitter?.fit({ margin: FIT_MARGIN })
      notifyView()
    },
    getState: () => state,
    subscribe: (listener) => listen(listeners, listener),
    destroy() {
      Reflect.deleteProperty(container, EDITOR_PROPERTY)
      container.removeEventListener('pointerdown', focusCanvas, true)
      container.removeEventListener('contextmenu', preventBrowserMenu)
      container.removeEventListener('pointermove', handlePointerMove, true)
      container.removeEventListener('pointerleave', handlePointerLeave)
      container.removeEventListener('scroll', notifyView)
      page.removeEventListener('copy', handleCopy)
      page.removeEventListener('cut', handleCut)
      page.removeEventListener('paste', handlePaste)
      destroyed = true
      graph.getSelectionModel().removeListener(handleSelectionChange)
      graph.getSelectionModel().removeListener(notify)
      graph.removeListener(handleLabelChanged)
      graph.removeListener(handleResize)
      model.removeListener(notifyView)
      model.removeListener(notify)
      layoutManager.destroy()
      listeners.clear()
      pointerListeners.clear()
      selectionListeners.clear()
      menuListeners.clear()
      viewListeners.clear()
      InternalEvent.removeAllListeners(container)
      keyHandler.onDestroy()
      undoManager.off('stack-item-added', notify)
      undoManager.off('stack-item-popped', notify)
      undoManager.off('stack-cleared', notify)
      if (!sharedUndoManager) undoManager.destroy()
      binding.destroy()
      graph.destroy()
    },
  }
  if (readOnly) {
    const ignore = () => null
    Object.assign(editor, Object.fromEntries(CHANGING_COMMANDS.map((command) => [command, ignore])))
  }
  Object.defineProperty(container, EDITOR_PROPERTY, { value: editor, configurable: true })
  return editor
}

const COLOR_KEYS = { fill: 'fillColor', stroke: 'strokeColor', font: 'fontColor' } as const

function lineWidthOf(cell: Cell): number {
  return Number(cell.getStyle().strokeWidth ?? MIN_LINE_WIDTH)
}

function lineDashOf(cell: Cell): LineDash {
  const style = cell.getStyle()
  if (!style.dashed) return 'solid'
  return style.dashPattern === DOTTED_PATTERN ? 'dotted' : 'dashed'
}

/** The shape of an edge, or `null` for a routing of draw.io that CoDraw does not offer, e.g. `elbowEdgeStyle`. */
function edgeShapeOf(edge: Cell): EdgeShape | null {
  const style = edge.getStyle()
  if (style.curved) return 'curved'
  if (style.edgeStyle === 'none') return 'straight'
  return style.edgeStyle === undefined || style.edgeStyle === 'orthogonalEdgeStyle' ? 'orthogonal' : null
}

/** Style keys of where an edge leaves its source and enters its target; reversing the edge swaps them. */
const END_STYLE_KEYS = [
  ['exitX', 'entryX'],
  ['exitY', 'entryY'],
  ['exitDx', 'entryDx'],
  ['exitDy', 'entryDy'],
  ['exitPerimeter', 'entryPerimeter'],
] as const

/** The value shared by all items, or `null` when they differ. */
function same<T>(values: T[]): T | null {
  const distinct = new Set(values)
  return distinct.size === 1 ? values[0]! : null
}

/** Where the label of a shape is drawn horizontally, and so which point of the shape its fitted width keeps. */
function alignOf(style: CellStyle): Align {
  return style.align === 'left' || style.align === 'right' ? style.align : 'center'
}

function isTable(cell: Cell | null): boolean {
  return cell?.isVertex() === true && isTableStyle(cell.getStyle() as ShapeStyle)
}

/**
 * A group: a container of shapes without a fill and a border, like the groups of draw.io. Tables, and containers of
 * draw.io with a fill or a border, are not groups.
 */
export function isGroup(cell: Cell | null): boolean {
  if (!cell?.isVertex() || cell.getChildCount() === 0 || isTable(cell)) return false
  const style = cell.getStyle()
  return style.fillColor === 'none' && style.strokeColor === 'none'
}

/**
 * Stacks the fields of a table under its header in the order of the cells, across the whole width of the table,
 * and fits the table height to them.
 */
class TableLayout extends StackLayout {
  constructor(graph: Graph) {
    super(graph, false)
    this.fill = true
    this.resizeParent = true
  }

  // Fields cannot be dragged by the user, but the layout places them.
  override isVertexMovable(_cell: Cell) {
    return true
  }

  override execute(parent: Cell) {
    if (parent.getChildCount() > 0) {
      super.execute(parent)
      return
    }
    // Without fields the table is just its header.
    const geometry = parent.getGeometry()
    const header = Number(this.graph.getCellStyle(parent).startSize ?? TABLE_HEADER_HEIGHT)
    if (geometry && geometry.height !== header) {
      const fitted = geometry.clone()
      fitted.height = header
      this.graph.getDataModel().setGeometry(parent, fitted)
    }
  }
}

function configureSelection(graph: Graph) {
  const handler = graph.getPlugin<SelectionHandler>('SelectionHandler')
  if (!handler) return
  // Dragged shapes line up with the edges and centres of their neighbours; Alt turns the guides off, as it does the grid.
  handler.guidesEnabled = true
  handler.createGuide = () => {
    const guide = new Guide(graph, handler.getGuideStates())
    guide.isEnabledForEvent = (event: MouseEvent) => !event.altKey
    guide.getGuideColor = () => GUIDE_COLOR
    return guide
  }
  const propagate = handler.isPropagateSelectionCell.bind(handler)
  // A second click on a selected field would select its table, and Delete would then remove the whole table.
  // The table is selected by its header instead.
  handler.isPropagateSelectionCell = (cell, immediate, me) => !isTable(cell.getParent()) && propagate(cell, immediate, me)
}

/** The selection frame selects what it touches, as on the desktop of Windows; see {@link touchedByRegion}. */
function configureRegionSelection(graph: Graph) {
  const rubberBand = graph.getPlugin<RubberBandHandler>('RubberBandHandler')
  // The frame is translucent through its stylesheet; the opacity of maxGraph would fade its border as well.
  if (rubberBand) rubberBand.defaultOpacity = 100
  graph.selectRegion = (region, event) => {
    const view = graph.getView()
    const cells = graph
      .getDefaultParent()
      .getChildren()
      .filter((cell) => {
        const state = view.getState(cell)
        if (!state) return false
        if (cell.isEdge()) {
          const points = state.absolutePoints.filter((point) => point !== null)
          return touchedByRegion(region, { kind: 'edge', box: state, points })
        }
        // Groups let clicks through their empty space like frames do, but the selection frame takes them like shapes.
        const frame = !isGroup(cell) && (cell.getStyle() as ShapeStyle).pointerEvents === false
        return touchedByRegion(region, { kind: frame ? 'frame' : 'shape', box: state })
      })
    graph.selectCellsForEvent(cells, event)
    return cells
  }
}

function configureConnections(graph: Graph) {
  const handler = graph.getPlugin<ConnectionHandler>('ConnectionHandler')
  if (!handler) return
  handler.connectImage = CONNECT_ICON
  // Show the connection point whenever the pointer is over a shape, not only over its centre.
  handler.marker.hotspot = 1
  // Just outside the right border: the pointer reaches it without leaving the shape, and it does not
  // cover the resize handle in the middle of the border when the shape is selected.
  handler.getIconPosition = (icon: ImageShape, state: CellState) => {
    const bounds = icon.bounds!
    return new GraphPoint(state.x + state.width, state.getCenterY() - bounds.height / 2)
  }
}

function configureStyles(graph: Graph) {
  const stylesheet = graph.getStylesheet()
  Object.assign(stylesheet.getDefaultVertexStyle(), {
    fillColor: '#ffffff',
    strokeColor: '#1f2328',
    fontColor: '#1f2328',
    fontSize: 13,
    whiteSpace: 'wrap',
  })
  Object.assign(stylesheet.getDefaultEdgeStyle(), {
    edgeStyle: 'orthogonalEdgeStyle',
    strokeColor: '#1f2328',
    fontColor: '#1f2328',
    endArrow: 'classic',
  })
}
