import {
  Cell,
  CellEditorHandler,
  Client,
  ConnectionHandler,
  FitPlugin,
  Geometry,
  GeometryChange,
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
  SelectionCellsHandler,
  StackLayout,
  StyleDefaultsConfig,
  TooltipHandler,
  ValueChange,
  getDefaultPlugins,
  type CellState,
  type CellStyle,
  type EventObject,
  type ImageShape,
  type StyleArrowValue,
} from '@maxgraph/core'
import * as Y from 'yjs'
import { vendorOf, VENDOR_KEY, type DbVendorId } from '../sql/dbVendors.ts'
import { fieldText, plainText, renameField, splitField } from '../sql/tableField.ts'
import { indexText, renameIndex, renameIndexColumn, splitIndex, type IndexParts } from '../sql/tableIndex.ts'
import {
  allowsAutoWidth,
  anchoredX,
  AUTO_WIDTH_KEY,
  fittedWidth,
  hasAutoWidth,
  hasTextWrap,
  measureLabel,
  TEXT_WRAP_KEY,
  wrapLabel,
  type Align,
} from './autoWidth.ts'
import {
  BASE_KEY,
  BASE_TABLE_KEY,
  baseOptions,
  baseTableId,
  DEFAULT_BASE_KEY,
  defaultBase,
  inheritedFieldId,
  isBaseTable,
  isDefaultBase,
  pageTables,
  syncBaseTables,
} from './baseTables.ts'
import {
  attributionLabel,
  MODIFIED_AT_KEY,
  MODIFIED_BY_KEY,
  MODIFIED_BY_NAME_KEY,
  readAttribution,
  writeAttribution,
  type Attribution,
} from './attribution.ts'
import { createCell, createUndoManager, DiagramBinding, LOCAL_ORIGIN, toGeometry } from './binding.ts'
import type { MenuTarget } from './canvasMenu.ts'
import { canReadSystemClipboard, clipboard, writeSystemClipboard } from './clipboard.ts'
import { clipboardContent, dataToCells, readClipboardText } from './clipboardFormat.ts'
import type { CellSnapshot } from './diff.ts'
import { registerDiagramExtensions } from './extensions.ts'
import { frameParents, layoutShapes, type LayoutDirection, type LayoutEdge, type LayoutShape } from './layout.ts'
import {
  hasLockedDescendant,
  LOCKED_BY_KEY,
  LOCKED_KEY,
  lockedByOf,
  lockHolder,
  lockHolders,
  unlockCopy,
} from './locks.ts'
import { compareCells, DEFAULT_PAGE_ID, getCells, type CellData, type StyleValue } from './model.ts'
import { blocksPlacement, placeConnected, type Side } from './quickConnect.ts'
import { DEFAULT_FONT, fontFamilyOf } from './fonts.ts'
import { touchedByRegion } from './regionSelection.ts'
import { cellsToRestore, writeRestoredFields } from './restore.ts'
import { startEdgeRouting } from './routing/edgeRouter.ts'
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
  TABLE_INDEX_GAP,
  TABLE_INDEX_KEY,
  type ShapeId,
  type ShapeGroup,
  type ShapePreset,
  type ShapeStyle,
} from './shapes.ts'
import { BASE_BADGE, badgeRoom, nameX, ROW_PADDING } from './tableRows.ts'
import {
  FIELD_PLACEHOLDER,
  INDEX_PLACEHOLDER,
  isColumnField,
  isIndexRow,
  registerTableShapes,
  TABLE_FIELD_SHAPE,
  tableRowsOf,
  tablesShowing,
  watchTableRows,
} from './tableShapes.ts'
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
  /** Font of the text; `null` when it differs between the selected objects. */
  fontFamily: string | null
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
  /**
   * The words of the labels of the selected shapes wrap onto lines that fit them: `true` when they do for all of them
   * that allow it, `null` when no selected shape allows it.
   */
  textWrap: boolean | null
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

/** The type and keys of the selected field of a table, as its text has them. */
export interface SelectedField {
  /** Ids of the field and of its table. */
  cellId: string
  tableId: string
  type: string
  notNull: boolean
  primaryKey: boolean
  unique: boolean
  /** The name of the base table whose field this one inherits, or `null` for a field of its own. */
  inheritedFrom: string | null
}

/** The columns and the uniqueness of the selected index of a table, as its text has them. */
export interface SelectedIndex {
  /** Ids of the row of the index and of its table. */
  cellId: string
  tableId: string
  /** What the parentheses of the index hold, e.g. `org_id, created_at`. */
  columns: string
  unique: boolean
}

/** What the selected table, or the table of the selected field, is as to base tables. */
export interface TableBase {
  /** The table is a base table, whose fields the tables that choose it inherit. */
  base: boolean
  /** The base table that new tables of the page get. */
  defaultBase: boolean
  /** The id of the base table the table inherits, or `null`. */
  baseId: string | null
  /** Base tables the table may inherit: those of the page but itself and the tables that inherit it. */
  options: { id: string; name: string }[]
}

/** A lock that holds selected elements: the element that has it, the selected one or a group or table above it. */
export interface CellLock {
  cellId: string
  /** The name of the participant who locked it, or `null`, e.g. for an element locked in draw.io. */
  lockedBy: string | null
}

/** How the selected elements are locked against changes. */
export interface SelectionLock {
  /** Every selected element is locked: the commands change none of them. */
  all: boolean
  /**
   * A selected element, or the table of a selected field or index, is not locked, so {@link DiagramEditor.setLocked}
   * locks it.
   */
  canLock: boolean
  /** The locks that hold selected elements, each once; empty when none is locked. */
  locks: CellLock[]
}

/** Who changed the single selected element last and when, as the element keeps it. */
export interface SelectionAttribution extends Attribution {
  /** The participant of the editor changed it. */
  mine: boolean
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
  /** The database of the selected table or of the table of the selected field; `null` without one. */
  tableVendor: DbVendorId | null
  /** The single selected field of a table, or `null`. */
  field: SelectedField | null
  /** The single selected index of a table, or `null`. */
  index: SelectedIndex | null
  /** The selected table, or the table of the selected field, as to base tables; `null` when none is selected. */
  tableBase: TableBase | null
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
  /** {@link DiagramEditor.autoLayout} lays out the selection: it has two shapes, tables or groups at least. */
  layoutSelection: boolean
  /** The laser pointer is on: dragging on the canvas draws its trail instead of selecting or moving anything. */
  laser: boolean
  /** The comment tool is on: a click on the canvas places a comment instead of selecting anything. */
  commentTool: boolean
  /** How the selection is locked, or `null` when nothing is selected. */
  lock: SelectionLock | null
  /** Who changed the single selected element last, or `null` without one or when it does not keep that. */
  attribution: SelectionAttribution | null
}

/** A right click on the canvas, reported after maxGraph has updated the selection for it. */
export interface ContextMenuRequest {
  /** Point of the click relative to the visible top-left corner of the canvas. */
  x: number
  y: number
  /** The same point in diagram coordinates. */
  point: Point
  target: MenuTarget
  /** The id of the single selected element, `null` for the canvas or several elements. */
  cellId: string | null
}

/** A label being edited in place on the canvas. */
export interface LabelEditing {
  /** The cell whose label is edited: a shape, an edge, a table, a field or an index. */
  cellId: string
  /** Another participant changed the label since the editing started; applying the editing still writes its text. */
  changedRemotely: boolean
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
   * Sets the type or keys of the selected field, keeping its name and the rest of its text, as one undo step; a primary
   * key is NOT NULL.
   */
  setFieldProps(props: Partial<SelectedField>): void
  /** Adds an index under the selected index (or at the end of the indexes of the selected table) and starts editing it. */
  addTableIndex(): Cell | null
  /** Sets the columns or the uniqueness of the selected index, keeping its name and the rest of its text, as one undo step. */
  setIndexProps(props: Partial<Pick<SelectedIndex, 'columns' | 'unique'>>): void
  /** Sets the database of the selected table, or of the table of the selected field, as one undo step. */
  setTableVendor(vendor: DbVendorId): void
  /**
   * Adds a shape of the group of the selected shape on its `side` and connects the selected shape to it, as one undo
   * step, and selects the new shape.
   */
  addConnectedShape(side: Side, shape: ShapeId): Cell | null
  /**
   * Puts the selected shapes, tables of selected fields and the edges between them into the clipboard of the tab and
   * into the clipboard of the system: tables alone as SQL with the cells in its HTML, anything else in the format of
   * draw.io; into `data` of a clipboard event, or through the Clipboard API.
   */
  copy(data?: DataTransfer | null): void
  /** Copies like {@link copy} and removes what was copied, as one undo step. */
  cut(data?: DataTransfer | null): void
  /**
   * Adds `text` and `html` of the clipboard of the system, or without them the clipboard of the tab, as one undo step:
   * cells of CoDraw (also from the HTML of copied tables) or draw.io shifted further with every paste of the same
   * content, or with their top-left corner at `at`; a flowchart or an ER diagram of Mermaid and tables of DDL laid out,
   * and other text as a text shape, in the middle of the visible area, or with the top-left corner at `at`.
   */
  paste(at?: Point, text?: string, html?: string): void
  /** Adds a shifted copy of what {@link copy} would copy, without changing the clipboard. */
  duplicate(): void
  /** Adds the cells of a diagram, e.g. of a template, as one undo step, selects them and shows the whole page. */
  insertCells(cells: CellData[]): void
  /**
   * Brings back cells of the page as a version has them, `cells` being that page of the version, as one undo step: the
   * cells `ids` with their descendants and edges (see {@link cellsToRestore}), deleted ones with their ids, existing ones
   * with the content, the parent and the place among their siblings of the version, marked as changed by the
   * participant. Locked cells of the page stay as they are, and nothing goes into a locked group or table. Selects those
   * of `ids` on the page, the locked ones too, and centres the canvas on them.
   */
  restoreCells(cells: Map<string, CellSnapshot>, ids: string[]): void
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
  /**
   * Lays out the selection, or the whole page without two selected shapes, in layers along the edges in `direction`,
   * as one undo step: tables and groups as a whole, frames around the shapes inside them, edges between the laid out
   * shapes without their bends. Resolves once the shapes have moved; the layout library loads on first use.
   */
  autoLayout(direction: LayoutDirection): Promise<void>
  /** Puts the selected shapes of one parent and the edges between them into a new group and selects it. */
  group(): Cell | null
  /** Moves the shapes of the selected groups back to the page in their places and selects them. */
  ungroup(): void
  /**
   * Locks the selected elements against changes, a field or an index with its table, in the name of the participant; or
   * unlocks them together with the groups and tables whose locks hold them. One undo step.
   */
  setLocked(locked: boolean): void
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
  /** Sets the font of the objects {@link setFontSize} would change, as one undo step; Arial is the default. */
  setFontFamily(family: string): void
  /** Aligns the text of the objects {@link setFontSize} would change, as one undo step. */
  setTextAlign(align: TextAlign): void
  /** Sets the width or the dash of the lines of the selected objects, or the shape of the selected edges, as one undo step. */
  setLineStyle(changes: { width?: number; dash?: LineDash; edgeShape?: EdgeShape }): void
  /** Turns on or off the width that follows the label for the selected shapes that allow it; on, it fits them at once. */
  setAutoWidth(enabled: boolean): void
  /**
   * Turns on or off the wrap of the words of the labels of the selected shapes that allow it, as one undo step; on, it
   * turns their auto width off, as auto width turns the wrap off.
   */
  setTextWrap(enabled: boolean): void
  /**
   * Makes the selected table a base table, whose fields the tables that choose it inherit, or an ordinary one, whose
   * tables keep what they inherited as fields of their own.
   */
  setBaseTable(enabled: boolean): void
  /** Makes the selected base table the one that new tables of the page get, or none; one at most is. */
  setDefaultBase(enabled: boolean): void
  /** Chooses the base of the selected table among {@link TableBase.options}; none removes the inherited fields. */
  setTableBase(baseId: string | null): void
  /** Sets the position or size of the selected shapes as one undo step; tables keep the height of their fields. */
  setGeometry(changes: Partial<Box>): void
  /** Converts a client (viewport) position to diagram coordinates. */
  toDiagramPoint(clientX: number, clientY: number): Point
  /** Converts diagram coordinates to a position relative to the visible top-left corner of the canvas. */
  toCanvasPoint(point: Point): Point
  /** Bounds of a cell relative to the visible top-left corner of the canvas, or `null` if it is not shown. */
  cellBounds(id: string): Box | null
  /** Points of the line of an edge as drawn, relative to the visible top-left corner of the canvas; `null` if not shown. */
  edgePoints(id: string): Point[] | null
  /** Size of the visible area of the canvas, without scrollbars. */
  viewportSize(): { width: number; height: number }
  /** Scrolls (or, beyond the scrollable area, pans) the canvas so that a diagram point is in its middle. */
  centerOn(point: Point): void
  /** The middle of the visible area in diagram coordinates. */
  viewportCenter(): Point
  /** Zooms to `scale` (1 is 100%), between 10% and 800%, keeping the middle of the visible area. */
  zoomTo(scale: number): void
  /** Selects the cell and centres the canvas on it; `false` when the page has no such shape or edge. */
  revealCell(id: string): boolean
  /** Selects nothing. */
  clearSelection(): void
  /** Reports the pointer position over the canvas in diagram coordinates, and `null` when it leaves. */
  onPointerMove(listener: (point: Point | null) => void): () => void
  /**
   * Turns the laser pointer on or off. While it is on, dragging with the main button selects, moves, connects and edits
   * nothing and is reported by {@link onLaser}; the right button and the wheel work as before. Turning it on turns the
   * comment tool off. A participant who may only view has it too: it changes nothing.
   */
  setLaser(on: boolean): void
  /** Reports the points of a drag with the laser pointer in diagram coordinates, and `null` when it is released. */
  onLaser(listener: (point: Point | null) => void): () => void
  /**
   * Turns the comment tool on or off. While it is on, a click with the main button selects, moves, connects and edits
   * nothing and is reported by {@link onCommentPoint}; the right button and the wheel work as before. The laser pointer
   * and the comment tool take the main button in turns: turning one on turns the other off. A participant who may only
   * view has it too: comments do not change the page.
   */
  setCommentTool(on: boolean): void
  /** Reports the point of each click with the comment tool, where the button was released, in diagram coordinates. */
  onCommentPoint(listener: (point: Point) => void): () => void
  /** Reports the ids of the selected cells whenever the selection changes. */
  onSelectionChange(listener: (ids: string[]) => void): () => void
  /** Reports that the picture on the screen moved: scrolling, zooming or changed cells. */
  onViewChange(listener: () => void): () => void
  /** Increases with every view change; lets React re-render positions computed from the view. */
  getViewVersion(): number
  /** The label being edited in place, or `null`. */
  getEditing(): LabelEditing | null
  /**
   * Reports the label being edited in place when the editing starts and when another participant changes that label,
   * and `null` when it stops: applied, cancelled, losing focus, with its cell removed or with the editor destroyed.
   */
  onEditingChange(listener: (editing: LabelEditing | null) => void): () => void
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

/** Narrowest editor of the name of a field, so that it is seen even in a table of short names. */
const MIN_NAME_EDITOR_WIDTH = 120
/** Text of the fields a table inherits from a base table, which are edited there. */
const INHERITED_FIELD_COLOR = '#6e7781'
/** Border of a base table, a template of fields rather than a table of the database. */
const BASE_TABLE_DASH = '6 4'

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

/** The smallest and the largest scale that following another participant takes. */
const MIN_SCALE = 0.1
const MAX_SCALE = 8

/** Margin around the page when it is fitted into the canvas, in pixels. */
const FIT_MARGIN = 20

/** Bits of the `fontStyle` style key. */
const FONT_STYLE_BITS: Record<FontStyleFlag, number> = { bold: 1, italic: 2, underline: 4 }

/** Property of the canvas element that exposes the editor to end-to-end tests. */
export const EDITOR_PROPERTY = '__codrawEditor'

/**
 * A key the canvas responds to, in the notation of shortcuts: `Mod` is Ctrl, or Cmd on macOS; then `Shift`; then a
 * letter, `Delete`, `Backspace`, `F2` or an arrow. `collaboration` keys turn on a tool of working on a board with others,
 * which a canvas without them does not bind (see {@link DiagramEditorOptions.collaboration}).
 */
export type KeyBinding = {
  keys: string
  editing: boolean
  collaboration?: boolean
  run: (editor: DiagramEditor) => void
}

/** Codes of the keys of {@link KEY_BINDINGS} that are not letters, as maxGraph reads them. */
const KEY_CODES: Record<string, number> = {
  Backspace: 8,
  Delete: 46,
  F2: 113,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
}

/** Moves the selection by a pixel, or by a step of the grid, as in draw.io; not snapped to the grid. */
const nudge = (dx: number, dy: number, grid: boolean) => (editor: DiagramEditor) => {
  const step = grid ? editor.graph.getGridSize() : 1
  editor.moveSelection(dx * step, dy * step)
}

/**
 * Keys of the canvas and what they do; `editing` ones change the page and are not bound for a participant who may only
 * view. Ctrl+C, Ctrl+X and Ctrl+V are clipboard events, not keys: binding them would cancel the keys, and the events
 * with them.
 */
export const KEY_BINDINGS: readonly KeyBinding[] = [
  { keys: 'Mod+A', editing: false, run: (editor) => editor.selectAll() },
  // The scale is the participant's own, so a participant who may only view fits the page too.
  { keys: 'Mod+Shift+H', editing: false, run: (editor) => editor.zoomToFit() },
  // The laser pointer changes nothing either, and participants who may only view comment too.
  { keys: 'K', editing: false, collaboration: true, run: (editor) => editor.setLaser(!editor.getState().laser) },
  {
    keys: 'C',
    editing: false,
    collaboration: true,
    run: (editor) => editor.setCommentTool(!editor.getState().commentTool),
  },
  { keys: 'Delete', editing: true, run: (editor) => editor.deleteSelection() },
  { keys: 'Backspace', editing: true, run: (editor) => editor.deleteSelection() },
  { keys: 'Mod+Z', editing: true, run: (editor) => editor.undo() },
  { keys: 'Mod+Shift+Z', editing: true, run: (editor) => editor.redo() },
  { keys: 'Mod+Y', editing: true, run: (editor) => editor.redo() },
  { keys: 'Mod+D', editing: true, run: (editor) => editor.duplicate() },
  { keys: 'F2', editing: true, run: (editor) => editor.editLabel() },
  { keys: 'Mod+B', editing: true, run: (editor) => editor.toggleFontStyle('bold') },
  { keys: 'Mod+I', editing: true, run: (editor) => editor.toggleFontStyle('italic') },
  { keys: 'Mod+U', editing: true, run: (editor) => editor.toggleFontStyle('underline') },
  { keys: 'Mod+G', editing: true, run: (editor) => editor.group() },
  { keys: 'Mod+Shift+G', editing: true, run: (editor) => editor.ungroup() },
  { keys: 'Mod+Shift+L', editing: true, run: (editor) => void editor.autoLayout('right') },
  { keys: 'ArrowLeft', editing: true, run: nudge(-1, 0, false) },
  { keys: 'ArrowUp', editing: true, run: nudge(0, -1, false) },
  { keys: 'ArrowRight', editing: true, run: nudge(1, 0, false) },
  { keys: 'ArrowDown', editing: true, run: nudge(0, 1, false) },
  { keys: 'Shift+ArrowLeft', editing: true, run: nudge(-1, 0, true) },
  { keys: 'Shift+ArrowUp', editing: true, run: nudge(0, -1, true) },
  { keys: 'Shift+ArrowRight', editing: true, run: nudge(1, 0, true) },
  { keys: 'Shift+ArrowDown', editing: true, run: nudge(0, 1, true) },
]

/** Binds a key of {@link KEY_BINDINGS} in the key handler of maxGraph to the editor that `editor` returns. */
function bindKey(keyHandler: KeyHandler, { keys, run }: KeyBinding, editor: () => DiagramEditor) {
  const parts = keys.split('+')
  const key = parts.at(-1)!
  const code = KEY_CODES[key] ?? key.charCodeAt(0)
  const action = () => run(editor())
  const mod = parts.includes('Mod')
  const shift = parts.includes('Shift')
  if (mod && shift) keyHandler.bindControlShiftKey(code, action)
  else if (mod) keyHandler.bindControlKey(code, action)
  else if (shift) keyHandler.bindShiftKey(code, action)
  else keyHandler.bindKey(code, action)
}

/** A tool of the canvas that takes the main button from maxGraph: the laser pointer or the comment tool. */
type CanvasTool = 'laser' | 'comment'

/** Classes of the canvas while a tool is on: its pointer is a crosshair over everything. */
const TOOL_CLASSES: Record<CanvasTool, string> = { laser: 'laser-pointer', comment: 'comment-tool' }

/** Events of the canvas that a tool keeps from maxGraph, besides the press that the tool takes. */
const TOOL_STOPPED_EVENTS = ['pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'dblclick'] as const

/** Bit of the right button in `MouseEvent.buttons`. */
const RIGHT_BUTTON_BIT = 2

/** Color of the guides that show where a dragged shape lines up with others: the color of the selection. */
const GUIDE_COLOR = '#2563eb'

/** How long the pointer rests over an element before its tooltip tells who changed it last, in milliseconds. */
const TOOLTIP_DELAY = 1000

/** Keys of a cell that tell who changed it last. */
const ATTRIBUTION_KEYS = [MODIFIED_BY_KEY, MODIFIED_BY_NAME_KEY, MODIFIED_AT_KEY]

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
  /** The name of the participant, which the elements they lock keep as who locked them. */
  participantName?: string
  /**
   * The id of the participant (their user). With {@link participantName}, the elements they change keep both as who
   * changed them last, and the editor tells their own changes from others'.
   */
  participantId?: string
  /**
   * The page works on a board with others, who see the laser pointer and read comments: `K` and `C` turn on the laser
   * pointer and the comment tool. `true` by default; a draft of a proposal of changes has neither.
   */
  collaboration?: boolean
}

/** Commands of the editor that change the page; a read-only editor ignores them. */
const CHANGING_COMMANDS = [
  'addShape',
  'addTableField',
  'setFieldProps',
  'addTableIndex',
  'setIndexProps',
  'setTableVendor',
  'addConnectedShape',
  'cut',
  'paste',
  'duplicate',
  'insertCells',
  'restoreCells',
  'moveSelection',
  'bringToFront',
  'sendToBack',
  'reverseEdge',
  'alignShapes',
  'distributeShapes',
  'group',
  'ungroup',
  'setLocked',
  'editLabel',
  'deleteSelection',
  'setEdgeMarker',
  'setColor',
  'setFontSize',
  'setFontFamily',
  'stepFontSize',
  'toggleFontStyle',
  'setTextAlign',
  'setLineStyle',
  'setAutoWidth',
  'setTextWrap',
  'setBaseTable',
  'setDefaultBase',
  'setTableBase',
  'setGeometry',
  'undo',
  'redo',
] as const satisfies readonly (keyof DiagramEditor)[]

export function createDiagramEditor(
  container: HTMLElement,
  document: Y.Doc,
  {
    pageId = DEFAULT_PAGE_ID,
    undoManager: sharedUndoManager,
    readOnly = false,
    participantName,
    participantId,
    collaboration = true,
  }: DiagramEditorOptions = {},
): DiagramEditor {
  const model = new GraphDataModel()
  const cells = getCells(document, pageId)
  const undoManager = sharedUndoManager ?? createUndoManager(cells)

  const graph = new Graph(container, model, [...getDefaultPlugins(), RubberBandHandler])
  // After the graph: the first graph registers the default shapes of maxGraph, including its own `rectangle`.
  registerDiagramExtensions()
  registerTableShapes()
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
  configureTableFields(graph)
  configureTextWrap(graph)
  const unwatchTableRows = watchTableRows(graph)
  configureConnections(graph)
  const unwatchLocks = configureLocks(graph)
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
  const author = participantId && participantName ? { id: participantId, name: participantName } : null
  const binding = new DiagramBinding(model, cells, LOCAL_ORIGIN, readOnly, author)
  const stopEdgeRouting = startEdgeRouting(graph)
  const cellEditor = graph.getPlugin<CellEditorHandler>('CellEditorHandler')
  // Commit a label when its editor loses focus, e.g. when the user clicks the palette or the toolbar.
  if (cellEditor) cellEditor.blurEnabled = true
  // The name of a table, a field and an index are a line each: Enter applies them, as Escape cancels them.
  if (cellEditor) {
    const isStopEditingEvent = cellEditor.isStopEditingEvent.bind(cellEditor)
    cellEditor.isStopEditingEvent = (event) => {
      const cell = cellEditor.getEditingCell()
      const line = isTable(cell) || isColumnField(cell) || isIndexRow(cell)
      const enter = event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.isComposing
      return isStopEditingEvent(event) || (line && enter)
    }
  }
  // The editor of the name of a field is at least as wide as the column of names and, while empty, shows the
  // placeholder, which the row hides meanwhile. Editing stops through the handler also when it loses focus, without
  // the event of the graph.
  let namedField: Cell | null = null
  const redrawField = (field: Cell) => graph.getView().getState(field)?.shape?.redraw()
  const handleEditingStarted = (_sender: unknown, event: EventObject) => {
    const cell = event.getProperty('cell') as Cell
    const textarea = cellEditor?.textarea
    if (!(isColumnField(cell) || isIndexRow(cell)) || !textarea) return
    namedField = cell
    const row = tableRowsOf(graph, cell.getParent()!).get(cell)
    textarea.dataset.placeholder = isIndexRow(cell) ? INDEX_PLACEHOLDER : FIELD_PLACEHOLDER
    textarea.style.minWidth = `${Math.max(MIN_NAME_EDITOR_WIDTH, (row?.nameEnd ?? 0) - (row?.nameX ?? 0))}px`
    redrawField(cell)
  }
  graph.addListener(InternalEvent.EDITING_STARTED, handleEditingStarted)
  // The label being edited, which other participants see. Every editing starts and stops in the handler: applied,
  // cancelled, losing focus, or with its cell removed; the events of the graph miss the last two.
  let editing: LabelEditing | null = null
  const editingListeners = new Set<(editing: LabelEditing | null) => void>()
  const setEditing = (next: LabelEditing | null) => {
    if (next === editing) return
    editing = next
    editingListeners.forEach((listener) => listener(next))
  }
  if (cellEditor) {
    const startEditing = cellEditor.startEditing.bind(cellEditor)
    cellEditor.startEditing = (cell: Cell, trigger?: MouseEvent | null) => {
      startEditing(cell, trigger)
      const id = cellEditor.getEditingCell()?.getId()
      if (id) setEditing({ cellId: id, changedRemotely: false })
    }
    const stopEditing = cellEditor.stopEditing.bind(cellEditor)
    cellEditor.stopEditing = (cancel?: boolean) => {
      const field = namedField
      const textarea = cellEditor.textarea
      namedField = null
      if (field && textarea) {
        delete textarea.dataset.placeholder
        textarea.style.minWidth = ''
      }
      stopEditing(cancel)
      if (field) redrawField(field)
      setEditing(null)
    }
  }
  // Another participant replaced the label being edited: the participant is told once, and applying their editing
  // still writes their text. Their own changes, e.g. applying the editing, are not the binding applying the document.
  const handleRemoteLabel = (_sender: unknown, event: EventObject) => {
    const cell = cellEditor?.getEditingCell()
    if (!editing || editing.changedRemotely || !cell || !binding.isApplyingRemote()) return
    const changes = event.getProperty('changes') as unknown[]
    if (changes.some((change) => change instanceof ValueChange && change.cell === cell)) {
      setEditing({ ...editing, changedRemotely: true })
    }
  }
  model.addListener(InternalEvent.CHANGE, handleRemoteLabel)

  const selectedEdges = () => graph.getSelectionCells().filter((cell) => cell.isEdge())
  /** The cell can change: neither it nor a group or a table above it is locked. */
  const isUnlocked = (cell: Cell) => lockHolder(cell) === null
  /** The cells that the commands change: those that can. */
  const unlocked = (cells: Cell[]) => cells.filter(isUnlocked)
  /** What locking a cell locks: a field or an index with its table, any other cell itself. */
  const lockTarget = (cell: Cell) => (isTable(cell.getParent()) ? cell.getParent()! : cell)
  const selectedTable = (): Cell | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    if (!cell || isTable(cell)) return cell
    const parent = cell.getParent()
    return isTable(parent) ? parent : null
  }
  const selectedField = (): Cell | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    return isColumnField(cell) ? cell : null
  }
  const selectedFieldProps = (): SelectedField | null => {
    const field = selectedField()
    const parts = field && splitField(String(field.getValue() ?? ''))
    if (!field || !parts) return null
    const { type, notNull, primaryKey, unique } = parts
    const inherited = inheritedFieldId(field)
    const inheritedFrom = inherited === null ? null : plainText(String(model.getCell(inherited)?.getParent()?.getValue() ?? ''))
    return { cellId: field.getId()!, tableId: field.getParent()!.getId()!, type, notNull, primaryKey, unique, inheritedFrom }
  }
  const selectedIndexRow = (): Cell | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    return isIndexRow(cell) ? cell : null
  }
  const selectedIndexProps = (): SelectedIndex | null => {
    const row = selectedIndexRow()
    const parts = row && indexPartsOf(String(row.getValue() ?? ''))
    if (!row || !parts) return null
    return { cellId: row.getId()!, tableId: row.getParent()!.getId()!, columns: parts.columns, unique: parts.unique }
  }
  const selectedTableBase = (): TableBase | null => {
    const table = selectedTable()
    if (!table) return null
    const tables = pageTables(graph)
    return {
      base: isBaseTable(table),
      defaultBase: isDefaultBase(table),
      baseId: baseTableId(table),
      options: baseOptions(table, tables).map((base) => ({ id: base.getId()!, name: plainText(String(base.getValue() ?? '')) })),
    }
  }
  /**
   * The single selected shape with a group; a table field is part of its table, not a shape of its own, and a locked
   * shape gets no new edges.
   */
  const quickConnectSource = (): { cell: Cell; group: ShapeGroup } | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    if (!cell?.isVertex() || isTable(cell.getParent()) || lockHolder(cell)) return null
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
  const allowsAutoWidthCell = (cell: Cell) => isFreeShape(cell) && allowsAutoWidth(graph.getCellStyle(cell) as ShapeStyle)
  const autoWidthCells = () => graph.getSelectionCells().filter(allowsAutoWidthCell)
  const textWrapCells = () => graph.getSelectionCells().filter((cell) => allowsTextWrap(graph, cell))
  const geometryCells = () => graph.getSelectionCells().filter(isFreeShape)
  /** The cell of the page that a cell belongs to: a field to its table, a shape of a group to the group. */
  const pageCell = (cell: Cell): Cell | null => {
    let current: Cell | null = cell
    while (current && current.getParent() !== graph.getDefaultParent()) current = current.getParent()
    return current
  }
  /** Shapes, tables and groups of the page that the selection has. */
  const selectedLayoutCells = (): Cell[] => [
    ...new Set(graph.getSelectionCells().flatMap((cell) => (cell.isVertex() ? (pageCell(cell) ?? []) : []))),
  ]
  /** All edges of the page, those inside groups too. */
  const pageEdges = (parent: Cell = graph.getDefaultParent()): Cell[] =>
    parent.getChildren().flatMap((child) => (child.isEdge() ? [child] : pageEdges(child)))
  let layingOut = false
  /** Selected cells that can become a group: those of the parent of the first one, fields of tables aside. */
  const groupableCells = (): Cell[] => {
    const cells = graph.getSelectionCells().filter((cell) => !isTable(cell.getParent()))
    const parent = cells[0]?.getParent()
    if (!parent) return []
    return cells.filter((cell) => cell.getParent() === parent).sort((a, b) => parent.getIndex(a) - parent.getIndex(b))
  }
  /** A group would become the parent of a locked cell, so none is made with one. */
  const canGroup = () => {
    const cells = groupableCells()
    return cells.filter((cell) => cell.isVertex()).length >= 2 && cells.every(isUnlocked)
  }
  /** Selected groups that can be ungrouped: neither they nor the shapes they hold are locked. */
  const ungroupableCells = () =>
    graph.getSelectionCells().filter((cell) => isGroup(cell) && isUnlocked(cell) && !hasLockedDescendant(cell))
  /** The lock of the selection; see {@link SelectionLock}. */
  const selectionLock = (): SelectionLock | null => {
    const cells = graph.getSelectionCells()
    if (cells.length === 0) return null
    const holders = new Set(cells.flatMap((cell) => lockHolder(cell) ?? []))
    return {
      all: cells.every((cell) => !isUnlocked(cell)),
      canLock: !readOnly && cells.some((cell) => isUnlocked(lockTarget(cell))),
      locks: [...holders].map((holder) => ({ cellId: holder.getId()!, lockedBy: lockedByOf(holder) })),
    }
  }
  /** The cell of the document of the single selected element, if there is one. */
  const selectedCellMap = () => {
    const id = graph.getSelectionCount() === 1 ? graph.getSelectionCell().getId() : null
    return id ? cells.get(id) : undefined
  }
  /** The participant of the editor changed it, as far as the ids tell. */
  const isMine = (attribution: Attribution) => participantId !== undefined && attribution.by === participantId
  /** Who changed the single selected element last; see {@link SelectionAttribution}. */
  const selectionAttribution = (): SelectionAttribution | null => {
    const attribution = readAttribution(selectedCellMap())
    return attribution && { ...attribution, mine: isMine(attribution) }
  }
  const fontStyleOf = (cell: Cell) => Number(graph.getCellStyle(cell).fontStyle ?? 0)
  const hasFontStyle = (cells: Cell[], flag: FontStyleFlag) =>
    cells.every((cell) => (fontStyleOf(cell) & FONT_STYLE_BITS[flag]) !== 0)
  const selectionText = (): SelectionText | null => {
    const cells = textCells()
    if (cells.length === 0) return null
    const shapes = autoWidthCells()
    const wrapping = textWrapCells()
    return {
      fontSize: same(cells.map(fontSizeOf)),
      fontFamily: same(cells.map((cell) => fontFamilyOf(graph.getCellStyle(cell)))),
      bold: hasFontStyle(cells, 'bold'),
      italic: hasFontStyle(cells, 'italic'),
      underline: hasFontStyle(cells, 'underline'),
      align: same(cells.map((cell) => alignOf(graph.getCellStyle(cell)))),
      autoWidth: shapes.length > 0 ? shapes.every((cell) => hasAutoWidth(cell.getStyle())) : null,
      textWrap: wrapping.length > 0 ? wrapping.every((cell) => hasTextWrap(cell.getStyle())) : null,
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
  /**
   * Width that fits the longest line of the label of a shape, or of a table: its name beside the badge of its database
   * and the rows of its fields; `null` without text.
   */
  const fittedWidthOf = (shape: Cell): number | null => {
    const gridSize = graph.isGridEnabled() ? graph.getGridSize() : 0
    const rows = isTable(shape) ? tableRowsOf(graph, shape) : null
    const widths = (isTable(shape) ? [shape, ...shape.getChildren()] : [shape]).flatMap((part) => {
      const row = rows?.get(part)
      if (row) return row.width > 0 ? [gridSize > 0 ? Math.ceil(row.width / gridSize) * gridSize : Math.ceil(row.width)] : []
      const label = graph.getLabel(part)
      if (!label) return []
      const style = { fontSize: fontSizeOf(part), ...graph.getCellStyle(part) }
      const vendor = isTable(part) && style.shape === 'swimlane' ? vendorOf(part.getStyle()) : null
      const badge = Math.max(vendor ? badgeRoom(vendor.badge) : 0, isBaseTable(part) ? badgeRoom(BASE_BADGE) : 0)
      return [fittedWidth(measureLabel(label, style) + 2 * badge, style, gridSize)]
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

  // The label of a shape with auto width changes inside this event, so the new width is a part of the same change; a
  // field or a table also changes the references that the fields of other tables show.
  const handleLabelChanged = (_sender: unknown, event: EventObject) => {
    const cell = event.getProperty('cell') as Cell
    if (isColumnField(cell)) renameInIndexes(cell, String(event.getProperty('old') ?? ''))
    fitAutoWidth([cell, ...tablesShowing(cell)])
  }
  /** Writes the new name of a renamed field into the columns of the indexes of its table, in the same change. */
  const renameInIndexes = (field: Cell, old: string) => {
    const from = splitField(old)?.name
    const to = splitField(String(field.getValue() ?? ''))
    if (!from || !to || from === to.name) return
    for (const row of field.getParent()!.getChildren().filter(isIndexRow)) {
      const parts = splitIndex(String(row.getValue() ?? ''))
      if (!parts) continue
      const columns = renameIndexColumn(parts.columns, from, to.nameText)
      if (columns !== parts.columns) model.setValue(row, indexText({ ...parts, columns }))
    }
  }
  graph.addListener(InternalEvent.LABEL_CHANGED, handleLabelChanged)
  // A new edge between fields shows its reference in the field that refers, in the change that adds it.
  const handleCellsAdded = (_sender: unknown, event: EventObject) =>
    fitAutoWidth((event.getProperty('cells') as Cell[]).filter((cell) => cell.isEdge()).flatMap(tablesShowing))
  graph.addListener(InternalEvent.CELLS_ADDED, handleCellsAdded)
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
  // The fields that tables inherit follow their base tables in the change that changes them, when it is done but not
  // yet laid out and written: one undo step for everybody. Changes that the binding brings were synced by their author.
  let syncingBases = false
  const syncBases = () => {
    if (readOnly || syncingBases || binding.isApplyingRemote()) return
    syncingBases = true
    try {
      model.batchUpdate(() => fitAutoWidth(syncBaseTables(graph)))
    } finally {
      syncingBases = false
    }
  }
  model.addListener(InternalEvent.END_EDIT, syncBases)

  /** The tool that takes the main button, or `null` for selecting and editing; see the listeners of the tools below. */
  let tool: CanvasTool | null = null
  const readState = (): EditorState => {
    const edges = selectedEdges()
    return {
      canUndo: !readOnly && undoManager.canUndo(),
      canRedo: !readOnly && undoManager.canRedo(),
      scale: graph.getView().scale,
      tableSelected: selectedTable() !== null,
      tableVendor: vendorOf(selectedTable()?.getStyle() ?? {})?.id ?? null,
      field: selectedFieldProps(),
      index: selectedIndexProps(),
      tableBase: selectedTableBase(),
      edgeMarkers: edges.length > 0 ? { start: sameMarker(edges, 'start'), end: sameMarker(edges, 'end') } : null,
      colors: selectionColors(),
      line: selectionLine(),
      text: selectionText(),
      geometry: selectionGeometry(),
      // A press next to a shape with a tool must not add a connected shape.
      quickConnect: readOnly || tool ? null : quickConnect(),
      canPaste: !readOnly && (clipboard.read() !== null || canReadSystemClipboard()),
      arrange: geometryCells().length,
      canGroup: !readOnly && canGroup(),
      canUngroup: !readOnly && ungroupableCells().length > 0,
      hasCells: graph.getDefaultParent().getChildCount() > 0,
      canCopy: graph.getSelectionCells().some((cell) => cell.isVertex()),
      layoutSelection: selectedLayoutCells().length >= 2,
      laser: tool === 'laser',
      commentTool: tool === 'comment',
      lock: selectionLock(),
      attribution: selectionAttribution(),
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
  // The binding writes the changes of this participant before the model reports them. Changes of others can change who
  // changed the selected element without a change of the model, e.g. a restored version that has another name there.
  const handleAttribution = (events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction) => {
    const selected = transaction.origin === LOCAL_ORIGIN ? undefined : selectedCellMap()
    const changed = (event: Y.YEvent<Y.AbstractType<unknown>>) =>
      event.target === selected &&
      event instanceof Y.YMapEvent &&
      ATTRIBUTION_KEYS.some((key) => event.keysChanged.has(key))
    if (selected && events.some(changed)) notify()
  }
  cells.observeDeep(handleAttribution)
  // A second over an element shows who changed it last at the pointer. The whole tooltip of maxGraph is replaced: it
  // would show the label through `innerHTML`, and labels and names are text of other participants, and hints of the
  // handles of edges in English. The single selected element shows who changed it under the canvas already.
  const tooltips = graph.getPlugin<TooltipHandler>('TooltipHandler')
  if (tooltips) {
    tooltips.delay = TOOLTIP_DELAY
    tooltips.getTooltip = ({ cell }) => {
      const id = cell.getId()
      const onlySelected = graph.getSelectionCount() === 1 && graph.isCellSelected(cell)
      const attribution = id && !tool && !onlySelected ? readAttribution(cells.get(id)) : null
      if (!attribution) return null
      const tip = container.ownerDocument.createElement('span')
      tip.textContent = attributionLabel(attribution, Date.now(), isMine(attribution))
      return tip
    }
    graph.setTooltips(true)
  }
  // A field shows the other fields of its table and the fields its edges lead to, which maxGraph does not redraw when
  // they change, and its name ends where its width and its neighbours say; moving a shape changes no field.
  const redrawTables = (_sender: unknown, event: EventObject) => {
    const tables = new Set<Cell>()
    for (const change of (event.getProperty('edit') as { changes: object[] }).changes) {
      const { cell, child, parent, previous, terminal } = change as Record<string, unknown>
      if (change instanceof GeometryChange && !isColumnField(cell as Cell) && !isIndexRow(cell as Cell)) continue
      for (const value of [cell, child, parent, previous, terminal]) {
        if (value instanceof Cell) tablesShowing(value).forEach((table) => tables.add(table))
      }
    }
    const view = graph.getView()
    for (const field of [...tables].flatMap((table) => table.getChildren())) {
      const state = view.getState(field)
      if (!state) continue
      state.style = graph.getCellStyle(field)
      graph.cellRenderer.redraw(state, true, true)
    }
  }
  model.addListener(InternalEvent.CHANGE, redrawTables)

  const removeSelection = () => {
    if (graph.isEditing() || graph.isSelectionEmpty()) return
    const selected = graph.getSelectionCells()
    // An inherited field goes with its table only: it is removed in its base table.
    const cells = selected.filter((cell) => inheritedFieldId(cell) === null || selected.includes(cell.getParent()!))
    if (cells.length === 0) return
    // Tables of removed fields and those whose fields show references to what is removed.
    const tables = cells.flatMap(tablesShowing)
    model.batchUpdate(() => {
      graph.removeCells(cells, true)
      // A table with auto width fits the fields that are left; a removed table has no parent any more.
      fitAutoWidth(tables.filter((table) => table.getParent() !== null))
    })
  }
  const keyHandler = new KeyHandler(graph)
  // maxGraph reads only Ctrl; on macOS the shortcuts are Cmd.
  keyHandler.isControlDown = (event) => event.ctrlKey || (Client.IS_MAC && event.metaKey)
  for (const binding of KEY_BINDINGS) {
    // The editor is made below; the keys reach it once it is.
    if ((!readOnly || !binding.editing) && (collaboration || !binding.collaboration)) {
      bindKey(keyHandler, binding, () => editor)
    }
  }

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
    editor.paste(undefined, event.clipboardData?.getData('text/plain') ?? '', event.clipboardData?.getData('text/html') ?? '')
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

  // The tools. While the laser pointer or the comment tool is on, the main button draws a trail or places a comment, and
  // its presses, releases and double clicks never reach maxGraph, which listens to pointer events, or to mouse events
  // on macOS: nothing is selected, moved, connected or edited. Moves do not reach it either, so that it shows no
  // connection points under the pointer; the listener of the cursor above comes first and still gets them. The right
  // button still pans and opens the menu, and the wheel still scrolls and zooms.
  const laserListeners = new Set<(point: Point | null) => void>()
  let drawingLaser = false
  const drawLaser = (event: PointerEvent) => {
    const point = toDiagramPoint(event.clientX, event.clientY)
    laserListeners.forEach((listener) => listener(point))
  }
  const endLaserStroke = () => {
    if (!drawingLaser) return
    drawingLaser = false
    page.removeEventListener('pointermove', drawLaser, true)
    page.removeEventListener('pointerup', endLaserStroke, true)
    page.removeEventListener('pointercancel', endLaserStroke, true)
    laserListeners.forEach((listener) => listener(null))
  }
  const startLaserStroke = (event: PointerEvent) => {
    endLaserStroke()
    drawingLaser = true
    // The stroke goes on beyond the canvas until the button is released anywhere.
    page.addEventListener('pointermove', drawLaser, true)
    page.addEventListener('pointerup', endLaserStroke, true)
    page.addEventListener('pointercancel', endLaserStroke, true)
    drawLaser(event)
  }
  const commentListeners = new Set<(point: Point) => void>()
  /** The main button was pressed on the canvas with the comment tool: its release places a comment. */
  let pressedForComment = false
  const pressWithTool = (event: PointerEvent) => {
    if (!tool || event.button !== 0) return
    // Cancelling the press also keeps the browser from firing the mouse events of the press and from selecting text.
    event.stopImmediatePropagation()
    event.preventDefault()
    if (tool === 'laser') startLaserStroke(event)
    else pressedForComment = true
  }
  // The release, not the press: the canvas takes the keyboard on the press, and the field of the new comment that the
  // page shows then keeps it, as no event of the click comes after the release to take it back.
  const placeComment = (event: PointerEvent) => {
    if (tool !== 'comment' || event.button !== 0 || !pressedForComment) return
    pressedForComment = false
    const point = toDiagramPoint(event.clientX, event.clientY)
    commentListeners.forEach((listener) => listener(point))
  }
  const stopForTool = (event: MouseEvent) => {
    if (!tool) return
    const move = event.type === 'pointermove' || event.type === 'mousemove'
    // Panning needs the moves with the right button, and the menu its press and release.
    if (move ? (event.buttons & RIGHT_BUTTON_BIT) !== 0 : event.button !== 0) return
    event.stopImmediatePropagation()
  }
  container.addEventListener('pointerdown', pressWithTool, true)
  // Before the listeners that keep the release from maxGraph, which stop it for the others.
  container.addEventListener('pointerup', placeComment, true)
  for (const type of TOOL_STOPPED_EVENTS) container.addEventListener(type, stopForTool, true)
  /** Turns a tool on, which turns the other one off, or turns the tools off with `null`. */
  const setTool = (next: CanvasTool | null) => {
    if (next === tool) return
    if (tool === 'laser') endLaserStroke()
    pressedForComment = false
    tool = next
    for (const [name, className] of Object.entries(TOOL_CLASSES)) container.classList.toggle(className, name === next)
    // A tool takes the pointer: who changed an element is not told over the canvas meanwhile.
    if (next) tooltips?.hide()
    notify()
  }
  // After a button of the toolbar the keyboard is with that button, where the key handler of maxGraph does not look.
  const handleToolKey = (event: KeyboardEvent) => {
    if (tool && event.key === 'Escape') setTool(null)
  }
  page.addEventListener('keydown', handleToolKey)

  const menuListeners = new Set<(request: ContextMenuRequest) => void>()
  const menuTarget = (): MenuTarget => {
    const cells = graph.getSelectionCells()
    if (cells.length === 0) return 'canvas'
    if (cells.length > 1) return 'selection'
    const cell = cells[0]!
    if (cell.isEdge()) return 'edge'
    if (isIndexRow(cell)) return 'index'
    if (isTable(cell.getParent())) return 'field'
    if (isGroup(cell)) return 'group'
    return isTable(cell) ? 'table' : 'shape'
  }
  // maxGraph decides when a right click is a menu click (not panning), and selects the cell under the pointer
  // first. It shows no menu of its own: the factory adds no items to it.
  const popupMenu = graph.getPlugin<PopupMenuHandler>('PopupMenuHandler')
  if (popupMenu) {
    popupMenu.factoryMethod = (_menu, _cell, event) => {
      // The tooltip, which the release of the button would show over the menu.
      tooltips?.hide()
      if (graph.isEditing()) return
      const rect = container.getBoundingClientRect()
      const request: ContextMenuRequest = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        point: toDiagramPoint(event.clientX, event.clientY),
        target: menuTarget(),
        cellId: graph.getSelectionCount() === 1 ? (graph.getSelectionCell().getId() ?? null) : null,
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
  const insertShape = (preset: ShapePreset, parent: Cell, x: number, y: number): Cell => {
    // A new table with the default base of the page has the fields of the base instead of those of the preset.
    const base = isTableStyle(preset.style) ? defaultBase(pageTables(graph)) : null
    const shape = base ? { ...preset, style: { ...preset.style, [BASE_TABLE_KEY]: base.getId()! }, children: [] } : preset
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
  /**
   * Adds an empty row with the keys of `style` to the table after the row `after`, or first without one, selects it and
   * starts editing it. The new row has the text size, the font and the height of the row it follows.
   */
  const addTableRow = (table: Cell, after: Cell | null, style: Record<string, StyleValue>) => {
    const { fontSize, fontFamily } = (after?.getStyle() ?? {}) as ShapeStyle
    const height = after?.getGeometry()?.height ?? TABLE_FIELD_HEIGHT
    // The table layout stacks the rows and fixes the position.
    const row = new Cell('', new Geometry(0, TABLE_HEADER_HEIGHT, table.getGeometry()!.width, height), {
      ...TABLE_FIELD_STYLE,
      ...style,
      ...(fontSize !== undefined && { fontSize }),
      ...(fontFamily !== undefined && { fontFamily }),
    } as CellStyle)
    row.setVertex(true)
    graph.addCell(row, table, after ? table.getIndex(after) + 1 : 0)
    graph.setSelectionCell(row)
    graph.startEditingAtCell(row)
    return row
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
    const { text, html } = clipboardContent(clones)
    clipboard.put(clones, text)
    if (!data) writeSystemClipboard(text, html)
    else {
      data.setData('text/plain', text)
      if (html !== null) data.setData('text/html', html)
    }
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
      if (!table || !isUnlocked(table)) return null
      const selected = graph.getSelectionCell()
      // Fields go before the indexes of the table.
      const fields = table.getChildren().filter((child) => !isIndexRow(child))
      const after = selected !== table && !isIndexRow(selected) ? selected : (fields.at(-1) ?? null)
      return addTableRow(table, after, {})
    },
    addTableIndex() {
      const table = selectedTable()
      if (!table || !isUnlocked(table)) return null
      const selected = graph.getSelectionCell()
      const after = isIndexRow(selected) ? selected : (table.getChildren().at(-1) ?? null)
      return addTableRow(table, after, { [TABLE_INDEX_KEY]: true })
    },
    setIndexProps(props) {
      const row = selectedIndexRow()
      const parts = row && indexPartsOf(String(row.getValue() ?? ''))
      if (!row || !parts || !isUnlocked(row)) return
      const next = { ...parts, ...props }
      if (props.columns !== undefined) next.columns = props.columns.trim()
      const text = indexText(next)
      if (text === row.getValue()) return
      model.batchUpdate(() => {
        model.setValue(row, text)
        fitAutoWidth([row])
      })
    },
    setFieldProps(props) {
      const field = selectedField()
      const parts = field && splitField(String(field.getValue() ?? ''))
      if (!field || !parts || inheritedFieldId(field) !== null || !isUnlocked(field)) return
      const next = { ...parts, ...props }
      // What is typed after the type, e.g. `NOT NULL`, is not a part of it.
      if (props.type !== undefined) next.type = splitField(`field ${props.type}`)?.type ?? ''
      if (next.primaryKey) next.notNull = true
      const text = fieldText(next)
      if (text === field.getValue()) return
      model.batchUpdate(() => {
        model.setValue(field, text)
        fitAutoWidth([field, ...tablesShowing(field)])
      })
    },
    setBaseTable(enabled) {
      const table = selectedTable()
      if (!table || !isUnlocked(table) || isBaseTable(table) === enabled) return
      graph.stopEditing(false)
      model.batchUpdate(() => {
        setStyleValue([table], BASE_KEY, enabled ? true : undefined)
        if (!enabled) setStyleValue([table], DEFAULT_BASE_KEY, undefined)
        fitAutoWidth([table])
      })
    },
    setDefaultBase(enabled) {
      const table = selectedTable()
      if (!table || !isUnlocked(table) || !isBaseTable(table) || isDefaultBase(table) === enabled) return
      model.batchUpdate(() => {
        const others = [...pageTables(graph).values()].filter((other) => other !== table)
        if (enabled) setStyleValue(others, DEFAULT_BASE_KEY, undefined)
        setStyleValue([table], DEFAULT_BASE_KEY, enabled ? true : undefined)
      })
    },
    setTableBase(baseId) {
      const table = selectedTable()
      if (!table || !isUnlocked(table) || baseTableId(table) === baseId) return
      if (baseId !== null && !baseOptions(table, pageTables(graph)).some((base) => base.getId() === baseId)) return
      graph.stopEditing(false)
      model.batchUpdate(() => {
        setStyleValue([table], BASE_TABLE_KEY, baseId ?? undefined)
        // Without a base the sync would keep the inherited fields as fields of the table.
        if (baseId === null) graph.removeCells(table.getChildren().filter((field) => inheritedFieldId(field) !== null), true)
        fitAutoWidth([table])
      })
    },
    setTableVendor(vendor) {
      const table = selectedTable()
      if (!table || !isUnlocked(table) || vendorOf(table.getStyle())?.id === vendor) return
      model.batchUpdate(() => {
        setStyleValue([table], VENDOR_KEY, vendor)
        fitAutoWidth([table])
      })
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
    paste(at, text, html) {
      if (text === undefined || text === clipboard.text()) {
        pasteCells(clipboard.read(), at)
        return
      }
      // Reading a compressed diagram of draw.io takes a moment.
      void readClipboardText(text, html).then((content) => {
        if (destroyed || !content) return
        if (content.kind === 'text') {
          addText(content.text, at)
          return
        }
        // A new diagram goes to the point of the click, or into the middle of the visible area.
        if (content.kind === 'diagram') {
          // As in the clipboard: without a parent, maxGraph would take an edge for the label of an edge and drop it.
          const holder = new Cell()
          content.cells.forEach((cell) => holder.insert(cell))
          const bounds = graph.getBoundingBoxFromGeometry(content.cells, false)
          const center = visibleCenter()
          pasteCells(content.cells, at ?? { x: center.x - (bounds?.width ?? 0) / 2, y: center.y - (bounds?.height ?? 0) / 2 })
          notify()
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
    insertCells(data) {
      const cells = dataToCells(data)
      if (cells.length === 0) return
      // As in the clipboard: without a parent, maxGraph would take an edge for the label of an edge and drop it.
      const holder = new Cell()
      cells.forEach((cell) => holder.insert(cell))
      insertCopies(cells, 0, 0)
      editor.zoomToFit()
    },
    restoreCells(version, ids) {
      // What the page holds locked stays as it is, as with any command.
      const fixed = (id: string) => {
        const cell = model.getCell(id)
        return cell != null && !isUnlocked(cell)
      }
      const restored = cellsToRestore(version, ids, (id) => model.getCell(id) != null, fixed)
      const placed = new Set<Cell>()
      if (restored.length > 0) {
        graph.stopEditing(false)
        // Restored siblings are placed by the order keys of the version, which the document gets only when it is written.
        const orders = new Map(restored.map((data) => [data.id, data.order]))
        const orderOf = (cell: Cell) => {
          const id = cell.getId() ?? ''
          return { id, order: orders.get(id) ?? (cells.get(id)?.get('order') as string | undefined) ?? '' }
        }
        // One transaction with what the binding writes, and so one undo step: the cells, the layout of their tables,
        // the fields of base tables and what the canvas does not hold.
        document.transact(() => {
          model.batchUpdate(() => {
            for (const data of restored) {
              const existing = model.getCell(data.id) ?? null
              const holder = (data.parent !== null && model.getCell(data.parent)) || graph.getDefaultParent()
              // A cell cannot go into one that it holds now, e.g. after groups were nested the other way round.
              const parent = existing?.isAncestor(holder) ? graph.getDefaultParent() : holder
              const siblings = parent.getChildren().filter((child) => child !== existing)
              const after = siblings.findIndex((sibling) => compareCells(data, orderOf(sibling)) < 0)
              const index = after < 0 ? siblings.length : after
              if (!existing) {
                const cell = createCell(data)
                model.add(parent, cell, index)
                placed.add(cell)
                continue
              }
              if (existing.getParent() !== parent || parent.getIndex(existing) !== index) {
                model.add(parent, existing, index)
              }
              if ((existing.getValue() ?? '') !== data.value) model.setValue(existing, data.value)
              const geometry = toGeometry(data.geometry)
              if (geometry) model.setGeometry(existing, geometry)
              model.setStyle(existing, { ...data.style } as CellStyle)
              placed.add(existing)
            }
            // Ends once every restored cell is in place: an edge may end at a cell restored after it.
            for (const data of restored) {
              if (data.kind !== 'edge') continue
              const edge = model.getCell(data.id)!
              model.setTerminal(edge, (data.source !== null && model.getCell(data.source)) || null, true)
              model.setTerminal(edge, (data.target !== null && model.getCell(data.target)) || null, false)
            }
            fitAutoWidth([...placed].filter((cell) => cell.isEdge()).flatMap(tablesShowing))
          })
          // The binding marks the cells it wrote as changed by whoever restores; what it does not write is marked here.
          const at = Date.now()
          for (const data of restored) {
            const entry = cells.get(data.id)
            if (entry && writeRestoredFields(entry, data) && author) writeAttribution(entry, author, at)
          }
        }, LOCAL_ORIGIN)
      }

      // The cells asked for that the page has now: restored, or locked, which shows why they stayed as they are. A copy
      // of a field of a base table without that field is gone again: the base tables were brought in line.
      const shown = ids.flatMap((id) => {
        const cell = model.getCell(id)
        return cell && (placed.has(cell) || fixed(id)) ? [cell] : []
      })
      graph.setSelectionCells(shown)
      const bounds = shown.length > 0 ? graph.getView().getBounds(shown) : null
      if (bounds) {
        const { scale, translate } = graph.getView()
        editor.centerOn({ x: bounds.getCenterX() / scale - translate.x, y: bounds.getCenterY() / scale - translate.y })
      }
      container.focus({ preventScroll: true })
    },
    bringToFront() {
      const cells = unlocked(selectedShapesAndEdges())
      if (cells.length > 0) graph.orderCells(false, cells)
    },
    sendToBack() {
      const cells = unlocked(selectedShapesAndEdges())
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
      const view = graph.getView()
      // The line is that of the area of all the selected shapes: locked ones stay where they are, the others move to it.
      const area = cells.length >= 2 ? view.getBounds(cells) : null
      const movable = graph.getMovableCells(cells)
      if (!area || movable.length === 0) return
      const line = alignedLine(area, align)
      graph.stopEditing(false)
      model.batchUpdate(() => {
        for (const cell of movable) {
          const state = view.getState(cell)
          const delta = state ? (line - alignedLine(state, align)) / view.scale : 0
          if (delta === 0) continue
          const moved = cell.getGeometry()!.clone()
          if (HORIZONTAL_ALIGNS.has(align)) moved.x += delta
          else moved.y += delta
          model.setGeometry(cell, moved)
        }
      })
    },
    async autoLayout(direction) {
      if (readOnly || layingOut) return
      const parent = graph.getDefaultParent()
      const selected = selectedLayoutCells()
      const cells = selected.length >= 2 ? selected : parent.getChildren().filter((cell) => cell.isVertex())
      const candidates: LayoutShape[] = cells.map((cell) => {
        const { x, y, width, height } = cell.getGeometry()!
        const frame = !isGroup(cell) && (cell.getStyle() as ShapeStyle).pointerEvents === false
        return { id: cell.getId()!, x, y, width, height, frame }
      })
      // Locked shapes stay where they are, and so do the shapes in a locked frame, which could not move around them.
      const frames = frameParents(candidates)
      const lockedIds = new Set(cells.filter((cell) => !isUnlocked(cell)).map((cell) => cell.getId()))
      const pinned = (id: string | null): boolean =>
        id !== null && (lockedIds.has(id) || pinned(frames.get(id) ?? null))
      const shapes = candidates.filter((shape) => !pinned(shape.id))
      if (shapes.length === 0) return
      graph.stopEditing(false)
      const ids = new Set(shapes.map((shape) => shape.id))
      // An edge of a field connects its table; the bends of edges between laid out shapes would not fit any more,
      // unless the edge is locked.
      const edges: LayoutEdge[] = []
      const rerouted: Cell[] = []
      for (const edge of pageEdges()) {
        const [source, target] = [edge.getTerminal(true), edge.getTerminal(false)].map((end) => end && pageCell(end))
        if (!source || !target || !ids.has(source.getId()!) || !ids.has(target.getId()!)) continue
        edges.push({ id: edge.getId()!, source: source.getId()!, target: target.getId()! })
        if (isUnlocked(edge)) rerouted.push(edge)
      }
      layingOut = true
      try {
        const boxes = await layoutShapes(shapes, edges, direction)
        if (destroyed) return
        model.batchUpdate(() => {
          for (const [id, box] of boxes) {
            // Another participant may have deleted the shape meanwhile.
            const cell = model.getCell(id)
            if (!cell || cell.getParent() !== parent) continue
            const geometry = cell.getGeometry()!.clone()
            geometry.x = box.x
            geometry.y = box.y
            // Only a frame changes its size, around its shapes.
            if (shapes.find((shape) => shape.id === id)?.frame) {
              geometry.width = box.width
              geometry.height = box.height
            }
            model.setGeometry(cell, geometry)
          }
          for (const edge of rerouted) {
            const geometry = edge.getGeometry()
            if (!model.getCell(edge.getId()!) || !geometry?.points?.length) continue
            const straight = geometry.clone()
            straight.points = []
            model.setGeometry(edge, straight)
          }
        })
      } finally {
        layingOut = false
      }
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
          // A locked shape keeps its place, which the others leave for it.
          if (graph.isCellMovable(cell)) {
            const moved = cell.getGeometry()!.clone()
            if (horizontal) moved.x = position - offset(cell)
            else moved.y = position - offset(cell)
            model.setGeometry(cell, moved)
          }
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
      const groups = ungroupableCells()
      if (groups.length === 0) return
      graph.stopEditing(false)
      graph.setSelectionCells(graph.ungroupCells(groups))
      container.focus({ preventScroll: true })
    },
    setLocked(locked) {
      const cells = graph.getSelectionCells()
      const targets = locked
        ? [...new Set(cells.map(lockTarget))].filter(isUnlocked)
        : [...new Set(cells.flatMap(lockHolders))]
      if (targets.length === 0) return
      graph.stopEditing(false)
      model.batchUpdate(() => {
        setStyleValue(targets, LOCKED_KEY, locked ? true : undefined)
        setStyleValue(targets, LOCKED_BY_KEY, locked && participantName ? participantName : undefined)
      })
    },
    reverseEdge() {
      const edge = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
      if (!edge?.isEdge() || !isUnlocked(edge)) return
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
      // maxGraph starts editing any cell it is given; a double click asks first, and so does this.
      if (cell && graph.isCellEditable(cell)) graph.startEditingAtCell(cell)
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
      const edges = unlocked(selectedEdges())
      if (edges.length === 0) return
      graph.stopEditing(false)
      graph.setCellStyles(end === 'start' ? 'startArrow' : 'endArrow', marker as StyleArrowValue, edges)
    },
    setColor(target, color) {
      const cells = unlocked(graph.getSelectionCells()).filter((cell) => target !== 'fill' || cell.isVertex())
      if (cells.length === 0) return
      graph.stopEditing(false)
      graph.setCellStyles(COLOR_KEYS[target], color, cells)
    },
    setFontSize(size) {
      applyFontSizes(unlocked(textCells()), () => clampFontSize(size))
    },
    stepFontSize(direction) {
      applyFontSizes(unlocked(textCells()), (cell) => nextFontSize(fontSizeOf(cell), direction))
    },
    toggleFontStyle(flag) {
      const cells = unlocked(textCells())
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
    setFontFamily(family) {
      const cells = unlocked(textCells())
      if (cells.length === 0) return
      graph.stopEditing(false)
      model.batchUpdate(() => {
        // The default is kept by removing the key, as draw.io does.
        setStyleValue(cells, 'fontFamily', family === DEFAULT_FONT ? undefined : family)
        fitAutoWidth(cells)
      })
    },
    setTextAlign(align) {
      const cells = unlocked(textCells())
      if (cells.length === 0) return
      graph.stopEditing(false)
      // Centred is the default of shapes and edges; fields of tables store their left alignment.
      setStyleValue(cells, 'align', align === 'center' ? undefined : align)
    },
    setLineStyle({ width, dash, edgeShape }) {
      const cells = unlocked(graph.getSelectionCells())
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
      const cells = unlocked(autoWidthCells())
      if (cells.length === 0) return
      graph.stopEditing(false)
      model.batchUpdate(() => {
        setStyleValue(cells, AUTO_WIDTH_KEY, enabled ? true : undefined)
        if (enabled) setStyleValue(cells, TEXT_WRAP_KEY, undefined)
        fitAutoWidth(cells)
      })
    },
    setTextWrap(enabled) {
      const cells = unlocked(textWrapCells())
      if (cells.length === 0) return
      graph.stopEditing(false)
      model.batchUpdate(() => {
        setStyleValue(cells, TEXT_WRAP_KEY, enabled ? 'wrap' : undefined)
        if (enabled) setStyleValue(cells, AUTO_WIDTH_KEY, undefined)
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
    edgePoints(id) {
      const cell = model.getCell(id)
      const points = cell?.isEdge() ? graph.getView().getState(cell)?.absolutePoints : null
      if (!points || points.length < 2 || points.some((point) => !point)) return null
      return points.map((point) => ({ x: point!.x - container.scrollLeft, y: point!.y - container.scrollTop }))
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
    viewportCenter: () => visibleCenter(),
    zoomTo(scale) {
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
      if (Math.abs(clamped - graph.getView().scale) < 0.001) return
      const center = visibleCenter()
      graph.zoomTo(clamped)
      editor.centerOn(center)
    },
    revealCell(id) {
      const cell = model.getCell(id)
      const state = cell && (cell.isVertex() || cell.isEdge()) ? graph.getView().getState(cell) : null
      if (!cell || !state) return false
      graph.stopEditing(false)
      graph.setSelectionCell(cell)
      const { scale, translate } = graph.getView()
      editor.centerOn({ x: state.getCenterX() / scale - translate.x, y: state.getCenterY() / scale - translate.y })
      return true
    },
    clearSelection() {
      graph.stopEditing(false)
      graph.clearSelection()
    },
    onPointerMove: (listener) => listen(pointerListeners, listener),
    setLaser(on) {
      if (on) setTool('laser')
      else if (tool === 'laser') setTool(null)
    },
    onLaser: (listener) => listen(laserListeners, listener),
    setCommentTool(on) {
      if (on) setTool('comment')
      else if (tool === 'comment') setTool(null)
    },
    onCommentPoint: (listener) => listen(commentListeners, listener),
    onSelectionChange: (listener) => listen(selectionListeners, listener),
    onViewChange: (listener) => listen(viewListeners, listener),
    getViewVersion: () => viewVersion,
    getEditing: () => editing,
    onEditingChange: (listener) => listen(editingListeners, listener),
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
      // The graph releases the label editor but keeps its cell, so a pending resize of it would stop editing later.
      graph.stopEditing(true)
      Reflect.deleteProperty(container, EDITOR_PROPERTY)
      container.removeEventListener('pointerdown', focusCanvas, true)
      container.removeEventListener('contextmenu', preventBrowserMenu)
      container.removeEventListener('pointermove', handlePointerMove, true)
      container.removeEventListener('pointerleave', handlePointerLeave)
      endLaserStroke()
      container.removeEventListener('pointerdown', pressWithTool, true)
      container.removeEventListener('pointerup', placeComment, true)
      for (const type of TOOL_STOPPED_EVENTS) container.removeEventListener(type, stopForTool, true)
      page.removeEventListener('keydown', handleToolKey)
      container.removeEventListener('scroll', notifyView)
      page.removeEventListener('copy', handleCopy)
      page.removeEventListener('cut', handleCut)
      page.removeEventListener('paste', handlePaste)
      destroyed = true
      graph.getSelectionModel().removeListener(handleSelectionChange)
      graph.getSelectionModel().removeListener(notify)
      graph.removeListener(handleLabelChanged)
      graph.removeListener(handleEditingStarted)
      graph.removeListener(handleCellsAdded)
      model.removeListener(redrawTables)
      model.removeListener(handleRemoteLabel)
      unwatchTableRows()
      unwatchLocks()
      graph.removeListener(handleResize)
      model.removeListener(notifyView)
      model.removeListener(notify)
      cells.unobserveDeep(handleAttribution)
      layoutManager.destroy()
      listeners.clear()
      pointerListeners.clear()
      laserListeners.clear()
      commentListeners.clear()
      selectionListeners.clear()
      menuListeners.clear()
      viewListeners.clear()
      editingListeners.clear()
      InternalEvent.removeAllListeners(container)
      keyHandler.onDestroy()
      undoManager.off('stack-item-added', notify)
      undoManager.off('stack-item-popped', notify)
      undoManager.off('stack-cleared', notify)
      if (!sharedUndoManager) undoManager.destroy()
      stopEdgeRouting()
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

/** Alignments along a vertical line, which move shapes horizontally. */
const HORIZONTAL_ALIGNS: ReadonlySet<ShapeAlign> = new Set(['left', 'center', 'right'])

/** The side or the centre line of a box that {@link DiagramEditor.alignShapes} lines shapes up on. */
function alignedLine({ x, y, width, height }: Box, align: ShapeAlign): number {
  switch (align) {
    case 'left':
      return x
    case 'center':
      return x + width / 2
    case 'right':
      return x + width
    case 'top':
      return y
    case 'middle':
      return y + height / 2
    case 'bottom':
      return y + height
  }
}

/** The value shared by all items, or `null` when they differ. */
function same<T>(values: T[]): T | null {
  const distinct = new Set(values)
  return distinct.size === 1 ? values[0]! : null
}

/** Where the label of a shape is drawn horizontally, and so which point of the shape its fitted width keeps. */
function alignOf(style: CellStyle): Align {
  return style.align === 'left' || style.align === 'right' ? style.align : 'center'
}

/** A shape with a size of its own: not a field, which its table places, nor a label of an edge. */
function isFreeShape(cell: Cell): boolean {
  return cell.isVertex() && !isTable(cell.getParent()) && cell.getGeometry() !== null && !cell.getGeometry()!.relative
}

/** A shape whose words may wrap: one that allows auto width, but not a table, whose name and fields are a line each. */
function allowsTextWrap(graph: Graph, cell: Cell): boolean {
  return isFreeShape(cell) && !isTable(cell) && allowsAutoWidth(graph.getCellStyle(cell) as ShapeStyle)
}

function isTable(cell: Cell | null): boolean {
  return cell?.isVertex() === true && isTableStyle(cell.getStyle() as ShapeStyle)
}

/** The parts of the text of an index, or of a name alone, which is an index without columns yet. */
function indexPartsOf(text: string): IndexParts | null {
  const named = splitIndex(`${text} ()`)
  return splitIndex(text) ?? (named && !named.rest && !named.unique && !named.method ? named : null)
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
 * Stacks the fields of a table under its header in the order of the cells, then its indexes under a gap for their
 * caption, across the whole width of the table, and fits the table height to them.
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

  // Indexes go after the fields even when two participants add a field and an index at once.
  override getLayoutCells(parent: Cell) {
    const cells = super.getLayoutCells(parent)
    return [...cells.filter((cell) => !isIndexRow(cell)), ...cells.filter(isIndexRow)]
  }

  // The rows after the first index follow it, and the table fits the last one.
  override setChildGeometry(child: Cell, geometry: Geometry) {
    if (isIndexRow(child) && child.getParent()!.getChildren().find(isIndexRow) === child) geometry.y += TABLE_INDEX_GAP
    super.setChildGeometry(child, geometry)
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

/**
 * Locked cells, and the cells inside them, cannot change: maxGraph asks {@link Graph.isCellLocked} before it moves,
 * resizes, bends, disconnects or edits a cell and before it shows its connection points. Deleting, rotating and
 * connecting new edges ask hooks of their own. Copies are not locked. Returns a function that stops watching the
 * selection.
 */
function configureLocks(graph: Graph): () => void {
  const locked = (cell: Cell) => lockHolder(cell) !== null
  const isCellLocked = graph.isCellLocked.bind(graph)
  graph.isCellLocked = (cell) => isCellLocked(cell) || locked(cell)
  // Removing a group removes what it holds.
  const isCellDeletable = graph.isCellDeletable.bind(graph)
  graph.isCellDeletable = (cell) => isCellDeletable(cell) && !locked(cell) && !hasLockedDescendant(cell)
  const isCellRotatable = graph.isCellRotatable.bind(graph)
  graph.isCellRotatable = (cell) => isCellRotatable(cell) && !locked(cell)
  // New edges neither start nor end at a locked cell, and an end of an edge is not moved onto one. The validity of
  // connections stays as it is: maxGraph checks the end that does not move as well.
  const connections = graph.getPlugin<ConnectionHandler>('ConnectionHandler')
  if (connections) connections.isConnectableCell = (cell) => !locked(cell)
  const createEdgeHandler = graph.createEdgeHandler.bind(graph)
  graph.createEdgeHandler = (state, edgeStyle) => {
    const handler = createEdgeHandler(state, edgeStyle)
    handler.isConnectableCell = (cell) => !locked(cell)
    return handler
  }
  const cloneCells = graph.cloneCells.bind(graph)
  graph.cloneCells = (...args) => {
    const clones = cloneCells(...args)
    // maxGraph leaves no clone of an edge that would be invalid without its ends.
    clones.forEach((clone) => clone && unlockCopy(clone))
    return clones
  }
  // The handles of a selected cell are made with it, when it is selected: a cell locked or unlocked since, by the
  // participant or by another one, gets new handles, unless they are being dragged.
  const handledLocks = new WeakMap<object, boolean>()
  const createHandler = graph.createHandler.bind(graph)
  graph.createHandler = (state) => {
    const handler = createHandler(state)
    handledLocks.set(handler, graph.isCellLocked(state.cell))
    return handler
  }
  const refreshHandlers = () => {
    const handlers = graph.getPlugin<SelectionCellsHandler>('SelectionCellsHandler')
    if (!handlers) return
    for (const cell of graph.getSelectionCells()) {
      const handler = handlers.getHandler(cell)
      const state = graph.getView().getState(cell)
      if (!handler || !state || handlers.isHandlerActive(handler)) continue
      if (handledLocks.get(handler) !== graph.isCellLocked(cell)) handlers.updateHandler(state)
    }
  }
  graph.getDataModel().addListener(InternalEvent.CHANGE, refreshHandlers)
  return () => graph.getDataModel().removeListener(refreshHandlers)
}

/**
 * Fields of tables are drawn in columns: their shape draws the icon and the columns after the name, which their label
 * shows; editing the label of a field edits its name.
 */
function configureTableFields(graph: Graph) {
  const getCellStyle = graph.getCellStyle.bind(graph)
  graph.getCellStyle = (cell) => {
    const style = getCellStyle(cell)
    if (isIndexRow(cell)) {
      const width = cell.getGeometry()?.width ?? 0
      const row = tableRowsOf(graph, cell.getParent()!).get(cell)
      const spacingRight = Math.max(ROW_PADDING, width - (row?.nameEnd ?? width - ROW_PADDING))
      return { ...style, shape: TABLE_FIELD_SHAPE, spacing: 0, spacingLeft: row?.nameX ?? nameX(1), spacingRight }
    }
    if (isColumnField(cell)) {
      // The label is the name in its column, aligned there; the shape draws the columns after it.
      const width = cell.getGeometry()?.width ?? 0
      const row = tableRowsOf(graph, cell.getParent()!).get(cell)
      const spacingRight = Math.max(ROW_PADDING, width - (row?.nameEnd ?? width - ROW_PADDING))
      const inherited = inheritedFieldId(cell) !== null && { fontColor: INHERITED_FIELD_COLOR }
      return { ...style, shape: TABLE_FIELD_SHAPE, spacing: 0, spacingLeft: row?.nameX ?? nameX(1), spacingRight, ...inherited }
    }
    if (isBaseTable(cell)) return { ...style, dashed: true, dashPattern: BASE_TABLE_DASH }
    return style
  }
  // An inherited field is edited in its base table.
  const isCellEditable = graph.isCellEditable.bind(graph)
  graph.isCellEditable = (cell) => inheritedFieldId(cell) === null && isCellEditable(cell)
  // Edges connect fields; an index is not one.
  const isValidSource = graph.isValidSource.bind(graph)
  graph.isValidSource = (cell) => !isIndexRow(cell) && isValidSource(cell)
  // The label of an index, as of a field, is its name.
  const getLabel = graph.getLabel.bind(graph)
  graph.getLabel = (cell) => {
    const label = getLabel(cell)
    if (label && isIndexRow(cell)) return splitIndex(label)?.name ?? label
    return label && isColumnField(cell) ? (splitField(label)?.name ?? label) : label
  }
  const getEditingValue = graph.getEditingValue.bind(graph)
  graph.getEditingValue = (cell, event) => {
    const text = String(cell.getValue() ?? '')
    if (isIndexRow(cell)) return splitIndex(text)?.nameText || getEditingValue(cell, event)
    return (isColumnField(cell) && splitField(text)?.nameText) || getEditingValue(cell, event)
  }
  const cellLabelChanged = graph.cellLabelChanged.bind(graph)
  graph.cellLabelChanged = (cell, value, autoSize) => {
    const text = String(cell.getValue() ?? '')
    if (isIndexRow(cell)) return cellLabelChanged(cell, renameIndex(text, String(value ?? '')), autoSize)
    return cellLabelChanged(cell, isColumnField(cell) ? renameField(text, String(value ?? '')) : value, autoSize)
  }
}

/**
 * maxGraph wraps only labels in HTML, and labels here are plain text: the label of a shape with text wrap is shown in
 * the lines that fit its width. The value and the edited text stay as the participant wrote them.
 */
function configureTextWrap(graph: Graph) {
  const getLabel = graph.getLabel.bind(graph)
  graph.getLabel = (cell) => {
    const label = getLabel(cell)
    return label && cell && hasTextWrap(cell.getStyle()) && allowsTextWrap(graph, cell)
      ? wrapLabel(label, graph.getCellStyle(cell), cell.getGeometry()!.width)
      : label
  }
}

function configureStyles(graph: Graph) {
  const stylesheet = graph.getStylesheet()
  Object.assign(stylesheet.getDefaultVertexStyle(), {
    fillColor: '#ffffff',
    strokeColor: '#1f2328',
    fontColor: '#1f2328',
    fontSize: 13,
  })
  Object.assign(stylesheet.getDefaultEdgeStyle(), {
    edgeStyle: 'orthogonalEdgeStyle',
    strokeColor: '#1f2328',
    fontColor: '#1f2328',
    endArrow: 'classic',
  })
}
