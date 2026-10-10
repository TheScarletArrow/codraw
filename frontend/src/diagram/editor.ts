import {
  Cell,
  CellEditorHandler,
  Client,
  ConnectionHandler,
  EdgeHandler,
  FitPlugin,
  Geometry,
  GeometryChange,
  Graph,
  GraphDataModel,
  Guide,
  ImageBox,
  ImageShape,
  InternalEvent,
  KeyHandler,
  LayoutManager,
  PolylineShape,
  PopupMenuHandler,
  SelectionHandler,
  Point as GraphPoint,
  Rectangle,
  RubberBandHandler,
  SelectionCellsHandler,
  StackLayout,
  StyleChange,
  StyleDefaultsConfig,
  TooltipHandler,
  ValueChange,
  VertexHandler,
  eventUtils,
  getDefaultPlugins,
  type AbstractCanvas2D,
  type CellState,
  type CellStyle,
  type EventObject,
  type InternalMouseEvent,
  VisibleChange,
} from '@maxgraph/core'
import * as Y from 'yjs'
import { latinKeyCode, latinLetter } from '../lib/keyboard.ts'
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
  readTextAuthor,
  TEXT_AUTHOR_KEY,
  TEXT_AUTHOR_NAME_KEY,
  writeAttribution,
  type Attribution,
  type TextAuthor,
} from './attribution.ts'
import { createCell, createUndoManager, DiagramBinding, isLayerCell, layerOf, localOrigin, toGeometry } from './binding.ts'
import type { MenuTarget } from './canvasMenu.ts'
import { coversChildren, darkCanvasStyle, type CanvasTheme } from './canvasTheme.ts'
import { canReadSystemClipboard, clipboard, writeSystemClipboard, type ClipboardSource } from './clipboard.ts'
import { clipboardContent, dataToCells, diagramCells, readClipboardText } from './clipboardFormat.ts'
import type { CellSnapshot } from './diff.ts'
import { apiLabel, EDGE_API_KEY, edgeApiOf, writeEdgeApi, type EdgeApi } from './edgeApi.ts'
import {
  edgeProperties,
  edgePropertiesStyle,
  normalizeProperties,
  propertiesStyle,
  propertyLine,
  PROPERTY_LIMITS,
  sameProperties,
  SHOW_TECHNOLOGY_KEY,
  type EdgeProperties,
  type ElementProperties,
} from './elementKinds.ts'
import {
  canBeElement,
  composeLabel,
  defaultKind,
  elementProperties,
  hasElement,
  labelFormat,
  labelLines,
  ownLines,
  propertiesOfLabel,
  relabel,
  showsTechnology,
  type LabelFormat,
} from './elementProps.ts'
import { registerDiagramExtensions } from './extensions.ts'
import { GridTableLayout, isGridTable, populateGridTable } from './gridTables.ts'
import { configureLists, formatList, handleListEnter, listKind, type ListKind } from './lists.ts'
import { newId } from './ids.ts'
import {
  cellImageUrls,
  fittedImageSize,
  IMAGE_GAP,
  imageStyle,
  needsStoring,
  pastesAsImage,
  replaceCellImages,
  storeImages,
  type ImageHost,
  type StoredImage,
} from './images.ts'
import { FREEHAND_KEY, isFreehandStyle, pencilLine, strokePoints, type PencilLine } from './freehand.ts'
import { commonPlan, PLAN_KEY, planOf, type Plan, type PlanView, type SelectionPlan } from './plan.ts'
import { configurePlan } from './planView.ts'
import { impactNode, type ImpactDepth } from './impact.ts'
import { configureImpact, modelImpactRecords, type ImpactState } from './impactView.ts'
import { configureFilter, modelFilterRecords, type FilterStatus } from './filterView.ts'
import { cellVisibility } from './cellVisibility.ts'
import { buildModel, writeModelField } from './boardModel.ts'
import { listPages } from './pages.ts'
import { detachView as detachPageView, isViewPage, showOnView, viewContents, viewOf, writeViewRule } from './modelViews.ts'
import { COMPUTED_KEY, type ViewRule } from './viewRule.ts'
import { frameParents, layoutShapes, type LayoutDirection, type LayoutEdge, type LayoutShape } from './layout.ts'
import { LEGEND_KEY, legendSettings, legendSettingsValue, type LegendItem } from './legend.ts'
import { DEFAULT_END_ARROW, markerChanges, markerOf, type EdgeEnd } from './edgeMarkers.ts'
import { isAssociationPair, isUseCaseRelation, relationChanges, relationOf, type UmlRelation } from './useCase.ts'
import {
  configureLegends,
  graphLegendItems,
  isLegend,
  LegendGraphLayout,
  legendsForChanges,
  registerLegendShapes,
} from './legendShapes.ts'
import { LINK_KEY, linkOf } from './links.ts'
import { LayerViews, type PageLayerView } from './layerViews.ts'
import {
  hasLockedDescendant,
  isLockedStyle,
  LOCKED_BY_KEY,
  LOCKED_KEY,
  lockedByOf,
  lockHolder,
  lockHolders,
  unlockCopy,
} from './locks.ts'
import { sketchPage, type PageSketch } from './minimap.ts'
import { filterChoices, isFilterActive, type FilterChoices, type PageFilter } from './pageFilter.ts'
import { sequenceMermaid as mermaidOfSequence } from '../mermaid/sequenceMermaid.ts'
import {
  ACTIVATE_KEY,
  ARROW_KEY,
  BRANCH_WORDS,
  DEACTIVATE_KEY,
  FRAME_KEY,
  frameOwners,
  FROM_KEY,
  isNumbered,
  messageStyle,
  NOTE_KEY,
  noteStyle,
  NUMBERS_KEY,
  PART_KEY,
  PARTICIPANT_KIND_KEY,
  participantStyle,
  SEQUENCE_PRESET,
  sequenceCells,
  starterSequence,
  TO_KEY,
  type FrameKind,
  type MessageArrow,
  type NotePlacement,
  type ParticipantKind,
  type SequenceDiagram,
} from './sequence.ts'
import {
  configureSequences,
  diagramCell,
  graphSequence,
  isSequence,
  isSequencePart,
  partOf,
  registerSequenceShapes,
  SequenceDiagramLayout,
  sequenceOf,
  withDependentParts,
} from './sequenceShapes.ts'
import {
  cellElementId,
  compareCells,
  DEFAULT_PAGE_ID,
  ELEMENT_KEY,
  elementIdOf,
  getCells,
  getPages,
  HIDDEN_LAYER_KEY,
  isHiddenLayerStyle,
  LAYER_CELL_ID,
  layerName,
  OWN_LINES_KEY,
  readCell,
  type CellData,
  type ModelField,
  type StyleValue,
} from './model.ts'
import { blocksPlacement, placeConnected, type Side } from './quickConnect.ts'
import { DEFAULT_FILL_COLOR, DEFAULT_LINE_COLOR } from './colors.ts'
import { DEFAULT_FONT, fontFamilyOf } from './fonts.ts'
import { touchedByRegion } from './regionSelection.ts'
import { normalizeRotation, ROTATION_KEY, rotatedBounds, rotationOf } from './rotation.ts'
import { cellsToRestore, writeRestoredFields } from './restore.ts'
import { canDetail, createDetailPage, detailPageOf } from './detail.ts'
import {
  detachCell,
  elementData,
  elementPlaces,
  elementUses,
  cellLabel,
  ensureElement,
  isLockedCell,
  mayBeElement,
  mergeElements as mergeDocumentElements,
  RELABEL_ORIGIN,
  removeElementCells,
  styleWith,
  type CellRef,
  type ElementDrag,
  type ElementPlace,
} from './sharedElements.ts'
import {
  commonStatus,
  readStatus,
  STATUS_KEYS,
  writeStatus,
  type ElementStatus,
  type SelectionStatus,
} from './status.ts'
import { startEdgeRouting } from './routing/edgeRouter.ts'
import { fittedFontSize, rememberStickyColor, stickyColor } from './stickies.ts'
import { copyLook, styleChanges, styleClipboard, TABLE_ROW_KEYS, type CopiedStyle, type StyleKind } from './styleCopy.ts'
import { renderSvg, type ExportedImage, type SvgOptions } from './svgExport.ts'
import { configureIconBadges } from './iconBadges.ts'
import { ICON_KEY, iconPathNow, logoShape, techIconsNow } from './techIcons.ts'
import {
  findShape,
  groupShapes,
  hasTextFit,
  isStickyStyle,
  isTableStyle,
  markedStyle,
  shapeGroup,
  shapeGroupOf,
  TABLE_FIELD_HEIGHT,
  TABLE_FIELD_STYLE,
  TABLE_HEADER_HEIGHT,
  TABLE_INDEX_GAP,
  TABLE_INDEX_KEY,
  TEXT_FIT_KEY,
  type ShapeId,
  type ShapeGroup,
  type ShapePreset,
  type ShapeStyle,
} from './shapes.ts'
import { BASE_BADGE, badgeRoom, nameX, ROW_PADDING } from './tableRows.ts'
import {
  isMaterializedStyle,
  isViewTable,
  MATERIALIZED_KEY,
  MAX_VIEW_QUERY,
  normalizeViewQuery,
  viewBadge,
  viewQueryOf,
  VIEW_KEY,
  VIEW_QUERY_KEY,
} from './views.ts'
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

export type { EdgeEnd } from './edgeMarkers.ts'

/** Markers of the selected edges; `null` for an end where the edges have different markers. */
export interface EdgeMarkers {
  start: string | null
  end: string | null
}

/** The relation of use cases of the selected edges; see `useCase.ts`. */
export interface SelectionRelation {
  /** The relation of all the selected edges, or `null` when they differ or some look like none. */
  value: UmlRelation | null
}

export type ColorTarget = 'fill' | 'stroke' | 'font'

/** Colors of the selected objects; `null` for a color that differs between them. */
export interface SelectionColors {
  fill: string | null
  stroke: string | null
  font: string | null
  /** Opacity of the fill of the selected shapes, 0–100; `null` when it differs between them or no shapes are selected. */
  fillOpacity: number | null
  /**
   * The second color of the gradient of the fill of the selected shapes, `none` without a gradient; `null` when it
   * differs between them or no shapes are selected.
   */
  gradient: string | null
  /** Where the fill turns into the second color; `null` when it differs, or without a gradient or shapes. */
  gradientDirection: GradientDirection | null
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
  /**
   * Shape of the selected edges; `null` without edges, when it differs, or for a routing CoDraw does not offer. Lines
   * drawn by hand are not edges here: they have no shape of an edge.
   */
  edgeShape: EdgeShape | null
  hasEdges: boolean
  /** The shadow and the corners of the selected shapes; `null` when no shapes are selected. */
  shapes: SelectionShapeEffects | null
}

/** Where a gradient of draw.io turns the fill into its second color: `south` from the top down, the default. */
export type GradientDirection = 'south' | 'north' | 'east' | 'west'

/** Corners of shapes are rounded by this share of their shorter side, in percent, without `arcSize`. */
export const DEFAULT_ARC_SIZE = 15
export const MIN_ARC_SIZE = 1
export const MAX_ARC_SIZE = 50

/** The shadow and the corners of the selected shapes. */
export interface SelectionShapeEffects {
  /** Every selected shape has a shadow. */
  shadow: boolean
  /** Every selected shape that can round its corners has them rounded. */
  rounded: boolean
  /**
   * The radius of the rounded corners in percent of the shorter side; `null` when it differs, when not all of them are
   * rounded, or when a shape has it in pixels (`absoluteArcSize` of draw.io).
   */
  arcSize: number | null
  /** Some selected shape can round its corners: a rectangle, a rhombus, a table; an ellipse cannot. */
  canRound: boolean
}

/** Changes of {@link DiagramEditor.setShapeEffects}; what is not given stays. */
export interface ShapeEffectsChanges {
  shadow?: boolean
  rounded?: boolean
  /** In percent of the shorter side, {@link MIN_ARC_SIZE}–{@link MAX_ARC_SIZE}. */
  arcSize?: number
  /** The second color of the gradient; `none` removes the gradient. */
  gradient?: string
  gradientDirection?: GradientDirection
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
  list?: ListKind | null
}

/** Position and size of the selected shapes; `null` for a value that differs between them. */
export interface SelectionGeometry {
  x: number | null
  y: number | null
  width: number | null
  height: number | null
  /** A selected shape is not a table, whose height its fields set, so the height can be changed. */
  canSetHeight: boolean
  /** A selected shape is not a sequence diagram, whose size its parts set, so the width can be changed. */
  canSetWidth: boolean
  /**
   * Clockwise rotation of the selected shapes that turn, in degrees from 0 up to 360; `null` when it differs between
   * them or none of them turns.
   */
  rotation: number | null
  /** A selected shape turns: it is neither a table nor a group (see {@link DiagramEditor.setRotation}). */
  canRotate: boolean
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
  /** The field is a column of a view, which has a type and no keys. */
  inView: boolean
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

/** What the selected table, or the table of the selected field, is as to views. */
export interface TableView {
  /** The table is a view: its fields are the columns of its query. */
  view: boolean
  /** The view is materialized: the database keeps its rows, and it may have indexes. */
  materialized: boolean
  /** The query of the view, the text after `AS`; empty without one. */
  query: string
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

/** The link of an element of the page; see {@link linkOf}. */
export interface CellLink {
  cellId: string
  link: string
}

/** The link of the single selected element that may have one: a shape, a table, a group or an edge. */
export interface SelectionLink {
  cellId: string
  /** Its link, or `null` without one or with one that CoDraw does not open. */
  link: string | null
  /** The participant may change it: they edit the board and the element is not locked. */
  canChange: boolean
}

/** The description of the HTTP call of the single selected edge; see {@link DiagramEditor.setEdgeApi}. */
export interface SelectionEdgeApi {
  cellId: string
  /** Its description, or `null` without one or with one that CoDraw cannot read (see {@link edgeApiOf}). */
  api: EdgeApi | null
  /** The participant may change it: they edit the board and the edge is not locked. */
  canChange: boolean
}

/**
 * The properties of the single selected shape that may be an element (see {@link DiagramEditor.setElementProperties}),
 * or of the single selected edge that is not drawn by hand (see {@link DiagramEditor.setEdgeProperties}).
 */
export type SelectionProperties =
  | {
      target: 'shape'
      cellId: string
      properties: ElementProperties
      /** The kind the shape stands for when nobody chose one. */
      defaultKind: ShapeId | null
      /** The label of C4 is made of the properties; a plain one shows the technology on its second line when asked. */
      format: LabelFormat
      showTechnology: boolean
      /** The shape is a cell of an element of the board, which keeps its properties; otherwise its label tells them. */
      element: boolean
      /** The logo chosen for the shape (a slug of simple-icons or `none`), `null` for that of its technology. */
      icon: string | null
      /** The participant may change them: they edit the board and the shape is not locked. */
      canChange: boolean
    }
  | {
      target: 'edge'
      cellId: string
      properties: EdgeProperties
      /**
       * Of an edge a view computed: the relations of the model it shows, which are changed where they are drawn; `null`
       * for an edge drawn on the page.
       */
      relations: ViewRelation[] | null
      canChange: boolean
    }
  | {
      target: 'legend'
      cellId: string
      /** Every item of the page, hidden ones too, in the order of the legend. */
      items: LegendPanelItem[]
      canChange: boolean
    }

/** A relation of the model that an edge of a view shows: the edge of a page between two elements. */
export interface ViewRelation {
  pageId: string
  pageName: string
  cellId: string
  source: string
  target: string
  label: string
  technology: string
}

/** An item of a legend as its panel shows it; see {@link DiagramEditor.setLegendItem}. */
export interface LegendPanelItem extends Pick<LegendItem, 'key' | 'type'> {
  /** The name of the item unless the legend names it otherwise. */
  defaultName: string
  /** The name the legend gives it, or `''` for none. */
  name: string
  hidden: boolean
}

/** Changes of the properties of a shape, and whether its plain label shows the technology. */
/**
 * A change of the properties of a shape; `icon` is the slug of a logo of simple-icons chosen for it, `none` for no logo,
 * or `null` for that of its technology (see `techIcons.ts`).
 */
export type ElementPropertiesChange = Partial<ElementProperties> & { showTechnology?: boolean; icon?: string | null }

/** The element that the single selected shape shows, and where; see {@link DiagramEditor.selectedElement}. */
export interface SelectionElement {
  cellId: string
  /** `null` for a shape that is no element yet: its label tells its properties. */
  elementId: string | null
  properties: ElementProperties
  /** The pages with the cells of the element, in their order; empty for a shape that is no element yet. */
  places: ElementPlace[]
  /** The participant may change the element through this cell: they edit the board and the cell is not locked. */
  canChange: boolean
}

/** An element whose properties «Объединить в один элемент» may keep; see {@link DiagramEditor.mergeCandidates}. */
export interface MergeCandidate {
  /** A selected cell of the element. */
  cellId: string
  elementId: string | null
  properties: ElementProperties
  /** Number of pages with cells of the element; 1 for a shape that is no element yet. */
  pages: number
}

/** An element of the board to add a cell of: by its id, or a shape that is no element yet. */
export type ElementSource = ElementDrag

/** The selected stickies, which the panel of stickies changes; see {@link DiagramEditor.setStickyColor}. */
export interface SelectedStickies {
  cellIds: string[]
  /** Their color; `null` when it differs between them. */
  color: string | null
  /** The size of the text fits every one of them (see {@link DiagramEditor.setTextFit}). */
  textFit: boolean
  /** Every one of them is locked: the panel changes none of them. */
  locked: boolean
}

/** A sticky of the page with who wrote its text, which the canvas shows at its bottom. */
export interface StickySignature extends TextAuthor {
  cellId: string
  /** The color of the text of the sticky, which its signature takes. */
  color: string
}

/** The single selected part of a sequence diagram with what the panel changes in it. */
export type SequencePartState =
  | { type: 'participant'; cellId: string; kind: ParticipantKind }
  | {
      type: 'message'
      cellId: string
      /** The keys of the sender and of the receiver. */
      from: string
      to: string
      arrow: MessageArrow
      /** The message starts an activation of its receiver, and ends one of its sender. */
      activates: boolean
      deactivates: boolean
    }
  | { type: 'note'; cellId: string; placement: NotePlacement; from: string; to: string }
  /** A frame, or a branch of the frame `frameId`, of the kind of that frame. */
  | { type: 'frame' | 'branch'; cellId: string; kind: FrameKind; frameId: string }

/** The sequence diagram that the selection is, or is parts of; see {@link DiagramEditor.addSequenceMessage}. */
export interface SelectedSequence {
  diagramId: string
  numbered: boolean
  /** Its participants from left to right, which messages and notes name by their keys. */
  participants: { key: string; name: string }[]
  /** The single selected part, or `null` when the diagram or several parts are selected. */
  part: SequencePartState | null
  /** The number of selected rows, which a new frame goes around. */
  rows: number
  /** The participant may change it: they edit the board and the diagram is not locked. */
  canChange: boolean
}

/** Changes of a message of a sequence diagram; see {@link DiagramEditor.setSequenceMessage}. */
export interface SequenceMessageChange {
  from?: string
  to?: string
  arrow?: MessageArrow
  activates?: boolean
  deactivates?: boolean
}

/** Changes of a note of a sequence diagram; see {@link DiagramEditor.setSequenceNote}. */
export interface SequenceNoteChange {
  placement?: NotePlacement
  from?: string
  to?: string
}

/** A layer of the page as the panel «Слои» shows it; see {@link DiagramEditor.addLayer}. */
export interface LayerState {
  id: string
  /** The name it goes by: its own, «Основной слой» or «Слой без имени». */
  name: string
  /** Its own name, or `''` without one. */
  ownName: string
  /** The main layer of the page, which every page has and which cannot be removed. */
  main: boolean
  /** It shows on this canvas. */
  visible: boolean
  /** It is hidden for everybody who did not show it for themselves. */
  hiddenForAll: boolean
  /** The participant shows (`true`) or hides (`false`) it for themselves whatever everybody sees, or `null`. */
  ownVisibility: boolean | null
  /** Nobody can select or change its elements. */
  locked: boolean
  /** The name of the participant who locked it, or `null`, e.g. for a layer locked in draw.io. */
  lockedBy: string | null
  /** New elements go into it (see {@link DiagramEditor.setActiveLayer}). */
  active: boolean
  /** The number of the elements of the page in it: shapes, tables, groups and edges, not their parts. */
  elements: number
  /** The number of them that are selected. */
  selected: number
  /** «Перенести выделенное сюда» moves something into it: it is not locked, and selected elements of other layers are not. */
  canMoveSelection: boolean
  /** It holds a locked element: removing it may only move its elements (see {@link DiagramEditor.deleteLayer}). */
  holdsLocked: boolean
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
  /** The selected table, or the table of the selected field, as to views; `null` when none is selected. */
  tableView: TableView | null
  /** Markers of the selected edges, or `null` when no edge is selected. */
  edgeMarkers: EdgeMarkers | null
  /**
   * The relation of use cases of the selected edges, or `null` when none of them ends at an actor or a use case or is
   * an inclusion, an extension or a generalization.
   */
  edgeRelation: SelectionRelation | null
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
  /** A single element that has a look of its own is selected: a shape, a table, a field, an index or an edge, not a group. */
  canCopyStyle: boolean
  /**
   * A look is copied in the tab, and the selection has an element that is not locked to paste it into; never for a
   * participant who may only view.
   */
  canPasteStyle: boolean
  /**
   * The selection has an element that is not locked to give a look to, e.g. of a component of a library (see
   * {@link DiagramEditor.applyComponentStyle}); never for a participant who only views.
   */
  canTakeStyle: boolean
  /** {@link DiagramEditor.autoLayout} lays out the selection: it has two shapes, tables or groups at least. */
  layoutSelection: boolean
  /** The laser pointer is on: dragging on the canvas draws its trail instead of selecting or moving anything. */
  laser: boolean
  /** The comment tool is on: a click on the canvas places a comment instead of selecting anything. */
  commentTool: boolean
  /** The pencil is on: dragging on the canvas draws a line by hand instead of selecting or moving anything. */
  pencil: boolean
  /** The line that the pencil draws with: the color, width and dash last chosen for lines (see {@link pencilLine}). */
  pencilLine: PencilLine
  /** How the selection is locked, or `null` when nothing is selected. */
  lock: SelectionLock | null
  /** Who changed the single selected element last, or `null` without one or when it does not keep that. */
  attribution: SelectionAttribution | null
  /** Images can be added: the participant edits the page, and the page stores images (see {@link DiagramEditorOptions.images}). */
  canAddImages: boolean
  /** The link of the single selected element that may have one, or `null` when no such element is selected alone. */
  link: SelectionLink | null
  /** The description of the call of the single selected edge, or `null` when no edge is selected alone. */
  edgeApi: SelectionEdgeApi | null
  /** The selected stickies, or `null` when none is selected or the participant may only view. */
  stickies: SelectedStickies | null
  /**
   * The status of the selected elements that may have one (see {@link DiagramEditor.setStatus}), or `null` when none of
   * them may.
   */
  status: SelectionStatus | null
  /** The marks of plan of the selected elements that may have one (see {@link DiagramEditor.setPlan}), `null` when none may. */
  selectionPlan: SelectionPlan | null
  /** How this participant shows the page (see `plan.ts`), and how many elements of it will appear and will go. */
  plan: { view: PlanView; added: number; removed: number }
  /** The properties of the single selected shape or edge that has them; see {@link SelectionProperties}. */
  properties: SelectionProperties | null
  /** The sequence diagram of the selection, or `null` when the selection is not one or its parts. */
  sequence: SelectedSequence | null
  /** The impact analysis the canvas shows, `null` without one; see {@link DiagramEditor.showDependencies}. */
  impact: ImpactState | null
  /** The filter of the page while it chooses something: how many elements match, of how many, and whether it hides. */
  filter: { matched: number; total: number; hide: boolean } | null
  /** The clipboard of the browser tab holds copied cells: «Вставить как тот же элемент» pastes them. */
  canPasteAsSameElement: boolean
  /** The selection has shapes of at least two elements, or of shapes that are no elements yet, that may be merged. */
  canMergeElements: boolean
  /** The layers of the page, the top one first: the one drawn over the others. */
  layers: LayerState[]
}

/** The selection as a component of a library; see {@link DiagramEditor.selectionComponent}. */
export interface SelectionComponent {
  /** Clones of what copying takes, with their descendants, that no graph holds. */
  cells: Cell[]
  /** The selection drawn as {@link DiagramEditor.exportSvg} draws it, without a background. */
  image: ExportedImage | null
  /** The label of the single selected shape, or «Компонент». */
  name: string
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
  /**
   * Adds a palette shape centred at `center` (diagram coordinates) or in the middle of the visible area; a sticky has
   * the color of new stickies.
   */
  addShape(shape: ShapeId, center?: Point): Cell | null
  /**
   * Adds the logo `slug` of simple-icons as a picture of 64 × 64 named by it, like {@link addShape}; `null` while the
   * catalog of the logos or the logo itself is not loaded yet (see `techIcons.ts`).
   */
  addLogo(slug: string, center?: Point): Cell | null
  /** Resolves once the logos of the technologies of the page are drawn on its shapes (see `iconBadges.ts`). */
  iconsReady(): Promise<void>
  /**
   * Adds a sticky of the color of new stickies centred at `center`, without it at the pointer over the canvas or in the
   * middle of the visible area, selects it and starts editing its text: the text applied in that editing is the undo
   * step that adds the sticky. Turns the laser pointer and the comment tool off.
   */
  addSticky(center?: Point): Cell | null
  /**
   * Gives the selected stickies that are not locked the fill `color` as one undo step, and makes it the color of new
   * stickies, which the browser remembers.
   */
  setStickyColor(color: string): void
  /**
   * Turns on or off the size of the text that fits the selected stickies that are not locked, as one undo step: the
   * largest size up to 20 at which their text fits them, taken when their text, size or font changes. On, it turns
   * their auto width off and fits the size at once; a size set by hand turns it off.
   */
  setTextFit(enabled: boolean): void
  /**
   * The stickies of the page that keep who wrote their text, but those turned and the one whose text is being edited,
   * which show no signature.
   */
  stickySignatures(): StickySignature[]
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
   * Adds a participant to the sequence diagram of the selection right of the selected participant, or last, as one undo
   * step, selects it and starts editing its name; the name written there joins that step.
   */
  addSequenceParticipant(): Cell | null
  /**
   * Adds a message to the sequence diagram of the selection under the selected row, or last, as one undo step, selects it
   * and starts editing its text: between the participants of the selected message and of its kind, from the selected
   * participant to its neighbour, or from the first participant to the second. The text written there joins that step;
   * a message whose editing is cancelled or ends without text goes away with it, leaving nothing to redo. Enter in the
   * text of a message adds the next one this way.
   */
  addSequenceMessage(): Cell | null
  /**
   * Adds a note under the selected row of the sequence diagram of the selection, or last, over the selected participant
   * or the participants of the selected message, as one undo step, and starts editing its text.
   */
  addSequenceNote(): Cell | null
  /**
   * Puts the selected rows of the sequence diagram of the selection, whole frames with them, into a new frame of `kind`
   * as one undo step, or without selected rows adds an empty frame last, and starts editing its condition.
   */
  addSequenceFrame(kind: FrameKind): Cell | null
  /** Adds a branch at the end of the selected frame, or of the frame of the selected branch, if its kind has branches. */
  addSequenceBranch(): Cell | null
  /** Changes the kind of the participant `cellId` of a sequence diagram as one undo step. */
  setSequenceParticipant(cellId: string, changes: { kind?: ParticipantKind }): void
  /**
   * Changes the sender, the receiver, the kind or the activations of the message `cellId` as one undo step; a new sender or
   * receiver takes over the activations the old one had of the message.
   */
  setSequenceMessage(cellId: string, changes: SequenceMessageChange): void
  /** Changes where the note `cellId` stands, or its participants, as one undo step. */
  setSequenceNote(cellId: string, changes: SequenceNoteChange): void
  /** Changes the kind of the frame `cellId` as one undo step. */
  setSequenceFrame(cellId: string, kind: FrameKind): void
  /** Turns the numbers of the messages of the sequence diagram `cellId` on or off as one undo step. */
  setSequenceNumbering(cellId: string, numbered: boolean): void
  /** The sequence diagram of the cell `cellId`, or of which it is a part, as Mermaid; `null` for other cells. */
  sequenceMermaid(cellId: string): string | null
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
   * and other text as a text shape, in the middle of the visible area, or with the top-left corner at `at`. Pictures of
   * the cells that the board must store (see {@link needsStoring}) are stored first. `files` of the clipboard are added
   * as images (see {@link addImages}) when the clipboard holds a picture rather than text (see {@link pastesAsImage}).
   */
  paste(at?: Point, text?: string, html?: string, files?: Blob[]): void
  /**
   * Stores the image files on the board, then adds an image shape for each stored one as one undo step: in a row whose
   * middle is at `at`, or in the middle of the visible area, and selects them. Files that were not stored are left out;
   * the host of images has told why. Without a host it does nothing.
   */
  addImages(files: Blob[], at?: Point): Promise<void>
  /** Adds a shifted copy of what {@link copy} would copy, without changing the clipboard. */
  duplicate(): void
  /**
   * Keeps the look of the single selected element in the tab (see {@link styleClipboard}): its fill, line and text, as
   * far as it has them. Changes neither the board nor the clipboards; a group has no look of its own.
   */
  copyStyle(): void
  /**
   * Gives the selected elements the copied look, as one undo step: only the parts that both the copied element and each
   * of them have, the keys the copied one lacks back to their defaults (see {@link styleChanges}). A table gets it as a
   * shape, and its fields its font and text size; a group gives it to its shapes and edges. Locked elements stay as
   * they are.
   */
  pasteStyle(): void
  /**
   * The selection as a component of a library: clones of what {@link copy} would copy, the image of the selection and a
   * name for it. Changes nothing; `null` when nothing is selected that copying takes.
   */
  selectionComponent(): SelectionComponent | null
  /**
   * Adds a copy of a component of a library, `content` being its `<mxGraphModel>` of draw.io, as one undo step, with
   * its middle at `center`, or in the middle of the visible area, and selects it. The copy has cells and elements of its
   * own and nothing locked, and the pictures that the board must store are stored first, as {@link paste} does.
   * Resolves to whether there was anything to add.
   */
  insertComponent(content: string, center?: Point): Promise<boolean>
  /**
   * Gives the selected elements the look of the first shape of a component of a library (without shapes, of its first
   * edge) as {@link pasteStyle} gives a copied look, as one undo step; the look copied in the tab stays. Resolves to
   * whether anything changed.
   */
  applyComponentStyle(content: string): Promise<boolean>
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
  /**
   * Sets the status of the selected shapes, tables and groups, a field or an index for its table, in the name of the
   * participant at this moment, or with `null` takes it off, as one undo step; edges get none, and locked elements get it
   * too. Elements that have the status already keep it, with who set it and when. Returns the ids of the elements whose
   * status changed, in the order of the selection; a read-only editor changes none.
   */
  setStatus(status: ElementStatus | null): string[]
  /**
   * Marks the selected shapes, tables, groups and edges, a field or an index for its table, as elements that will appear
   * or will go, or with `null` as they are, as one undo step; locked elements stay as they are.
   */
  setPlan(plan: Plan | null): void
  /** Shows the page as it is now, as it will be, or with the difference (see `plan.ts`): for this participant alone. */
  setPlanView(view: PlanView): void
  /**
   * «Применить целевое состояние»: removes the elements of the page that will go, with their edges, and takes the mark off
   * those that will appear, as one undo step; locked elements stay. Returns whether it changed anything.
   */
  applyTargetState(): boolean
  /** Starts editing the label of the selected element. */
  editLabel(): void
  deleteSelection(): void
  /** Gives the keyboard to the canvas, so that its shortcuts work, unless a label is being edited. */
  focus(): void
  /**
   * Draws the page for the theme of the app: on the dark canvas black lines and text that lie on the canvas are shown
   * light. Only the canvas of this participant changes; the document and images of the page do not.
   */
  setTheme(theme: CanvasTheme): void
  /**
   * Draws the page, or with `selectionOnly` what {@link copy} would take, into an SVG image at 100%, in the colors of the
   * diagram whatever the theme of the canvas; `null` when there is nothing to draw.
   */
  exportSvg(options?: SvgOptions & { selectionOnly?: boolean; onlyVisible?: boolean }): ExportedImage | null
  /**
   * Shows what the element of the cell `cellId` depends on and what depends on it, up to `depth` steps (see
   * `impact.ts`), on this canvas only: they are outlined in their colors and everything else is pale. `false` for a cell
   * that depends on nothing by its kind, e.g. an edge.
   */
  showDependencies(cellId: string, depth?: ImpactDepth): boolean
  /** Shows the shortest paths between the cells `from` and `to`, or between the two selected shapes, on this canvas only. */
  showPathBetween(from?: string, to?: string): boolean
  /** Ends the impact analysis of the canvas. */
  clearImpact(): void
  /** The cell is an element whose dependencies the analysis shows: a shape, a table, a field of a table. */
  canAnalyze(cellId: string): boolean
  /** Two shapes are selected whose paths the analysis shows. */
  canShowPath(): boolean
  /**
   * Shows the page through `filter` (see `pageFilter.ts`): what does not match drawn pale, or not at all when it hides.
   * Only this editor changes, not the document; `null`, or a filter that chooses nothing, shows everything. While a
   * filter is on, an image of {@link exportSvg} has the page without it, or with `onlyVisible` only what matches.
   */
  setFilter(filter: PageFilter | null): void
  /** The filter the page is shown through, `null` without one. */
  currentFilter(): PageFilter | null
  /** The values the facets of the filter offer on the page, with those `filter` chose; see `filterChoices`. */
  filterChoices(filter?: PageFilter | null): FilterChoices
  /** What the filter does to the cell `cellId`: drawn pale, hidden, or nothing. */
  filterStatus(cellId: string): FilterStatus
  /** Reports right clicks on the canvas; returns an unsubscribe function. */
  onContextMenu(listener: (request: ContextMenuRequest) => void): () => void
  /** Sets the marker of the start or the end of the selected edges. */
  setEdgeMarker(end: EdgeEnd, marker: string): void
  /** Makes the selected edges the relation of use cases — their line, markers and label — as one undo step. */
  setEdgeRelation(relation: UmlRelation): void
  /** Sets the fill (shapes only), line or text color of the selected objects as one undo step. */
  setColor(target: ColorTarget, color: string): void
  /**
   * Sets the opacity of the fill of the selected shapes, 0–100, as one undo step; the line and the text stay opaque.
   * 100 is the default.
   */
  setFillOpacity(opacity: number): void
  /**
   * Sets the shadow, the rounded corners and their radius, or the gradient of the fill of the selected shapes as one
   * undo step; corners only of the shapes that can round them. Defaults are kept without their keys.
   */
  setShapeEffects(changes: ShapeEffectsChanges): void
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
  setList(kind: ListKind | null): void
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
  /**
   * Makes the selected table a view, which is no base table and has no base, keeping its inherited fields as its own, or
   * a table again, without the materialization and the query of the view.
   */
  setViewTable(enabled: boolean): void
  /** Makes the selected view materialized or not; its rows of indexes stay. */
  setViewMaterialized(enabled: boolean): void
  /** Sets the query of the selected view without the final `;`; an empty one removes it, one too long is not kept. */
  setViewQuery(query: string): void
  /** Sets the position or size of the selected shapes as one undo step; tables keep the height of their fields. */
  setGeometry(changes: Partial<Box>): void
  /**
   * Turns the selected shapes clockwise around their centres to `angle` degrees, as one undo step: a whole angle from 0
   * to 359, so that 360 is 0 and −90 is 270; 0, the default, removes the key. Tables, their fields, groups, edges and
   * locked shapes do not turn.
   */
  setRotation(angle: number): void
  /**
   * Sets the link of the single selected shape, table, group or edge, or removes it with `null`, as one undo step. A
   * locked element, a field or an index, and a link that CoDraw would not open (see {@link linkOf}) change nothing.
   */
  setLink(link: string | null): void
  /**
   * Sets the description of the HTTP call of the single selected edge, or removes it with `null`, as one undo step. An
   * empty label of the edge, or one that tells the call of the description it had (see {@link apiLabel}), becomes the
   * label of the new one; removing the description keeps the label. A locked edge changes nothing.
   */
  setEdgeApi(api: EdgeApi | null): void
  /**
   * Changes the properties of the shape `cellId` of the page, as one undo step, unless it may be no element, is locked or
   * nothing changes. A shape without an element gets one with the properties its label told and the changes. A label
   * of C4 is made of the new properties; a plain one gets the new name on its first line, the technology in brackets on
   * the second when `showTechnology`, and keeps its other lines. Values are cut and cleaned as the document keeps them.
   */
  setElementProperties(cellId: string, changes: ElementPropertiesChange): void
  /** Changes the technology or the interaction of the edge `cellId` of the page, as one undo step; the label stays. */
  setEdgeProperties(cellId: string, changes: Partial<EdgeProperties>): void
  /**
   * Names the item `key` of the legend `cellId` (an empty name gives it back its own) or hides and shows it, as one undo
   * step; a locked legend and an editor only for reading change nothing.
   */
  setLegendItem(cellId: string, key: string, changes: { name?: string; hidden?: boolean }): void
  /**
   * Adds a layer «Слой N» on top of the others as one undo step, N the number of the layers with it or the next free
   * one, and makes it the active layer; returns its id.
   */
  addLayer(): string | null
  /** Names a layer as one undo step: one line of up to 100 characters; an empty name leaves it its name by default. */
  renameLayer(layerId: string, name: string): void
  /** Moves a layer one place up, over the next one, or down, as one undo step. */
  moveLayer(layerId: string, direction: 'up' | 'down'): void
  /** Locks or unlocks a layer for everybody, with the name of the participant, as one undo step. */
  setLayerLocked(layerId: string, locked: boolean): void
  /**
   * Hides a layer for everybody, or shows it again, as one undo step; on this canvas it then follows that whatever the
   * participant chose for themselves.
   */
  setLayerHidden(layerId: string, hidden: boolean): void
  /**
   * Shows or hides a layer on this canvas only: nobody else sees it, the document does not keep it, undo does not undo
   * it; the participant who may only view does it too.
   */
  setLayerVisible(layerId: string, visible: boolean): void
  /**
   * Makes a layer the one new elements go into, for this participant only; while it is hidden on this canvas or
   * locked, they go into the main layer, or the top layer that is neither (see {@link LayerState.active}).
   */
  setActiveLayer(layerId: string): void
  /**
   * Moves the selected elements of the page that are not locked — a table in place of its field, a group in place of
   * its shape, a sequence diagram in place of its part — with the edges between them into a layer that is not locked,
   * on top of its elements and at their places, as one undo step.
   */
  moveSelectionToLayer(layerId: string): void
  /**
   * Removes a layer that is neither the main one nor locked, as one undo step: with `moveTo`, its elements go on top of
   * that layer first; without, they go with it, with the edges of other layers that end at them, unless one of them is
   * locked.
   */
  deleteLayer(layerId: string, moveTo: string | null): void
  /**
   * Pastes the cells copied in this tab as {@link paste} does, but a shape that may be an element becomes another cell
   * of the element of the shape it was copied from, with the properties of the element now; that shape becomes an
   * element if it is none yet. Cells copied on another board are pasted as new elements. One undo step.
   */
  pasteAsSameElement(at?: Point): void
  /**
   * Adds a cell of an element with its middle at `at`, as one undo step: with the look, the size and the label of one of
   * its cells, one on this page if there is one; a shape that is no element yet becomes one with it. Selects it.
   */
  placeElement(source: ElementSource, at: Point): void
  /**
   * Sets a field of the model of the element of the shape `cellId` (see `boardModel.ts`): the element it is a part of,
   * or the environment of a node of deployment; an empty value removes it. A shape that is no element yet becomes one.
   * One undo step; a locked shape and an editor only for reading change nothing.
   */
  setModelField(cellId: string, field: ModelField, value: string): void
  /** Sets the rule of the view the page is (see `modelViews.ts`), as one undo step of the page. */
  setViewRule(rule: ViewRule): void
  /** Shows again what was hidden on the view the page is: the keys `keys`, or all; one undo step. */
  showOnView(keys: readonly string[] | 'all'): void
  /** Makes the view a page of its own: its rule goes, its cells stay cells of their elements; one undo step. */
  detachView(): void
  /** The element of the single selected shape that may be one, and the pages with its cells; `null` without one. */
  selectedElement(): SelectionElement | null
  /** The elements of the selected shapes that may be merged into one, each once, in the order of the selection. */
  mergeCandidates(): MergeCandidate[]
  /**
   * Makes the selected shapes that may be elements, and all the cells of their elements on all pages, cells of one
   * element with the properties of the element of the cell `keepCellId`, as one undo step; their labels follow.
   */
  mergeElements(keepCellId: string): void
  /**
   * Makes the shapes `refs` of any pages that may be elements, and all the cells of their elements on all pages, cells of
   * one element with the properties of the element of `keep`, as one undo step of this page: e.g. probable duplicates
   * that the checks found. Locked shapes stay out. Returns whether they were merged.
   */
  mergeElementCells(refs: readonly CellRef[], keep: CellRef): boolean
  /**
   * What «Детализировать» does for the shape `cellId` (see `detail.ts`): opens its page of detail, makes one — for who
   * edits the board, when the shape is not locked — or nothing.
   */
  detailOffer(cellId: string): 'open' | 'create' | null
  /**
   * The page of detail of the shape `cellId`: the one it has, or a new one with the link of the shape to it, made as one
   * undo step of this page. Returns the id of the page; `null` when the shape gets none.
   */
  detailElement(cellId: string): string | null
  /** Makes the shape `cellId` an element of its own with the same properties, as one undo step. */
  detachElement(cellId: string): void
  /**
   * Removes the cells of the element of the shape `cellId` from all pages, with their edges and what they hold, as one
   * undo step of this page; locked cells stay.
   */
  deleteElementEverywhere(cellId: string): void
  /**
   * The links of the elements of the page that CoDraw opens, in the order of the tree; the same array until the page
   * changes.
   */
  getLinks(): readonly CellLink[]
  /**
   * Reports a click with Ctrl, or Cmd on macOS, on an element with a link, or on a field, a shape or a label inside a
   * table, a group or an edge with one: the link to follow. Such a click selects, moves and edits nothing.
   */
  onLinkOpen(listener: (link: CellLink) => void): () => void
  /** Converts a client (viewport) position to diagram coordinates. */
  toDiagramPoint(clientX: number, clientY: number): Point
  /** Converts diagram coordinates to a position relative to the visible top-left corner of the canvas. */
  toCanvasPoint(point: Point): Point
  /**
   * Bounds of a cell relative to the visible top-left corner of the canvas, or `null` if it is not shown; of a turned
   * shape, the box around it as it is drawn.
   */
  cellBounds(id: string): Box | null
  /** Points of the line of an edge as drawn, relative to the visible top-left corner of the canvas; `null` if not shown. */
  edgePoints(id: string): Point[] | null
  /** Size of the visible area of the canvas, without scrollbars. */
  viewportSize(): { width: number; height: number }
  /** The visible area of the canvas, without scrollbars, in diagram coordinates. */
  visibleArea(): Box
  /**
   * The page as the canvas draws it, simplified for a picture of the whole page (see {@link PageSketch}); the same
   * object until cells change or edges get new routes.
   */
  pageSketch(): PageSketch
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
  /**
   * Turns the pencil on or off. While it is on, dragging with the main button, a pen or a finger selects, moves,
   * connects and edits nothing and draws a line by hand: on release it becomes an edge without ends through the
   * simplified path (see {@link strokePoints}), on top of the page, as one undo step; the pencil stays on for the next
   * one. The right button and the wheel work as before. The pencil, the laser pointer and the comment tool take the
   * main button in turns. A participant who may only view has no pencil.
   */
  setPencil(on: boolean): void
  /**
   * Sets the color (not `none`), the width (from 1 to 20) or the dash of the line that the pencil draws with. Choosing
   * the color of lines or their width or dash for the selection ({@link setColor}, {@link setLineStyle}) sets them too.
   */
  setPencilLine(changes: Partial<PencilLine>): void
  /** The ids of the selected cells, in the order of the selection. */
  selectedCellIds(): string[]
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

/** The handle that turns a selected shape: a round arrow on a white circle, in the color of the selection. */
const ROTATION_ICON = new ImageBox(
  'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7.25" fill="#fff" stroke="#2563eb" stroke-width="1.5"/><g transform="translate(3.5 3.5) scale(0.375)" fill="none" stroke="#2563eb" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></g></svg>',
    ),
  16,
  16,
)

/** How far the handle that turns a shape is out of its top-left corner, along both sides. */
const ROTATION_HANDLE_OFFSET = 12

/** The step of the angle that dragging the handle turns a shape by, as in draw.io; with Alt held, a whole degree. */
const ROTATION_STEP = 15

/** The pointer over the handle that turns a shape: CSS has no pointer for turning. */
const ROTATION_CURSOR = 'grab'

/** The longest name of a layer. */
const LAYER_NAME_LIMIT = 100

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
 * A key the canvas responds to, in the notation of shortcuts: `Mod` is Ctrl, or Cmd on macOS; then `Alt` (with `Mod`
 * and a letter only) or `Shift`; then a letter, `Delete`, `Backspace`, `F2` or an arrow. `collaboration` keys turn on a
 * tool of working on a board with others, which a canvas without them does not bind (see
 * {@link DiagramEditorOptions.collaboration}).
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
  // The pencil changes the page: a draft of a proposal has it, a participant who may only view does not.
  { keys: 'P', editing: true, run: (editor) => editor.setPencil(!editor.getState().pencil) },
  { keys: 'Delete', editing: true, run: (editor) => editor.deleteSelection() },
  { keys: 'Backspace', editing: true, run: (editor) => editor.deleteSelection() },
  { keys: 'Mod+Z', editing: true, run: (editor) => editor.undo() },
  { keys: 'Mod+Shift+Z', editing: true, run: (editor) => editor.redo() },
  { keys: 'Mod+Y', editing: true, run: (editor) => editor.redo() },
  { keys: 'Mod+D', editing: true, run: (editor) => editor.duplicate() },
  // As «Копировать», copying a look changes nothing: a participant who may only view pastes it on a board of their own.
  { keys: 'Mod+Alt+C', editing: false, run: (editor) => editor.copyStyle() },
  { keys: 'Mod+Alt+V', editing: true, run: (editor) => editor.pasteStyle() },
  { keys: 'Mod+Shift+V', editing: true, run: (editor) => editor.pasteAsSameElement() },
  { keys: 'F2', editing: true, run: (editor) => editor.editLabel() },
  { keys: 'N', editing: true, run: (editor) => editor.addSticky() },
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

/**
 * Binds a key of {@link KEY_BINDINGS} in the key handler of maxGraph to the editor that `editor` returns; a key with
 * Alt goes to `modAltKeys` by its letter in lower case (see {@link bindModAltKeys}).
 */
function bindKey(
  keyHandler: KeyHandler,
  { keys, run }: KeyBinding,
  editor: () => DiagramEditor,
  modAltKeys: Map<string, () => void>,
) {
  const parts = keys.split('+')
  const key = parts.at(-1)!
  const code = KEY_CODES[key] ?? key.charCodeAt(0)
  const action = () => run(editor())
  const mod = parts.includes('Mod')
  const shift = parts.includes('Shift')
  if (parts.includes('Alt')) modAltKeys.set(key.toLowerCase(), action)
  else if (mod && shift) keyHandler.bindControlShiftKey(code, action)
  else if (mod) keyHandler.bindControlKey(code, action)
  else if (shift) keyHandler.bindShiftKey(code, action)
  else keyHandler.bindKey(code, action)
}

/**
 * The key handler of maxGraph reads no keys with Alt; with `Mod` and without Shift, it finds them in `modAltKeys` by the
 * Latin letter of the key, so that they work in any layout and with Option on macOS, where the key types `ç` for C.
 * The handler consumes the key, so the browser neither copies or pastes nor does a shortcut of its own.
 */
function bindModAltKeys(keyHandler: KeyHandler, modAltKeys: Map<string, () => void>) {
  const getFunction = keyHandler.getFunction.bind(keyHandler)
  keyHandler.getFunction = (event) => {
    if (!event.altKey) return getFunction(event)
    if (!keyHandler.isControlDown(event) || event.shiftKey) return null
    return modAltKeys.get(latinLetter(event) ?? '') ?? null
  }
}

/** A tool of the canvas that takes the main button from maxGraph: the laser pointer, the comment tool or the pencil. */
type CanvasTool = 'laser' | 'comment' | 'pencil'

/** Classes of the canvas while a tool is on: its pointer is a crosshair over everything. */
const TOOL_CLASSES: Record<CanvasTool, string> = {
  laser: 'laser-pointer',
  comment: 'comment-tool',
  pencil: 'pencil-tool',
}

/** Events of the canvas that a tool keeps from maxGraph, besides the press that the tool takes. */
const TOOL_STOPPED_EVENTS = ['pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'dblclick'] as const

/**
 * Events of the canvas that a click following a link keeps from maxGraph besides its press and release: those of the main
 * button, and moves until the button is released.
 */
const LINK_STOPPED_EVENTS = ['pointermove', 'mousedown', 'mousemove', 'mouseup', 'dblclick'] as const

/** Ctrl, or Cmd on macOS: `Mod` of the shortcuts, with a key or with the mouse. */
const isModDown = (event: KeyboardEvent | MouseEvent) => event.ctrlKey || (Client.IS_MAC && event.metaKey)

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
  /**
   * Where the images of the page are stored. Without it images cannot be added, and pasted cells keep the addresses of
   * their pictures.
   */
  images?: ImageHost | null
  /** The theme of the canvas at first; see {@link DiagramEditor.setTheme}. Light by default, as images of pages are. */
  theme?: CanvasTheme
  /**
   * What the participant chose about the layers of the page for themselves: the layers they show or hide and the layer
   * new elements go into. Without it, a layer shows unless it is hidden for everybody, and the choices last as long as
   * the editor, e.g. for the live image of the board.
   */
  layerView?: PageLayerView | null
}

/** Commands of the editor that change the page; a read-only editor ignores them. */
const CHANGING_COMMANDS = [
  'addShape',
  'addSticky',
  'setStickyColor',
  'setTextFit',
  'addTableField',
  'setFieldProps',
  'addTableIndex',
  'setIndexProps',
  'setTableVendor',
  'addSequenceParticipant',
  'addSequenceMessage',
  'addSequenceNote',
  'addSequenceFrame',
  'addSequenceBranch',
  'setSequenceParticipant',
  'setSequenceMessage',
  'setSequenceNote',
  'setSequenceFrame',
  'setSequenceNumbering',
  'addConnectedShape',
  'cut',
  'paste',
  'addImages',
  'duplicate',
  'pasteStyle',
  'insertComponent',
  'applyComponentStyle',
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
  'setEdgeRelation',
  'setColor',
  'setFillOpacity',
  'setShapeEffects',
  'setFontSize',
  'setFontFamily',
  'stepFontSize',
  'toggleFontStyle',
  'setTextAlign',
  'setList',
  'setLineStyle',
  'setAutoWidth',
  'setTextWrap',
  'setBaseTable',
  'setDefaultBase',
  'setTableBase',
  'setViewTable',
  'setViewMaterialized',
  'setViewQuery',
  'setGeometry',
  'setRotation',
  'setPencil',
  'setLink',
  'setEdgeApi',
  'setElementProperties',
  'setEdgeProperties',
  'setLegendItem',
  'addLayer',
  'renameLayer',
  'moveLayer',
  'setLayerLocked',
  'setLayerHidden',
  'moveSelectionToLayer',
  'deleteLayer',
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
    images = null,
    theme: initialTheme = 'light',
    layerView = null,
  }: DiagramEditorOptions = {},
): DiagramEditor {
  const model = new GraphDataModel()
  const cells = getCells(document, pageId)
  // The origin of what this editor writes, which the history of the page tracks.
  const origin = localOrigin(pageId)
  const undoManager = sharedUndoManager ?? createUndoManager(cells, origin)

  const graph = new Graph(container, model, [...getDefaultPlugins(), RubberBandHandler])
  // After the graph: the first graph registers the default shapes of maxGraph, including its own `rectangle`.
  registerDiagramExtensions()
  registerTableShapes()
  registerSequenceShapes()
  registerLegendShapes()
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
  configureElementLabels(graph)
  configureLists(graph)
  configureTextWrap(graph)
  const unconfigureSequences = configureSequences(graph)
  const unconfigureLegends = configureLegends(graph)
  const iconBadges = configureIconBadges(graph)
  // The view of the plan and the filter both hide cells: a cell is drawn while neither hides it.
  const visibility = cellVisibility()
  // The view of the plan of this participant; it tells the state of the editor once there is one.
  let planChanged = () => {}
  const planView = configurePlan(graph, () => planChanged(), visibility)
  let theme = initialTheme
  // After the other hooks of styles, so that it sees the style a cell is drawn with.
  // Before the theme, so that the theme sees the colors of the analysis and the pale style of what does not match.
  let impactChanged = () => {}
  const impactView = configureImpact(graph, () => impactChanged())
  let filterChanged = () => {}
  const filterView = configureFilter(graph, () => filterChanged(), visibility)
  configureCanvasTheme(graph, () => theme)
  const unwatchTableRows = watchTableRows(graph)
  configureConnections(graph)
  configureFreehand(graph)
  const unwatchLocks = configureLocks(graph)
  configureSelection(graph)
  // The label of an edge that the view computed follows the model: it is changed where its relations are drawn.
  const isCellEditable = graph.isCellEditable.bind(graph)
  graph.isCellEditable = (cell) => isCellEditable(cell) && !isComputedEdge(cell)

  // Layers. What the participant chose about them for themselves, or without a view of the board, for the editor only.
  const view = layerView ?? new LayerViews().page(pageId)
  const isLayer = (cell: Cell | null | undefined) => isLayerCell(model, cell)
  /** The layers of the page, the bottom one first. */
  const layers = (): Cell[] => [...(model.getRoot()?.getChildren() ?? [])]
  /** The elements of the page itself, those of every layer, in drawing order. */
  const pageChildren = (): Cell[] => layers().flatMap((layer) => layer.getChildren())
  const isLockedLayer = (layer: Cell) => isLockedStyle(layer.getStyle())
  /** A layer shown on this canvas and not locked: its elements are selected and changed. */
  const isOpenLayer = (layer: Cell) => layer.isVisible() && !isLockedLayer(layer)
  /** The elements of the layers that are shown on this canvas and not locked. */
  const openChildren = (): Cell[] => layers().filter(isOpenLayer).flatMap((layer) => layer.getChildren())
  /** The layer `id` of the page, or `null`. */
  const layerCell = (id: string): Cell | null => {
    const cell = model.getCell(id)
    return cell && isLayer(cell) ? cell : null
  }
  /** The layer new elements go into; see {@link DiagramEditor.setActiveLayer}. */
  const insertLayer = (): Cell => {
    const active = view.active()
    const chosen = active === null ? null : layerCell(active)
    const main = layerCell(LAYER_CELL_ID) ?? layers()[0]!
    return [chosen, main, ...layers().reverse()].find((layer) => layer && isOpenLayer(layer)) ?? chosen ?? main
  }
  // maxGraph adds what has no parent of its own, e.g. a new edge, to the default parent.
  graph.getDefaultParent = insertLayer
  /** The cell shows on this canvas as far as layers go: its layer shows, and for an edge the layers of its ends. */
  const isShown = (cell: Cell): boolean => {
    const shows = (end: Cell | null) => !end || (layerOf(model, end)?.isVisible() ?? true)
    return shows(cell) && (!cell.isEdge() || (shows(cell.getTerminal(true)) && shows(cell.getTerminal(false))))
  }
  /** The cell lies in a locked layer. */
  const inLockedLayer = (cell: Cell) => {
    const layer = layerOf(model, cell)
    return layer !== null && isLockedLayer(layer)
  }
  // Layers are never selected, nor the elements of layers hidden on this canvas or locked.
  const isCellSelectable = graph.isCellSelectable.bind(graph)
  graph.isCellSelectable = (cell) => isCellSelectable(cell) && !isLayer(cell) && isShown(cell) && !inLockedLayer(cell)
  // A press, a frame and panning take an element of a locked layer for the empty canvas.
  const getEventState = graph.getEventState.bind(graph)
  graph.getEventState = (state) => (inLockedLayer(state.cell) ? (null as unknown as CellState) : getEventState(state))
  configureRegionSelection(graph, openChildren)
  const selectionHandler = graph.getPlugin<SelectionHandler>('SelectionHandler')
  if (selectionHandler) {
    // Dragged shapes line up with the shapes of every layer shown.
    selectionHandler.getGuideStates = () =>
      graph.getView().getCellStates(
        layers()
          .filter((layer) => layer.isVisible())
          .flatMap((layer) =>
            layer.filterDescendants((cell) => {
              const geometry = cell.getGeometry()
              return cell.isVertex() && !!graph.getView().getState(cell) && !!geometry && !geometry.relative
            }),
          ),
      )
    // A shape dragged out of its group stays in the layer of the group, not in the layer of new elements.
    const moveCells = selectionHandler.moveCells.bind(selectionHandler)
    selectionHandler.moveCells = (cells, dx, dy, clone, target, event) => {
      const parent = selectionHandler.cell?.getParent()
      const leaves =
        !target &&
        parent &&
        !isLayer(parent) &&
        selectionHandler.isRemoveCellsFromParent() &&
        selectionHandler.shouldRemoveCellsFromParent(parent, cells, event)
      moveCells(cells, dx, dy, clone, leaves ? layerOf(model, parent) : target, event)
    }
  }
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
  const gridTableLayout = new GridTableLayout(graph)
  const sequenceLayout = new SequenceDiagramLayout(graph)
  const legendLayout = new LegendGraphLayout(graph)
  layoutManager.getLayout = (cell) =>
    isTable(cell)
      ? tableLayout
      : isGridTable(cell)
        ? gridTableLayout
        : isSequence(cell)
          ? sequenceLayout
          : isLegend(cell)
            ? legendLayout
            : null
  // The text of a part of a sequence diagram sets its room, and so the layout of the diagram. A layer that comes, goes,
  // moves or changes its name, lock or visibility lays nothing out.
  const getCellsForChange = layoutManager.getCellsForChange.bind(layoutManager)
  layoutManager.getCellsForChange = (change) => {
    const { cell, child } = change as { cell?: Cell; child?: Cell }
    if (isLayer(cell ?? child)) return []
    return change instanceof ValueChange && sequenceOf(change.cell)
      ? layoutManager.addCellsWithLayout(change.cell)
      : getCellsForChange(change)
  }
  // A legend lists what the page has: any cell that comes, goes or changes its look may change its items. Last, so that
  // it lists the page as the other layouts left it.
  const getCellsForChanges = layoutManager.getCellsForChanges.bind(layoutManager)
  layoutManager.getCellsForChanges = (changes) => [...getCellsForChanges(changes), ...legendsForChanges(graph, changes)]
  // Bound only now, so that the stored cells are laid out like any later change of other participants.
  const author = participantId && participantName ? { id: participantId, name: participantName } : null
  // A draft of a proposal, without others, would take putting labels right for a change of its author. A layer shows as
  // the participant chose for themselves, or as for everybody.
  const binding = new DiagramBinding(model, cells, origin, readOnly, author, collaboration, (id, hidden) => view.visibility(id) ?? !hidden)
  // A layer shown or hidden here, by the participant or by another one for everybody, redraws the edges of other layers
  // that end at its elements too, which maxGraph leaves as they were; a layer hidden or locked takes its elements out of
  // the selection.
  const handleLayerChanges = (_sender: unknown, event: EventObject) => {
    const changes = event.getProperty('changes') as unknown[]
    const layerChange = (change: unknown) =>
      (change instanceof VisibleChange || change instanceof StyleChange) && isLayer(change.cell)
    if (!changes.some(layerChange)) return
    if (changes.some((change) => change instanceof VisibleChange && isLayer(change.cell))) {
      const graphView = graph.getView()
      graphView.invalidate(model.getRoot()!, true, true)
      graphView.validate()
    }
    const unselectable = graph.getSelectionCells().filter((cell) => !graph.isCellSelectable(cell))
    if (unselectable.length > 0) graph.removeSelectionCells(unselectable)
  }
  model.addListener(InternalEvent.CHANGE, handleLayerChanges)
  // New routes redraw edges without a change of the model: the picture on the screen moved all the same.
  const stopEdgeRouting = startEdgeRouting(graph, undefined, () => {
    if (destroyed) return
    drawingVersion++
    notifyView()
  })
  const cellEditor = graph.getPlugin<CellEditorHandler>('CellEditorHandler')
  // Commit a label when its editor loses focus, e.g. when the user clicks the palette or the toolbar.
  if (cellEditor) cellEditor.blurEnabled = true
  if (cellEditor) {
    const resize = cellEditor.resize.bind(cellEditor)
    cellEditor.resize = () => {
      resize()
      const cell = cellEditor.getEditingCell()
      const shape = (cell?.getStyle() as ShapeStyle | undefined)?.codrawShape
      if (cellEditor.textarea && (shape === 'list' || shape === 'numbered-list' || listKind(cellEditor.textarea.textContent ?? ''))) {
        cellEditor.textarea.style.whiteSpace = 'pre-wrap'
      }
    }
  }
  /** The message whose text Enter applied: the next message follows it once the editing stops. */
  let nextMessageAfter: Cell | null = null
  // The name of a table, a field and an index are a line each: Enter applies them, as Escape cancels them. So are the
  // title of a sequence diagram and its parts but notes, and Enter in a message adds the next one; Shift+Enter breaks
  // the line.
  if (cellEditor) {
    const isStopEditingEvent = cellEditor.isStopEditingEvent.bind(cellEditor)
    cellEditor.isStopEditingEvent = (event) => {
      const cell = cellEditor.getEditingCell()
      if (cellEditor.textarea && !isTable(cell) && !isColumnField(cell) && !isIndexRow(cell) && !isSequencePart(cell) && handleListEnter(event, cellEditor.textarea)) return false
      const part = partOf(cell)
      const line =
        isTable(cell) || isColumnField(cell) || isIndexRow(cell) || isSequence(cell) || isLegend(cell) || (part !== null && part !== 'note')
      const enter = event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.isComposing
      const stop = isStopEditingEvent(event) || (line && enter)
      if (stop && enter && part === 'message') nextMessageAfter = cell
      return stop
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
    if (isGridTable(cell.getParent()) && textarea) {
      namedField = cell
      textarea.style.minWidth = `${Math.max(20, (cell.getGeometry()?.width ?? 80) - 12)}px`
      return
    }
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
  /**
   * A cell that a command added and whose text is being edited — a sticky of {@link DiagramEditor.addSticky}, a part of
   * a sequence diagram — with the undo step that added it; a new message left without text goes away with that step,
   * and what was selected before it is selected again.
   */
  let newCell: { cell: Cell; step: unknown; removeEmpty: boolean; selected: Cell[] } | null = null
  if (cellEditor) {
    const startEditing = cellEditor.startEditing.bind(cellEditor)
    cellEditor.startEditing = (cell: Cell, trigger?: MouseEvent | null) => {
      if (!graph.isCellEditable(cell)) return
      if (isGridTable(cell) && graph.isCellEditable(cell)) {
        populateGridTable(graph, cell)
        const state = graph.getView().getState(cell)
        const bounds = container.getBoundingClientRect()
        const style = cell.getStyle() as Record<string, unknown>
        const rows = Number(style.gridRows) || 4
        const columns = Number(style.gridColumns) || 3
        const column = trigger && state ? Math.max(0, Math.min(columns - 1, Math.floor((trigger.clientX - bounds.left + container.scrollLeft - state.x) / state.width * columns))) : 0
        const row = trigger && state ? Math.max(0, Math.min(rows - 1, Math.floor((trigger.clientY - bounds.top + container.scrollTop - state.y) / state.height * rows))) : 0
        cell = cell.getChildAt(row * columns + column) ?? cell
      }
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
      // The text applied to a new cell goes into the undo step that added it while that step is the last one, as
      // changes within the capture timeout of the undo manager do: one step takes the cell away with its text.
      const added = newCell
      newCell = null
      const next = nextMessageAfter
      nextMessageAfter = null
      const editingCell = cellEditor.getEditingCell()
      const lastStep = () => added !== null && editingCell === added.cell && undoManager.undoStack.at(-1) === added.step
      const joining = !cancel && lastStep()
      const captureTimeout = undoManager.captureTimeout
      if (joining) undoManager.captureTimeout = Number.POSITIVE_INFINITY
      try {
        stopEditing(cancel)
      } finally {
        undoManager.captureTimeout = captureTimeout
      }
      if (field) redrawField(field)
      setEditing(null)
      // A new message left without text goes away with the step that added it, which leaves nothing to redo either.
      if (added?.removeEmpty && lastStep() && !String(added.cell.getValue() ?? '').trim()) {
        undoManager.undo()
        undoManager.clear(false, true)
        graph.setSelectionCells(added.selected.filter((cell) => model.getCell(cell.getId() ?? '') === cell))
        return
      }
      if (!cancel && next && next === editingCell && model.getCell(next.getId() ?? '') === next) addMessageAfter(next)
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
  /**
   * The selected shapes that are not locked and are elements, or stand for something: a service, a database, a
   * container, not a rectangle.
   */
  const mergeableCells = (): Cell[] =>
    graph.getSelectionCells().filter((cell) => {
      if (propertiesTarget(cell) !== 'shape' || !isUnlocked(cell)) return false
      const style = cell.getStyle() as Record<string, unknown>
      return elementIdOf(style) !== null || elementProperties(style, String(cell.getValue() ?? '')).kind !== null
    })
  /** The selected shapes by their elements, each element once; a shape that is no element yet is one of its own. */
  const selectedElements = (): Cell[] => {
    const seen = new Set<string>()
    return mergeableCells().filter((cell) => {
      const key = elementIdOf(cell.getStyle() as Record<string, unknown>) ?? `cell:${cell.getId()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  /** What locking a cell locks: a field or an index with its table, a part of a sequence diagram with it, any other cell itself. */
  const lockTarget = (cell: Cell) => (isTable(cell.getParent()) || isSequencePart(cell) ? cell.getParent()! : cell)
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
    const inView = isViewTable(field.getParent())
    return { cellId: field.getId()!, tableId: field.getParent()!.getId()!, type, notNull, primaryKey, unique, inheritedFrom, inView }
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
  const selectedTableView = (): TableView | null => {
    const table = selectedTable()
    if (!table) return null
    const style = table.getStyle() as Record<string, unknown>
    return { view: isViewTable(table), materialized: isMaterializedStyle(style), query: viewQueryOf(style) }
  }
  /**
   * The single selected shape with a group; a table field is part of its table, not a shape of its own, and a locked
   * shape gets no new edges.
   */
  const quickConnectSource = (): { cell: Cell; group: ShapeGroup } | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    if (!cell?.isVertex() || isTable(cell.getParent()) || isSequencePart(cell) || lockHolder(cell)) return null
    const group = shapeGroupOf(cell.getStyle() as ShapeStyle)
    return group ? { cell, group } : null
  }
  const quickConnect = (): QuickConnectSource | null => {
    const source = quickConnectSource()
    return source ? { cellId: source.cell.getId()!, shapes: groupShapes(source.group).map((shape) => shape.id) } : null
  }
  // The own style of an edge: the merged one drops `none`, so it cannot tell an end without a marker from the default.
  const sameMarker = (edges: Cell[], end: EdgeEnd) => same(edges.map((edge) => markerOf(edge.getStyle(), end)))
  const labelOf = (cell: Cell) => String(cell.getValue() ?? '')
  const isUseCaseShape = (cell: Cell | null) => !!cell && shapeGroupOf(cell.getStyle() as ShapeStyle) === 'usecase'
  /** The selected edges that connect shapes; lines drawn by hand are no relations. */
  const selectedConnectors = () => selectedEdges().filter(isConnector)
  const selectionRelation = (): SelectionRelation | null => {
    const edges = selectedConnectors()
    const fits = edges.some(
      (edge) =>
        isUseCaseShape(edge.getTerminal(true)) ||
        isUseCaseShape(edge.getTerminal(false)) ||
        isUseCaseRelation(edge.getStyle(), labelOf(edge)),
    )
    return fits ? { value: same(edges.map((edge) => relationOf(edge.getStyle(), labelOf(edge)))) } : null
  }
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
      fillOpacity: shapes.length > 0 ? same(shapes.map(fillOpacityOf)) : null,
      gradient: shapes.length > 0 ? same(shapes.map(gradientOf)) : null,
      gradientDirection: shapes.length > 0 ? same(shapes.map(gradientDirectionOf)) : null,
      hasShapes: shapes.length > 0,
    }
  }

  /**
   * Selected cells and the fields of selected tables and the parts of selected sequence diagrams: the text of a table is
   * its name and its fields.
   */
  const textCells = (): Cell[] => {
    const cells = new Set<Cell>()
    for (const cell of graph.getSelectionCells()) {
      cells.add(cell)
      if (isTable(cell) || isSequence(cell)) cell.getChildren().forEach((field) => cells.add(field))
    }
    return [...cells]
  }
  const fontSizeOf = (cell: Cell) => Number(graph.getCellStyle(cell).fontSize ?? StyleDefaultsConfig.fontSize)
  // The parts of a sequence diagram set its size, the items of a legend its.
  const allowsAutoWidthCell = (cell: Cell) =>
    isFreeShape(cell) && !isSequence(cell) && !isLegend(cell) && allowsAutoWidth(graph.getCellStyle(cell) as ShapeStyle)
  const autoWidthCells = () => graph.getSelectionCells().filter(allowsAutoWidthCell)
  const textWrapCells = () => graph.getSelectionCells().filter((cell) => allowsTextWrap(graph, cell))
  const geometryCells = () => graph.getSelectionCells().filter(isFreeShape)
  const rotationCells = () => graph.getSelectionCells().filter(isRotatableShape)
  const selectedStickies = () => graph.getSelectionCells().filter(isSticky)
  /** The cell of the page that a cell belongs to: a field to its table, a shape of a group to the group. */
  const pageCell = (cell: Cell): Cell | null => {
    let current: Cell | null = cell
    while (current && !isLayer(current.getParent())) current = current.getParent()
    return current
  }
  /** Shapes, tables and groups of the page that the selection has. */
  const selectedLayoutCells = (): Cell[] => [
    ...new Set(graph.getSelectionCells().flatMap((cell) => (cell.isVertex() ? (pageCell(cell) ?? []) : []))),
  ]
  /** All edges of the page, those inside groups too, of every layer. */
  const pageEdges = (parent?: Cell): Cell[] =>
    (parent ? parent.getChildren() : pageChildren()).flatMap((child) => (child.isEdge() ? [child] : pageEdges(child)))
  let layingOut = false
  /** Selected cells that can become a group: those of the parent of the first one, fields of tables and parts aside. */
  const groupableCells = (): Cell[] => {
    const cells = graph.getSelectionCells().filter((cell) => !isTable(cell.getParent()) && !isSequencePart(cell))
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
  /** The link of the single selected element that may have one; see {@link SelectionLink}. */
  const selectionLink = (): SelectionLink | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    if (!cell || !isLinkable(cell)) return null
    return { cellId: cell.getId()!, link: linkOf(cell.getStyle()), canChange: !readOnly && isUnlocked(cell) }
  }
  /** The filter of the page while it chooses something; see {@link EditorState.filter}. */
  const filterState = (): EditorState['filter'] => {
    const counts = filterView.counts()
    const filter = filterView.filter()
    return counts && filter ? { ...counts, hide: filter.hide } : null
  }
  /** The edge is one that the view of the page computed: it shows relations of the model, and follows them. */
  const isComputedEdge = (cell: Cell) => {
    const key = (cell.getStyle() as Record<string, unknown>)[COMPUTED_KEY]
    return cell.isEdge() && typeof key === 'string' && key !== '' && isViewPage(document, pageId)
  }
  /** The relations of the model a computed edge of the view shows; `null` for an edge drawn on the page. */
  const viewRelations = (cell: Cell): ViewRelation[] | null => {
    if (!isComputedEdge(cell)) return null
    const view = viewOf(document, pageId)
    const key = (cell.getStyle() as Record<string, unknown>)[COMPUTED_KEY]
    if (!view) return []
    const boardModel = buildModel(document)
    const edge = viewContents(boardModel, view.rule, new Set(view.hidden)).edges.find((candidate) => candidate.key === key)
    const pageNames = new Map(listPages(document).map((page) => [page.id, page.name]))
    const nameOf = (id: string) => boardModel.elements.get(id)?.properties.name ?? ''
    return (edge?.relations ?? []).map((relation) => ({
      pageId: relation.edge.pageId,
      pageName: pageNames.get(relation.edge.pageId) ?? '',
      cellId: relation.edge.cellId,
      source: nameOf(relation.source),
      target: nameOf(relation.target),
      label: relation.label,
      technology: relation.technology,
    }))
  }
  /** The properties of the single selected shape or edge that has them; see {@link SelectionProperties}. */
  const selectionProperties = (): SelectionProperties | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    if (cell && isLegend(cell)) {
      const settings = legendSettings(cell.getStyle() as Record<string, unknown>)
      const hidden = new Set(settings.hidden)
      const items = graphLegendItems(graph).map((item) => ({
        key: item.key,
        type: item.type,
        defaultName: item.name,
        name: settings.names[item.key] ?? '',
        hidden: hidden.has(item.key),
      }))
      return { target: 'legend', cellId: cell.getId()!, items, canChange: !readOnly && isUnlocked(cell) }
    }
    const target = cell && propertiesTarget(cell)
    if (!cell || !target) return null
    const cellId = cell.getId()!
    const canChange = !readOnly && isUnlocked(cell)
    const style = cell.getStyle() as Record<string, unknown>
    if (target === 'edge') {
      const relations = viewRelations(cell)
      return { target, cellId, properties: edgeProperties(style), relations, canChange: canChange && relations === null }
    }
    const value = String(cell.getValue() ?? '')
    const properties = elementProperties(style, value)
    return {
      target,
      cellId,
      properties,
      defaultKind: defaultKind(style, value),
      format: labelFormat(style, properties.kind),
      showTechnology: showsTechnology(style, value),
      element: hasElement(style),
      icon: typeof style[ICON_KEY] === 'string' && style[ICON_KEY] !== '' ? (style[ICON_KEY] as string) : null,
      canChange,
    }
  }
  /** The sequence diagram that every selected cell is, or is a part of. */
  const selectedSequence = (): Cell | null => {
    const cells = graph.getSelectionCells()
    const diagram = cells.length > 0 ? sequenceOf(cells[0]) : null
    return diagram && cells.every((cell) => sequenceOf(cell) === diagram) ? diagram : null
  }
  /** The single selected part of a sequence diagram. */
  const selectedPart = (): Cell | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    return isSequencePart(cell) ? cell : null
  }
  /** Selected rows of sequence diagrams: their parts but participants. */
  const selectedRows = () =>
    graph.getSelectionCells().filter((cell) => {
      const part = partOf(cell)
      return part !== null && part !== 'participant'
    })
  /** What the panel shows of a part of `diagram`; see {@link SequencePartState}. */
  const partState = (cell: Cell, diagram: SequenceDiagram): SequencePartState | null => {
    const id = cell.getId() ?? ''
    const participant = diagram.participants.find((candidate) => candidate.id === id)
    if (participant) return { type: 'participant', cellId: id, kind: participant.kind }
    const step = diagram.steps.find((candidate) => candidate.id === id)
    switch (step?.type) {
      case 'message':
        return {
          type: 'message',
          cellId: id,
          from: step.from,
          to: step.to,
          arrow: step.arrow,
          activates: step.activate.includes(step.to),
          deactivates: step.deactivate.includes(step.from),
        }
      case 'note':
        return { type: 'note', cellId: id, placement: step.placement, from: step.from, to: step.to }
      case 'frame':
        return { type: 'frame', cellId: id, kind: step.kind, frameId: id }
      case 'else': {
        const frame = frameOwners(diagram).get(id)
        return frame ? { type: 'branch', cellId: id, kind: frame.kind, frameId: frame.id } : null
      }
      default:
        return null
    }
  }
  /** The sequence diagram of the selection; see {@link SelectedSequence}. */
  const selectionSequence = (): SelectedSequence | null => {
    const cell = selectedSequence()
    if (!cell) return null
    const diagram = graphSequence(cell)
    const part = selectedPart()
    return {
      diagramId: cell.getId()!,
      numbered: diagram.numbered,
      participants: diagram.participants.map(({ key, name }) => ({ key, name })),
      part: part ? partState(part, diagram) : null,
      rows: selectedRows().length,
      canChange: !readOnly && isUnlocked(cell),
    }
  }
  /** The description of the call of the single selected edge; see {@link SelectionEdgeApi}. */
  const selectionEdgeApi = (): SelectionEdgeApi | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    if (!cell?.isEdge()) return null
    return { cellId: cell.getId()!, api: edgeApiOf(cell.getStyle()), canChange: !readOnly && isUnlocked(cell) }
  }
  /**
   * The elements whose status {@link DiagramEditor.setStatus} sets: the selected shapes, tables and groups and the tables
   * of selected fields and indexes, each once; not edges and labels of edges.
   */
  const statusTargets = (): Cell[] => [
    ...new Set(
      graph.getSelectionCells().flatMap((cell) => {
        const target = lockTarget(cell)
        return target.isVertex() && !target.getParent()?.isEdge() ? [target] : []
      }),
    ),
  ]
  const selectionStatus = (): SelectionStatus | null =>
    commonStatus(statusTargets().map((cell) => readStatus(cells.get(cell.getId() ?? ''))?.status ?? null))
  /**
   * The elements whose mark of plan {@link DiagramEditor.setPlan} sets: the selected shapes, tables, groups and edges and
   * the tables of selected fields and indexes, each once; not labels of edges.
   */
  const planTargets = (): Cell[] => [
    ...new Set(
      graph.getSelectionCells().flatMap((cell) => {
        const target = lockTarget(cell)
        return target.isEdge() || (target.isVertex() && !target.getParent()?.isEdge()) ? [target] : []
      }),
    ),
  ]
  const selectionPlan = (): SelectionPlan | null =>
    commonPlan(planTargets().map((cell) => planOf(cell.getStyle() as Record<string, unknown>)))
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
      list: same(cells.map((cell) => listKind(String(cell.getValue() ?? '')))),
    }
  }
  const selectionLine = (): SelectionLine | null => {
    const cells = graph.getSelectionCells()
    if (cells.length === 0) return null
    const edges = cells.filter(isConnector)
    return {
      width: same(cells.map(lineWidthOf)),
      dash: same(cells.map(lineDashOf)),
      edgeShape: edges.length > 0 ? same(edges.map(edgeShapeOf)) : null,
      hasEdges: edges.length > 0,
      shapes: selectionShapeEffects(cells.filter((cell) => cell.isVertex())),
    }
  }
  /** Shapes whose form rounds its corners with `rounded`, as maxGraph draws them: a rectangle does, an ellipse does not. */
  const canRound = (cell: Cell) => {
    const shape = graph.getView().getState(cell)?.shape
    return !!shape && shape.isRoundable(null as unknown as AbstractCanvas2D, 0, 0, 1, 1)
  }
  const selectionShapeEffects = (shapes: Cell[]): SelectionShapeEffects | null => {
    if (shapes.length === 0) return null
    const roundable = shapes.filter(canRound)
    const rounded = roundable.length > 0 && roundable.every((cell) => isOn(cell.getStyle().rounded))
    return {
      shadow: shapes.every((cell) => isOn(cell.getStyle().shadow)),
      rounded,
      arcSize: rounded ? same(roundable.map(arcSizeOf)) : null,
      canRound: roundable.length > 0,
    }
  }
  const selectionGeometry = (): SelectionGeometry | null => {
    const cells = geometryCells()
    if (cells.length === 0) return null
    const value = (key: keyof Box) => same(cells.map((cell) => cell.getGeometry()![key]))
    const turning = rotationCells()
    return {
      x: value('x'),
      y: value('y'),
      width: value('width'),
      height: value('height'),
      canSetHeight: cells.some((cell) => !isTable(cell) && !isSequence(cell) && !isLegend(cell)),
      canSetWidth: cells.some((cell) => !isSequence(cell) && !isLegend(cell)),
      rotation: turning.length > 0 ? same(turning.map((cell) => rotationOf(cell.getStyle()))) : null,
      canRotate: turning.length > 0,
    }
  }

  const selectionStickies = (): SelectedStickies | null => {
    const stickies = selectedStickies()
    if (readOnly || stickies.length === 0) return null
    return {
      cellIds: stickies.map((cell) => cell.getId()!),
      color: same(stickies.map((cell) => colorOf(cell, 'fill'))),
      textFit: stickies.every((cell) => hasTextFit(cell.getStyle())),
      locked: stickies.every((cell) => !isUnlocked(cell)),
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
  /** Sets keys of the style of a cell in one change of the model; `undefined` removes a key. */
  const setStyleKeys = (cell: Cell, changes: Record<string, StyleValue | undefined>) => {
    const style = cell.getClonedStyle() as Record<string, unknown>
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) delete style[key]
      else style[key] = value
    }
    model.setStyle(cell, style as CellStyle)
  }
  /** Turns shapes to `angle` degrees in one change of the model; see {@link DiagramEditor.setRotation}. */
  const rotateShapes = (shapes: Cell[], angle: number) => {
    const rotation = normalizeRotation(angle)
    if (rotation === null) return
    // The default is kept by removing the key, as draw.io does.
    setStyleValue(shapes, ROTATION_KEY, rotation === 0 ? undefined : rotation)
  }
  // The handle of a selected shape turns it by an angle, as the command does.
  configureRotation(graph, (cell, angle) => rotateShapes([cell], rotationOf(cell.getStyle()) + angle))
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
      // A view has its badge where a base table has its own.
      const right = isTable(part) ? (viewBadge(part.getStyle() as Record<string, unknown>) ?? (isBaseTable(part) ? BASE_BADGE : null)) : null
      const badge = Math.max(vendor ? badgeRoom(vendor.badge) : 0, right ? badgeRoom(right) : 0)
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
   * Sets text sizes in one change: fields and headers of tables get the height that fits their text, shapes with
   * auto width fit their width, and stickies no longer fit the size of their text.
   */
  const applyFontSizes = (cells: Cell[], sizeOf: (cell: Cell) => number) => {
    if (cells.length === 0) return
    graph.stopEditing(false)
    model.batchUpdate(() => {
      // A size set by hand replaces the size that fits the text.
      setStyleValue(cells, TEXT_FIT_KEY, undefined)
      for (const cell of cells) writeFontSize(cell, sizeOf(cell))
      fitAutoWidth(cells)
    })
  }
  /** Sets the text size of a cell; the header of a table and a field get the height that fits it. Inside a change. */
  const writeFontSize = (cell: Cell, size: number) => {
    setStyleValue([cell], 'fontSize', size)
    if (isTable(cell)) setStyleValue([cell], 'startSize', tableHeaderHeight(size))
    else if (isTable(cell.getParent())) setHeight(cell, tableFieldHeight(size))
  }

  /**
   * What a cell is as to its look (see {@link StyleKind}), or `null` for a group: a container without a fill and a line,
   * which a fill or a line would make a container that cannot be ungrouped. Fields, indexes and the labels of edges are
   * labels, and so are shapes without a fill and a line, e.g. «Текст».
   */
  const styleKindOf = (cell: Cell): StyleKind | null => {
    if (cell.isEdge()) return 'edge'
    if (isGroup(cell)) return null
    const parent = cell.getParent()
    if (isTable(parent) || parent?.isEdge()) return 'label'
    return colorOf(cell, 'fill') === 'none' && colorOf(cell, 'stroke') === 'none' ? 'label' : 'shape'
  }
  /** The style of a cell with its text size as drawn: the defaults of shapes and edges differ, 13 and 11. */
  const lookOf = (cell: Cell): Record<string, unknown> => ({ ...cell.getStyle(), fontSize: fontSizeOf(cell) })
  /** The single selected cell whose look can be copied. */
  const styleSource = (): Cell | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    return cell && styleKindOf(cell) ? cell : null
  }
  /**
   * The cells that a pasted look goes to, with the keys they take at most: the selected cells, the shapes and edges of
   * selected groups in place of the groups, and the fields and indexes of selected tables, which take the font and the
   * text size of their table unless they are selected themselves. Locked ones too.
   */
  const styleTargets = (): Map<Cell, readonly string[] | undefined> => {
    const targets = new Map<Cell, readonly string[] | undefined>()
    const add = (cell: Cell) => {
      if (isGroup(cell)) {
        cell.getChildren().forEach(add)
        return
      }
      targets.set(cell, undefined)
      if (!isTable(cell)) return
      for (const row of cell.getChildren()) if (!targets.has(row)) targets.set(row, TABLE_ROW_KEYS)
    }
    graph.getSelectionCells().forEach(add)
    return targets
  }
  /** The changes of the style of each cell that pasting `copied` changes; locked cells stay as they are. */
  const pastedStyles = (copied: CopiedStyle): Map<Cell, Record<string, StyleValue | undefined>> => {
    const changes = new Map<Cell, Record<string, StyleValue | undefined>>()
    for (const [cell, only] of styleTargets()) {
      const kind = styleKindOf(cell)
      if (!kind || !isUnlocked(cell)) continue
      const keys = styleChanges(copied, lookOf(cell), kind, only)
      if (Object.keys(keys).length > 0) changes.set(cell, keys)
    }
    return changes
  }
  /** Gives the selection the look `copied` as one undo step (see {@link DiagramEditor.pasteStyle}); whether anything changed. */
  const applyLook = (copied: CopiedStyle): boolean => {
    const changes = pastedStyles(copied)
    if (changes.size === 0) return false
    graph.stopEditing(false)
    // One change: one undo step, and one transaction that the other participants get.
    model.batchUpdate(() => {
      for (const [cell, keys] of changes) {
        const { fontSize, ...rest } = keys
        if (Object.keys(rest).length > 0) {
          const style = cell.getClonedStyle() as Record<string, unknown>
          for (const [key, value] of Object.entries(rest)) {
            if (value === undefined) delete style[key]
            else style[key] = value
          }
          model.setStyle(cell, style as CellStyle)
        }
        // The size of the text sets the height of the header and the fields of a table.
        if (typeof fontSize === 'number') writeFontSize(cell, fontSize)
      }
      fitAutoWidth([...changes.keys()])
    })
    return true
  }
  /** The selection has a cell that is not locked to give a look to. */
  const canTakeStyle = () => [...styleTargets().keys()].some((cell) => styleKindOf(cell) && isUnlocked(cell))
  /** A look is copied, and the selection has a cell that is not locked to paste it into. */
  const canPasteStyle = () => styleClipboard.read() !== null && canTakeStyle()

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
  // The size of the text of stickies that fit it follows their text, size and font in the change that changes them,
  // when it is done but not yet written: one undo step for everybody, and one size that every participant, every image
  // and draw.io show. Changes that the binding brings were fitted by their author, and a restore brings the sizes of
  // the version.
  let fittingTexts = false
  let restoring = false
  const fitTexts = () => {
    if (readOnly || fittingTexts || restoring || binding.isApplyingRemote()) return
    const changed = new Set<Cell>()
    for (const change of (model.currentEdit as { changes: object[] }).changes) {
      const lays =
        change instanceof ValueChange ||
        (change instanceof GeometryChange && resized(change.previous, change.geometry)) ||
        (change instanceof StyleChange && FIT_STYLE_KEYS.some((key) => changedKey(change, key)))
      if (lays) changed.add(change.cell)
    }
    const fitted = [...changed].filter((cell) => model.getCell(cell.getId()!) === cell && fitsText(graph, cell))
    if (fitted.length === 0) return
    fittingTexts = true
    try {
      model.batchUpdate(() => {
        for (const cell of fitted) {
          const { width, height } = cell.getGeometry()!
          const style = graph.getCellStyle(cell)
          const size = fittedFontSize(String(cell.getValue() ?? ''), style, width, height, hasTextWrap(cell.getStyle()))
          setStyleValue([cell], 'fontSize', size)
        }
      })
    } finally {
      fittingTexts = false
    }
  }
  model.addListener(InternalEvent.END_EDIT, fitTexts)

  /**
   * What {@link DiagramEditor.moveSelectionToLayer} moves into `target`: the selected elements of the page that are not
   * locked, and the edges whose both ends are among them, those that are not in `target` already, in drawing order.
   */
  const selectionToMove = (target: Cell): Cell[] => {
    const owners = new Set(graph.getSelectionCells().flatMap((cell) => pageCell(cell) ?? []))
    const owned = (end: Cell | null) => {
      const owner = end && pageCell(end)
      return owner !== null && owners.has(owner)
    }
    return pageChildren().filter(
      (cell) =>
        cell.getParent() !== target &&
        isUnlocked(cell) &&
        (owners.has(cell) || (cell.isEdge() && owned(cell.getTerminal(true)) && owned(cell.getTerminal(false)))),
    )
  }
  /** The layers of the page as the panel shows them, the top one first; see {@link LayerState}. */
  const layerStates = (): LayerState[] => {
    const selected = new Set(graph.getSelectionCells().flatMap((cell) => pageCell(cell) ?? []))
    const movable = [...selected].filter(isUnlocked)
    const active = insertLayer()
    return layers()
      .reverse()
      .map((layer) => {
        const id = layer.getId()!
        const style = layer.getStyle() as Record<string, unknown>
        const locked = isLockedLayer(layer)
        const children = layer.getChildren()
        return {
          id,
          name: layerName(id, layer.getValue()),
          ownName: String(layer.getValue() ?? '').trim(),
          main: id === LAYER_CELL_ID,
          visible: layer.isVisible(),
          hiddenForAll: isHiddenLayerStyle(style),
          ownVisibility: view.visibility(id) ?? null,
          locked,
          lockedBy: locked ? lockedByOf(layer) : null,
          active: layer === active,
          elements: children.length,
          selected: children.filter((child) => selected.has(child)).length,
          canMoveSelection: !readOnly && !locked && movable.some((cell) => cell.getParent() !== layer),
          holdsLocked: hasLockedDescendant(layer),
        }
      })
  }
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
      tableView: selectedTableView(),
      edgeMarkers: edges.length > 0 ? { start: sameMarker(edges, 'start'), end: sameMarker(edges, 'end') } : null,
      edgeRelation: selectionRelation(),
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
      hasCells: layers().some((layer) => layer.getChildCount() > 0),
      canCopy: graph.getSelectionCells().some((cell) => cell.isVertex() || isFreehand(cell)),
      canCopyStyle: styleSource() !== null,
      canPasteStyle: !readOnly && canPasteStyle(),
      canTakeStyle: !readOnly && canTakeStyle(),
      layoutSelection: selectedLayoutCells().length >= 2,
      laser: tool === 'laser',
      commentTool: tool === 'comment',
      pencil: tool === 'pencil',
      pencilLine: pencilLine.get(),
      lock: selectionLock(),
      attribution: selectionAttribution(),
      canAddImages: !readOnly && images !== null,
      link: selectionLink(),
      edgeApi: selectionEdgeApi(),
      stickies: selectionStickies(),
      status: selectionStatus(),
      selectionPlan: selectionPlan(),
      plan: { view: planView.view(), ...planView.counts() },
      properties: selectionProperties(),
      sequence: selectionSequence(),
      impact: impactView.state(),
      filter: filterState(),
      canPasteAsSameElement: !readOnly && clipboard.read() !== null,
      canMergeElements: !readOnly && selectedElements().length >= 2,
      layers: layerStates(),
    }
  }
  // The links of the page, found again after a change of the page, before the listeners below hear of it.
  let pageLinks: CellLink[] | null = null
  const forgetLinks = () => {
    pageLinks = null
  }
  model.addListener(InternalEvent.CHANGE, forgetLinks)
  const findLinks = (): CellLink[] => {
    const links: CellLink[] = []
    const visit = (parent: Cell) => {
      for (const child of parent.getChildren()) {
        const link = isLinkable(child) ? linkOf(child.getStyle()) : null
        if (link) links.push({ cellId: child.getId()!, link })
        visit(child)
      }
    }
    layers().forEach(visit)
    return links
  }
  // Cached so that the same state object is returned until something changes (useSyncExternalStore).
  let state = readState()
  const listeners = new Set<() => void>()
  const notify = () => {
    state = readState()
    listeners.forEach((listener) => listener())
  }
  planChanged = notify
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
    const selected = transaction.origin === origin ? undefined : selectedCellMap()
    const changed = (event: Y.YEvent<Y.AbstractType<unknown>>) =>
      event.target === selected &&
      event instanceof Y.YMapEvent &&
      ATTRIBUTION_KEYS.some((key) => event.keysChanged.has(key))
    if (selected && events.some(changed)) notify()
  }
  cells.observeDeep(handleAttribution)
  // Who wrote a sticky shows on the canvas; it may change without a change of the model, e.g. restored with a version.
  const handleTextAuthors = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
    const changed = (event: Y.YEvent<Y.AbstractType<unknown>>) =>
      event instanceof Y.YMapEvent &&
      (event.keysChanged.has(TEXT_AUTHOR_KEY) || event.keysChanged.has(TEXT_AUTHOR_NAME_KEY))
    if (events.some(changed)) notifyView()
  }
  // Statuses are not in the model either: the status of the selection follows the document when another participant, the
  // undo of this one or a merged proposal changes it.
  const handleStatuses = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
    const changed = (event: Y.YEvent<Y.AbstractType<unknown>>) =>
      event instanceof Y.YMapEvent && event.target !== cells && STATUS_KEYS.some((key) => event.keysChanged.has(key))
    if (!graph.isSelectionEmpty() && events.some(changed)) notify()
  }
  cells.observeDeep(handleStatuses)
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
    // An inherited field goes with its table only: it is removed in its base table. A participant of a sequence diagram
    // takes its messages and notes with it, a frame its branches and its end.
    const cells = withDependentParts(selected.filter((cell) => inheritedFieldId(cell) === null || selected.includes(cell.getParent()!)))
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
  keyHandler.isControlDown = isModDown
  // maxGraph looks keys up by their key code, which a layout without Latin letters may change: a letter is the letter
  // of its key on the Latin layout, as the shortcuts of the browser read it, e.g. `N` for the «т» of the Russian one.
  keyHandler.getFunction = (event) => {
    if (!event || event.altKey) return null
    const keys = keyHandler.isControlDown(event)
      ? event.shiftKey
        ? keyHandler.controlShiftKeys
        : keyHandler.controlKeys
      : event.shiftKey
        ? keyHandler.shiftKeys
        : keyHandler.normalKeys
    return keys[latinKeyCode(event)] ?? null
  }
  const modAltKeys = new Map<string, () => void>()
  for (const binding of KEY_BINDINGS) {
    // The editor is made below; the keys reach it once it is.
    if ((!readOnly || !binding.editing) && (collaboration || !binding.collaboration)) {
      bindKey(keyHandler, binding, () => editor, modAltKeys)
    }
  }
  bindModAltKeys(keyHandler, modAltKeys)

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
    const data = event.clipboardData
    editor.paste(undefined, data?.getData('text/plain') ?? '', data?.getData('text/html') ?? '', Array.from(data?.files ?? []))
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
  /**
   * Where the pointer over the canvas is on the screen, or `null` once it leaves, for a sticky added with the keyboard:
   * in diagram coordinates once the key is pressed, as the canvas may have scrolled since the pointer moved.
   */
  let pointer: { clientX: number; clientY: number } | null = null
  const handlePointerMove = (event: PointerEvent) => {
    pointer = { clientX: event.clientX, clientY: event.clientY }
    const point = toDiagramPoint(event.clientX, event.clientY)
    pointerListeners.forEach((listener) => listener(point))
  }
  const handlePointerLeave = () => {
    pointer = null
    pointerListeners.forEach((listener) => listener(null))
  }
  // Captured: maxGraph stops pointer events on connection points and selection handles from bubbling up.
  container.addEventListener('pointermove', handlePointerMove, true)
  container.addEventListener('pointerleave', handlePointerLeave)

  // The tools. While the laser pointer, the comment tool or the pencil is on, the main button draws a trail, places a
  // comment or draws a line, and its presses, releases and double clicks never reach maxGraph, which listens to pointer
  // events, or to mouse events on macOS: nothing is selected, moved, connected or edited. Moves do not reach it either,
  // so that it shows no connection points under the pointer; the listener of the cursor above comes first and still
  // gets them. The right button still pans and opens the menu, and the wheel still scrolls and zooms.
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
  /**
   * The line being drawn with the pencil: the pointer that started it, which alone draws it (a mouse, a pen or a
   * finger, not a second finger), the points it went through in diagram coordinates, and their trace over the cells,
   * which maxGraph draws as it will draw the finished line.
   */
  let pencilStroke: { pointerId: number; points: Point[]; trace: PolylineShape } | null = null
  const traceStroke = () => {
    if (!pencilStroke) return
    const { points, trace } = pencilStroke
    const { scale, translate } = graph.getView()
    trace.scale = scale
    trace.points = points.map(({ x, y }) => new GraphPoint((x + translate.x) * scale, (y + translate.y) * scale))
    // A curve needs two points.
    trace.visible = points.length >= 2
    trace.redraw()
  }
  const drawPencil = (event: PointerEvent) => {
    if (event.pointerId !== pencilStroke?.pointerId) return
    const { points } = pencilStroke
    // A point closer than a pixel of the screen to the last one adds nothing; a pen reports more points than events.
    const step = 1 / graph.getView().scale
    const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
    for (const moved of coalesced.length > 0 ? coalesced : [event]) {
      const point = toDiagramPoint(moved.clientX, moved.clientY)
      const last = points.at(-1)
      if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= step) points.push(point)
    }
    traceStroke()
  }
  /** Stops drawing the line and returns its points; `null` when no line is drawn. */
  const stopPencilStroke = (): Point[] | null => {
    if (!pencilStroke) return null
    const { points, trace } = pencilStroke
    pencilStroke = null
    page.removeEventListener('pointermove', drawPencil, true)
    page.removeEventListener('pointerup', finishPencilStroke, true)
    page.removeEventListener('pointercancel', cancelPencilStroke, true)
    trace.destroy()
    return points
  }
  // The browser took the pointer, e.g. for a gesture: the line is not added.
  const cancelPencilStroke = (event: PointerEvent) => {
    if (event.pointerId === pencilStroke?.pointerId) stopPencilStroke()
  }
  const finishPencilStroke = (event: PointerEvent) => {
    if (event.pointerId !== pencilStroke?.pointerId) return
    drawPencil(event)
    const points = strokePoints(stopPencilStroke()!, graph.getView().scale)
    if (points) addFreehandLine(points)
  }
  const startPencilStroke = (event: PointerEvent) => {
    if (pencilStroke) return
    const { color, width, dash } = pencilLine.get()
    const trace = new PolylineShape([], color, width)
    trace.style = { curved: true, ...(dash === 'dotted' && { dashPattern: DOTTED_PATTERN }) }
    trace.isDashed = dash !== 'solid'
    trace.pointerEvents = false
    trace.init(graph.getView().getOverlayPane())
    pencilStroke = { pointerId: event.pointerId, points: [], trace }
    // The line goes on beyond the canvas until the button is released anywhere.
    page.addEventListener('pointermove', drawPencil, true)
    page.addEventListener('pointerup', finishPencilStroke, true)
    page.addEventListener('pointercancel', cancelPencilStroke, true)
    drawPencil(event)
  }
  /**
   * Adds a line drawn by hand through `points` with the line of the pencil, on top of the page, as one undo step; the
   * selection stays as it is.
   */
  const addFreehandLine = (points: Point[]) => {
    const [first, ...rest] = points.map(({ x, y }) => new GraphPoint(x, y))
    const last = rest.pop()!
    const geometry = new Geometry()
    geometry.relative = true
    geometry.setTerminalPoint(first!, true)
    geometry.setTerminalPoint(last, false)
    geometry.points = rest
    const line = new Cell('', geometry, freehandStyle(pencilLine.get()))
    line.setEdge(true)
    graph.stopEditing(false)
    graph.addEdge(line, graph.getDefaultParent(), null, null)
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
    else if (tool === 'pencil') startPencilStroke(event)
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
  /** Turns a tool on, which turns the others off, or the tools off with `null`; a line being drawn is not added. */
  const setTool = (next: CanvasTool | null) => {
    if (next === tool) return
    if (tool === 'laser') endLaserStroke()
    stopPencilStroke()
    pressedForComment = false
    linkClick = null
    tool = next
    for (const [name, className] of Object.entries(TOOL_CLASSES)) container.classList.toggle(className, name === next)
    // A tool takes the pointer: who changed an element is not told over the canvas meanwhile.
    if (next) tooltips?.hide()
    notify()
  }
  // Following a link. A press of the main button with Ctrl, or Cmd on macOS, where Ctrl with a click is a right click,
  // over an element with a link never reaches maxGraph, nor do the moves and the release of that click, nor a double
  // click: nothing is selected, moved or edited. The release follows the link, unless the pointer went away meanwhile;
  // the browser lets a page open a tab there. A tool keeps the main button, and the editor of a label its clicks.
  const linkListeners = new Set<(link: CellLink) => void>()
  /** The click that follows a link, from its press until the next press; `released` once its button is up. */
  let linkClick: { link: CellLink; x: number; y: number; released: boolean } | null = null
  const isLinkClick = (event: MouseEvent) => event.button === 0 && (Client.IS_MAC ? event.metaKey : event.ctrlKey)
  /** The element with a link under the pointer, or the nearest one above the element there, e.g. the table of a field. */
  const linkAt = (event: MouseEvent): CellLink | null => {
    const rect = container.getBoundingClientRect()
    const x = event.clientX - rect.left + container.scrollLeft
    const y = event.clientY - rect.top + container.scrollTop
    for (let cell = graph.getCellAt(x, y); cell && !isLayer(cell); cell = cell.getParent()) {
      const link = isLinkable(cell) ? linkOf(cell.getStyle()) : null
      if (link) return { cellId: cell.getId()!, link }
    }
    return null
  }
  const pressLink = (event: PointerEvent) => {
    linkClick = null
    if (tool || !isLinkClick(event) || (event.target instanceof HTMLElement && event.target.isContentEditable)) return
    const link = linkAt(event)
    if (!link) return
    // Cancelling the press also keeps the browser from firing the mouse events of the click and from selecting text.
    event.stopImmediatePropagation()
    event.preventDefault()
    linkClick = { link, x: event.clientX, y: event.clientY, released: false }
  }
  const releaseLink = (event: PointerEvent) => {
    if (!linkClick || linkClick.released || event.button !== 0) return
    event.stopImmediatePropagation()
    linkClick.released = true
    const { link, x, y } = linkClick
    if (Math.hypot(event.clientX - x, event.clientY - y) <= graph.getEventTolerance()) {
      linkListeners.forEach((listener) => listener(link))
    }
  }
  const stopLinkClick = (event: MouseEvent) => {
    if (!linkClick) return
    const move = event.type === 'pointermove' || event.type === 'mousemove'
    if (move ? !linkClick.released : event.button === 0) event.stopImmediatePropagation()
  }
  container.addEventListener('pointerdown', pressLink, true)
  container.addEventListener('pointerup', releaseLink, true)
  for (const type of LINK_STOPPED_EVENTS) container.addEventListener(type, stopLinkClick, true)

  // After a button of the toolbar the keyboard is with that button, where the key handler of maxGraph does not look.
  // An Escape that closed a window of the toolbar, e.g. the colors of the pencil, has done its work there.
  const handleToolKey = (event: KeyboardEvent) => {
    if (tool && event.key === 'Escape' && !event.defaultPrevented) setTool(null)
  }
  page.addEventListener('keydown', handleToolKey)

  // A double click with Mod on the empty canvas, also inside a frame or a group, which let clicks through, adds a
  // sticky there. maxGraph does nothing with a double click there, and one on a cell still edits its label; with a tool
  // on, maxGraph gets no double click at all.
  const handleDoubleClick = (_sender: unknown, event: EventObject) => {
    const click = event.getProperty('event') as MouseEvent
    if (event.getProperty('cell') || !isModDown(click)) return
    event.consume()
    editor.addSticky(toDiagramPoint(click.clientX, click.clientY))
  }
  graph.addListener(InternalEvent.DOUBLE_CLICK, handleDoubleClick)

  const menuListeners = new Set<(request: ContextMenuRequest) => void>()
  const menuTarget = (): MenuTarget => {
    const cells = graph.getSelectionCells()
    if (cells.length === 0) return 'canvas'
    if (cells.length > 1) return 'selection'
    const cell = cells[0]!
    if (cell.isEdge()) return 'edge'
    const part = partOf(cell)
    if (part) return part === 'else' ? 'branch' : part === 'end' ? 'frame' : part
    if (isSequence(cell)) return 'sequence'
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
  const selectedCellIds = () => graph.getSelectionCells().flatMap((cell) => cell.getId() ?? [])
  const handleSelectionChange = () => {
    const ids = selectedCellIds()
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
  // The sketch of the page is made again only once its cells have changed or its edges got new routes.
  let drawingVersion = 0
  let sketch: { version: number; sketch: PageSketch } | null = null
  const handleDrawingChange = () => {
    drawingVersion++
  }
  model.addListener(InternalEvent.CHANGE, handleDrawingChange)
  graph.getView().addListener(InternalEvent.SCALE, notifyView)
  graph.getView().addListener(InternalEvent.TRANSLATE, notifyView)
  graph.getView().addListener(InternalEvent.SCALE_AND_TRANSLATE, notifyView)
  model.addListener(InternalEvent.CHANGE, notifyView)
  cells.observeDeep(handleTextAuthors)
  // The analysis, and what the filter shows, are changes of the drawing and of the state that tells them.
  impactChanged = () => {
    drawingVersion++
    notify()
    notifyView()
  }
  filterChanged = impactChanged
  /** The cell stands for an element whose dependencies the analysis shows: a shape that may be an element, a table or its field. */
  const analysable = (records: ReturnType<typeof modelImpactRecords>, cellId: string) => {
    const node = impactNode(records, cellId)
    const cell = node === null ? null : model.getCell(node)
    return !!cell && (isTable(cell) || propertiesTarget(cell) === 'shape')
  }
  /** The two selected cells whose paths the analysis would show: two different elements. */
  const pathEnds = (): [string, string] | null => {
    const selected = graph.getSelectionCells()
    if (selected.length !== 2) return null
    const records = modelImpactRecords(graph)
    const ids = selected.map((cell) => cell.getId()!)
    if (!ids.every((id) => analysable(records, id))) return null
    const [a, b] = ids.map((id) => impactNode(records, id))
    return a !== b ? [ids[0]!, ids[1]!] : null
  }

  const listen = <T>(set: Set<T>, listener: T) => {
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }

  /** Inserts a palette shape with its children; the caller wraps it in a model update. */
  const insertShape = (preset: ShapePreset, parent: Cell, x: number, y: number, marked = true): Cell => {
    // A sequence diagram starts with two participants, a call and its answer; its layout gives it its size.
    if (preset.id === SEQUENCE_PRESET) return graph.addCell(diagramCell(sequenceCells(starterSequence(), { x, y })), parent)
    // A new table with the default base of the page has the fields of the base instead of those of the preset.
    const base = isTableStyle(preset.style) ? defaultBase(pageTables(graph)) : null
    const shape = base ? { ...preset, style: { ...preset.style, [BASE_TABLE_KEY]: base.getId()! }, children: [] } : preset
    const cell = graph.insertVertex({
      parent,
      value: shape.value,
      position: [x, y],
      size: [shape.width, shape.height],
      style: (marked ? markedStyle(shape) : shape.style) as CellStyle,
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
    if (isGridTable(cell)) populateGridTable(graph, cell)
    fitAutoWidth([cell])
    return cell
  }

  /**
   * The selection with fields and shapes of groups replaced by their tables and groups, and the edges between them. Lines
   * drawn by hand have no ends: they are copied when they are selected.
   */
  const cellsToCopy = (): Cell[] => {
    // The ancestor on the page: a field belongs to its table, a shape of a group to the group.
    const owner = (cell: Cell) => {
      let current = cell
      while (current.getParent() && !isLayer(current.getParent())) current = current.getParent()!
      return current
    }
    const shapes = new Set(
      graph
        .getSelectionCells()
        .filter((cell) => cell.isVertex() || isFreehand(cell))
        .map(owner),
    )
    const copied = (terminal: Cell | null) => terminal !== null && shapes.has(owner(terminal))
    const edges = pageChildren().filter(
      (cell) => cell.isEdge() && isShown(cell) && copied(cell.getTerminal(true)) && copied(cell.getTerminal(false)),
    )
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
  /**
   * Adds a part to the sequence diagram `diagram` at `index` of its children, with what `also` adds in the same change, as
   * one undo step; selects it and starts editing its text, which joins that step (see `newCell`). With `removeEmpty`, a
   * new message left without text goes away with the step.
   */
  const addPart = (
    diagram: Cell,
    index: number,
    value: string,
    style: Record<string, StyleValue>,
    removeEmpty = false,
    also?: () => void,
  ): Cell => {
    const part = new Cell(value, new Geometry(0, 0, 0, 0), style as CellStyle)
    part.setVertex(true)
    const selected = graph.getSelectionCells()
    const steps = undoManager.undoStack.length
    model.batchUpdate(() => {
      graph.addCell(part, diagram, Math.min(index, diagram.getChildCount()))
      also?.()
    })
    graph.setSelectionCell(part)
    graph.startEditingAtCell(part)
    if (graph.isEditing(part) && undoManager.undoStack.length > steps) {
      newCell = { cell: part, step: undoManager.undoStack.at(-1), removeEmpty, selected }
    }
    return part
  }
  /** Where a new row goes in `diagram`: under the selected row, or last. */
  const rowIndex = (diagram: Cell, selected: Cell | null) => {
    const part = partOf(selected)
    return selected && part !== null && part !== 'participant' ? diagram.getIndex(selected) + 1 : diagram.getChildCount()
  }
  /** Adds the message that follows `message` when Enter applied its text: between the same participants, of its kind. */
  const addMessageAfter = (message: Cell) => {
    const diagram = message.getParent()
    if (readOnly || !diagram || !isSequence(diagram) || !isUnlocked(diagram)) return
    const read = graphSequence(diagram).steps.find((step) => step.id === message.getId())
    if (read?.type !== 'message') return
    const style = messageStyle({ from: read.from, to: read.to, arrow: read.arrow, activate: [], deactivate: [] })
    addPart(diagram, diagram.getIndex(message) + 1, '', style, true)
  }
  /** The diagram of the selection that commands change: not locked; editing stops first. */
  const changingSequence = (): Cell | null => {
    graph.stopEditing(false)
    const diagram = selectedSequence()
    return diagram && isUnlocked(diagram) ? diagram : null
  }
  /** The part `cellId` of a kind that a command changes: of the page and not locked, with its diagram. */
  const changingPart = (cellId: string, kind: string): { cell: Cell; diagram: SequenceDiagram } | null => {
    if (destroyed) return null
    const cell = model.getCell(cellId)
    if (!cell || partOf(cell) !== kind || !isUnlocked(cell)) return null
    return { cell, diagram: graphSequence(cell.getParent()!) }
  }
  /** Sets keys of the style of a cell as one change, unless it has them already; `undefined` removes a key. */
  const changeStyle = (cell: Cell, changes: Record<string, StyleValue | undefined>) => {
    const style = cell.getStyle() as Record<string, unknown>
    if (Object.entries(changes).every(([key, value]) => JSON.stringify(style[key]) === JSON.stringify(value))) return
    graph.stopEditing(false)
    model.batchUpdate(() => setStyleKeys(cell, changes))
  }
  /**
   * Adds clones of `cells` moved by (dx, dy) as one undo step and selects them; with `sameElements`, the clones name the
   * elements that `cells` name.
   */
  const insertCopies = (cells: Cell[], dx: number, dy: number, sameElements = false) => {
    graph.stopEditing(false)
    const importCells = () => graph.importCells(cells, dx, dy, graph.getDefaultParent())
    graph.setSelectionCells(sameElements ? keepElements(importCells) : importCells())
    container.focus({ preventScroll: true })
  }
  /** Puts clones of `cells` into the clipboard of the tab and their text into the clipboard of the system. */
  const copyCells = (cells: Cell[], data?: DataTransfer | null) => {
    // Clones without a graph: the copied cells may change or be removed before they are pasted. They keep the elements
    // of the cells for «Вставить как тот же элемент»; a paste gives them new ones.
    const clones = keepElements(() => graph.cloneCells(cells, false))
    const sources = new Map<Cell, string>()
    pairCells(cells, clones, (cell, clone) => {
      const id = cell.getId()
      if (id) sources.set(clone, id)
    })
    const { text, html } = clipboardContent(clones)
    clipboard.put(clones, text, { document, pageId, cells: sources })
    if (!data) writeSystemClipboard(text, html)
    else {
      data.setData('text/plain', text)
      if (html !== null) data.setData('text/html', html)
    }
    notify()
  }
  /**
   * Adds copies of clipboard cells: with their top-left corner at `at`, or shifted further with every paste. Pictures
   * that the board must store are stored first, and the copies point at them; the clipboard keeps the cells as they are.
   */
  const pasteCells = (cells: Cell[] | null, at?: Point, same: ClipboardSource | null = null) => {
    if (!cells) return
    // Taken at once, so that pastes keep their shifts while pictures are stored.
    const shift = at ? 0 : clipboard.nextPaste() * PASTE_OFFSET
    const insert = (copies: Cell[], sources: ReadonlyMap<Cell, string>) => {
      const place = (inserted: Cell[]) => {
        if (!at) return insertCopies(inserted, shift, shift, same !== null)
        const bounds = graph.getBoundingBoxFromGeometry(inserted, false)
        insertCopies(inserted, at.x - (bounds?.x ?? 0), at.y - (bounds?.y ?? 0), same !== null)
      }
      if (!same) return place(copies)
      // One change: the shapes copied that become elements, and the cells pasted.
      document.transact(() => place(asSameElements(copies, sources, same.pageId)), origin)
    }
    const host = images
    const pictures = host ? cellImageUrls(cells).filter((url) => needsStoring(url, host)) : []
    if (!host || pictures.length === 0) {
      insert(cells, same?.cells ?? new Map())
      return
    }
    void storeImages(pictures, host).then((stored) => {
      if (destroyed) return
      const clone = () => graph.cloneCells(cells, false)
      const copies = same ? keepElements(clone) : clone()
      const sources = new Map<Cell, string>()
      if (same) pairCells(cells, copies, (cell, copy) => same.cells.has(cell) && sources.set(copy, same.cells.get(cell)!))
      // As in the clipboard: without a parent, maxGraph would take an edge for the label of an edge and drop it.
      const holder = new Cell()
      copies.forEach((copy) => holder.insert(copy))
      replaceCellImages(copies, stored)
      insert(copies, sources)
      notify()
    })
  }
  /**
   * Clones of `cells` whose shapes that may be elements name the elements of the cells of the page `pageId` they were
   * copied from (`sources`), with their properties now and labels made of them; a source that is no element yet becomes
   * one. Call inside the transaction of the paste.
   */
  const asSameElements = (cells: Cell[], sources: ReadonlyMap<Cell, string>, sourcePage: string): Cell[] => {
    const clones = keepElements(() => graph.cloneCells(cells, false))
    const holder = new Cell()
    clones.forEach((clone) => clone && holder.insert(clone))
    const refreshed: string[] = []
    const at = Date.now()
    pairCells(cells, clones, (cell, clone) => {
      if (propertiesTarget(clone) !== 'shape') return
      const style = clone.getStyle() as Record<string, StyleValue>
      // The element of the shape copied as it is now, e.g. after merging or detaching; the copied one once it is gone.
      const source = sources.get(cell)
      const sourceCells = getCells(document, sourcePage)
      const entry = source ? sourceCells.get(source) : undefined
      let id: string | null = null
      if (entry && isLockedCell(sourceCells, source!)) {
        // A locked shape does not change: an element it has is shared, none is made for it.
        id = cellElementId(entry) ?? newId()
      } else if (entry) {
        const before = cellElementId(entry)
        id = ensureElement(document, { pageId: sourcePage, cellId: source! })
        if (id !== null && id !== before) {
          if (author) writeAttribution(entry, author, at)
          if (sourcePage === pageId) refreshed.push(source!)
        }
      }
      id ??= elementIdOf(style) ?? newId()
      const data = elementData(document, id)
      if (data && Object.keys(data).length > 0) {
        const next = cellLabel(style, String(clone.getValue() ?? ''), id, data)
        clone.setValue(next.label)
        const { [OWN_LINES_KEY]: _kept, ...rest } = styleWith(style, data)
        clone.setStyle({ ...rest, ...(next.ownLines !== null && { [OWN_LINES_KEY]: next.ownLines }), [ELEMENT_KEY]: id } as CellStyle)
      } else {
        clone.setStyle({ ...style, [ELEMENT_KEY]: id } as CellStyle)
      }
    })
    binding.refresh(refreshed)
    return clones.filter((clone): clone is Cell => clone !== null)
  }
  /** The cells of the page that name the element `id`. */
  /** What «Детализировать» does for the shape `cellId`; see {@link DiagramEditor.detailOffer}. */
  const detailOffer = (cellId: string): 'open' | 'create' | null => {
    const cell = model.getCell(cellId)
    // Only a system or a container goes down a level: not, e.g., a boundary, whose link leads up.
    if (destroyed || !cell || propertiesTarget(cell) !== 'shape' || !canDetail(document, { pageId, cellId })) return null
    if (detailPageOf(document, { pageId, cellId }) !== null) return 'open'
    return !readOnly && isUnlocked(cell) ? 'create' : null
  }
  const cellsOfElement = (id: string): string[] =>
    Array.from(cells.entries())
      .filter(([, cell]) => cellElementId(cell) === id)
      .map(([cellId]) => cellId)
  /** Merges the elements of the shapes `refs` into the element of `keep` as one undo step; whether they were merged. */
  const mergeCells = (refs: readonly CellRef[], keep: CellRef): boolean => {
    graph.stopEditing(false)
    let target: string | null = null
    document.transact(() => {
      const merged = mergeDocumentElements(document, refs, keep)
      if (!merged) return
      target = merged.id
      if (!author) return
      const at = Date.now()
      for (const ref of [keep, ...merged.cells]) {
        const entry = getCells(document, ref.pageId).get(ref.cellId)
        if (entry) writeAttribution(entry, author, at)
      }
    }, origin)
    if (target === null) return false
    binding.refresh(cellsOfElement(target))
    return true
  }
  /** Adds image shapes of stored images in a row whose middle is at `center`, as one change, and selects them. */
  const insertImages = (stored: StoredImage[], center: Point) => {
    const sizes = stored.map((image) => fittedImageSize(image.width, image.height))
    const rowWidth = sizes.reduce((sum, size) => sum + size.width, 0) + IMAGE_GAP * (sizes.length - 1)
    const rowHeight = Math.max(...sizes.map((size) => size.height))
    const gridSize = graph.getGridSize()
    const snap = (value: number) => Math.round(value / gridSize) * gridSize
    let x = snap(center.x - rowWidth / 2)
    const top = snap(center.y - rowHeight / 2)
    const parent = graph.getDefaultParent()
    const added: Cell[] = []
    graph.stopEditing(false)
    model.batchUpdate(() => {
      stored.forEach((image, index) => {
        const { width, height } = sizes[index]!
        const y = top + Math.round((rowHeight - height) / 2)
        const style = imageStyle(image.url) as CellStyle
        added.push(graph.insertVertex({ parent, value: '', position: [x, y], size: [width, height], style }))
        x += width + IMAGE_GAP
      })
    })
    graph.setSelectionCells(added)
    container.focus({ preventScroll: true })
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
  /** Selected cells without table fields and parts of sequence diagrams: their layouts, not the user, order them. */
  const selectedShapesAndEdges = () => graph.getSelectionCells().filter((cell) => !isTable(cell.getParent()) && !isSequencePart(cell))

  /**
   * Adds a shape of the palette in the middle of the view, or at `center`, aside of the shapes there, as one undo step,
   * and selects it; `marked` marks it as the shape of the palette it is (see `markedStyle`).
   */
  const placeShape = (shape: ShapePreset, center: Point, marked: boolean): Cell => {
    const size = graph.getGridSize()
    const snap = (value: number) => Math.round(value / size) * size
    const parent = graph.getDefaultParent()
    // The shapes the participant sees, of every layer.
    const vertices = pageChildren().filter((cell) => cell.isVertex() && isShown(cell))
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
      cell = insertShape(shape, parent, x, y, marked)
    } finally {
      model.endUpdate()
    }
    graph.setSelectionCell(cell)
    container.focus({ preventScroll: true })
    return cell
  }

  /**
   * The image of {@link DiagramEditor.exportSvg} as the page is drawn now: with `onlyVisible` only the cells drawn, which
   * the image names then as it names a selection.
   */
  const drawImage = (selectionOnly: boolean, options: SvgOptions): ExportedImage | null => {
    const copied = selectionOnly ? new Set(cellsToCopy()) : null
    // In the order of the page, so that what lies on top on the canvas lies on top in the image: what this canvas shows,
    // without the layers hidden on it, what the filter hides and the edges that end in them.
    const graphView = graph.getView()
    const children = pageChildren()
    const cells = children.filter((cell) => graphView.getState(cell) && (!copied || copied.has(cell)))
    if (copied && cells.length === 0) return null
    // The diagram of an image has what the image draws: the whole page, unless something of it is not drawn.
    const named = copied !== null || cells.length < children.length
    // The image has the colors of the diagram: the page is drawn light for it and back in one task, which the
    // participant never sees.
    const shown = theme
    if (shown !== 'light') {
      theme = 'light'
      restyle(graph)
    }
    try {
      const image = renderSvg(graph, cells, options)
      return image && { ...image, cellIds: named ? cells.flatMap((cell) => cell.getId() ?? []) : null }
    } finally {
      if (shown !== 'light') {
        theme = shown
        restyle(graph)
      }
    }
  }

  const editor: DiagramEditor = {
    graph,
    pageId,
    readOnly,
    addShape(shapeId, center = visibleCenter()) {
      const preset = findShape(shapeId)
      if (!preset) return null
      const shape =
        preset.id === 'sticky' ? { ...preset, style: { ...preset.style, fillColor: stickyColor() } } : preset
      return placeShape(shape, center, true)
    },
    addLogo(slug, center = visibleCenter()) {
      const icon = techIconsNow()?.bySlug.get(slug)
      const path = icon && iconPathNow(slug)
      if (!icon || !path || readOnly) return null
      return placeShape({ id: 'rectangle', ...logoShape(icon, path) }, center, false)
    },
    iconsReady: () => iconBadges.ready(),
    addSticky(center) {
      graph.stopEditing(false)
      setTool(null)
      const at = center ?? (pointer ? toDiagramPoint(pointer.clientX, pointer.clientY) : visibleCenter())
      const steps = undoManager.undoStack.length
      const cell = editor.addShape('sticky', at)
      if (!cell) return null
      graph.startEditingAtCell(cell)
      // After the editing started: starting it stops any editing before it.
      if (graph.isEditing(cell) && undoManager.undoStack.length > steps) {
        newCell = { cell, step: undoManager.undoStack.at(-1), removeEmpty: false, selected: [] }
      }
      return cell
    },
    setStickyColor(color) {
      rememberStickyColor(color)
      const stickies = unlocked(selectedStickies())
      if (stickies.length === 0) return
      graph.stopEditing(false)
      model.batchUpdate(() => {
        setStyleValue(stickies, 'fillColor', color)
        // The notes of draw.io may have a gradient, which would keep a part of the old color.
        setStyleValue(stickies, 'gradientColor', undefined)
      })
    },
    setTextFit(enabled) {
      const stickies = unlocked(selectedStickies())
      if (stickies.length === 0) return
      graph.stopEditing(false)
      // Fitting the text to the shape and the shape to the text would contend: one turns the other off.
      model.batchUpdate(() => {
        setStyleValue(stickies, TEXT_FIT_KEY, enabled ? true : undefined)
        if (enabled) setStyleValue(stickies, AUTO_WIDTH_KEY, undefined)
      })
    },
    stickySignatures() {
      const signatures: StickySignature[] = []
      const visit = (parent: Cell) => {
        for (const cell of parent.getChildren()) {
          if (!cell.isVertex()) continue
          const id = cell.getId()!
          const shown = isSticky(cell) && rotationOf(cell.getStyle()) === 0 && editing?.cellId !== id
          const author = shown ? readTextAuthor(cells.get(id)) : null
          if (author) signatures.push({ ...author, cellId: id, color: colorOf(cell, 'font') })
          visit(cell)
        }
      }
      layers().forEach(visit)
      return signatures
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
      // A view keeps no rows to index unless it is materialized.
      if (!table || !isUnlocked(table) || (isViewTable(table) && !isMaterializedStyle(table.getStyle() as Record<string, unknown>))) return null
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
      // A view is no template of fields.
      if (!table || !isUnlocked(table) || isBaseTable(table) === enabled || (enabled && isViewTable(table))) return
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
      // The columns of a view are those of its query, inherited from no base.
      if (!table || !isUnlocked(table) || baseTableId(table) === baseId || (baseId !== null && isViewTable(table))) return
      if (baseId !== null && !baseOptions(table, pageTables(graph)).some((base) => base.getId() === baseId)) return
      graph.stopEditing(false)
      model.batchUpdate(() => {
        setStyleValue([table], BASE_TABLE_KEY, baseId ?? undefined)
        // Without a base the sync would keep the inherited fields as fields of the table.
        if (baseId === null) graph.removeCells(table.getChildren().filter((field) => inheritedFieldId(field) !== null), true)
        fitAutoWidth([table])
      })
    },
    setViewTable(enabled) {
      const table = selectedTable()
      if (!table || !isUnlocked(table) || isViewTable(table) === enabled) return
      graph.stopEditing(false)
      model.batchUpdate(() => {
        setStyleKeys(
          table,
          enabled
            ? // The sync of bases keeps the copies of the fields of its base as fields of its own.
              { [VIEW_KEY]: true, [BASE_KEY]: undefined, [DEFAULT_BASE_KEY]: undefined, [BASE_TABLE_KEY]: undefined }
            : { [VIEW_KEY]: undefined, [MATERIALIZED_KEY]: undefined, [VIEW_QUERY_KEY]: undefined },
        )
        fitAutoWidth([table])
      })
    },
    setViewMaterialized(enabled) {
      const table = selectedTable()
      const style = table?.getStyle() as Record<string, unknown> | undefined
      if (!table || !isUnlocked(table) || !isViewTable(table) || isMaterializedStyle(style!) === enabled) return
      model.batchUpdate(() => {
        setStyleValue([table], MATERIALIZED_KEY, enabled ? true : undefined)
        fitAutoWidth([table])
      })
    },
    setViewQuery(query) {
      const table = selectedTable()
      const normalized = normalizeViewQuery(query)
      if (!table || !isUnlocked(table) || !isViewTable(table) || normalized.length > MAX_VIEW_QUERY) return
      if (normalized === viewQueryOf(table.getStyle() as Record<string, unknown>)) return
      setStyleValue([table], VIEW_QUERY_KEY, normalized || undefined)
    },
    setTableVendor(vendor) {
      const table = selectedTable()
      if (!table || !isUnlocked(table) || vendorOf(table.getStyle())?.id === vendor) return
      model.batchUpdate(() => {
        setStyleValue([table], VENDOR_KEY, vendor)
        fitAutoWidth([table])
      })
    },
    addSequenceParticipant() {
      const diagram = changingSequence()
      if (!diagram) return null
      const selected = selectedPart()
      const participants = diagram.getChildren().filter((child) => partOf(child) === 'participant')
      const after = selected && partOf(selected) === 'participant' ? selected : (participants.at(-1) ?? null)
      const index = after ? diagram.getIndex(after) + 1 : 0
      return addPart(diagram, index, `Участник ${participants.length + 1}`, participantStyle(newId(), 'participant'))
    },
    addSequenceMessage() {
      const diagram = changingSequence()
      const read = diagram && graphSequence(diagram)
      if (!diagram || !read || read.participants.length === 0) return null
      const selected = selectedPart()
      const keys = read.participants.map((participant) => participant.key)
      const state = selected ? partState(selected, read) : null
      let [from, to, arrow]: [string, string, MessageArrow] = [keys[0]!, keys[1] ?? keys[0]!, 'sync']
      if (state?.type === 'message') [from, to, arrow] = [state.from, state.to, state.arrow]
      else if (state?.type === 'note') [from, to] = [state.from, state.to]
      else if (state?.type === 'participant') {
        const at = read.participants.findIndex((participant) => participant.id === state.cellId)
        from = keys[at]!
        to = keys[at + 1] ?? keys[at - 1] ?? from
      }
      return addPart(diagram, rowIndex(diagram, selected), '', messageStyle({ from, to, arrow, activate: [], deactivate: [] }), true)
    },
    addSequenceNote() {
      const diagram = changingSequence()
      const read = diagram && graphSequence(diagram)
      if (!diagram || !read || read.participants.length === 0) return null
      const selected = selectedPart()
      const state = selected ? partState(selected, read) : null
      let [from, to] = [read.participants[0]!.key, read.participants[0]!.key]
      if (state?.type === 'message' || state?.type === 'note') [from, to] = [state.from, state.to]
      else if (state?.type === 'participant') from = to = read.participants.find((participant) => participant.id === state.cellId)!.key
      return addPart(diagram, rowIndex(diagram, selected), 'Заметка', noteStyle({ from, to, placement: 'over' }))
    },
    addSequenceFrame(kind) {
      const diagram = changingSequence()
      if (!diagram) return null
      const children = diagram.getChildren()
      const owners = frameOwners(graphSequence(diagram))
      const at = (id: string | undefined) => children.findIndex((child) => child.getId() === id)
      const rows = selectedRows().map((cell) => children.indexOf(cell))
      let first = rows.length > 0 ? Math.min(...rows) : children.length
      let last = rows.length > 0 ? Math.max(...rows) : children.length - 1
      // Whole frames: a frame among the rows takes its branches and its end, a branch or an end its frame.
      for (let changed = rows.length > 0; changed; ) {
        changed = false
        for (let index = first; index <= last; index++) {
          const id = children[index]!.getId() ?? ''
          const owner = owners.get(id)
          if (owner && at(owner.id) < first) {
            first = at(owner.id)
            changed = true
          }
          const own = children.reduce((end, child, place) => (owners.get(child.getId() ?? '')?.id === id ? place : end), -1)
          if (own > last) {
            last = own
            changed = true
          }
        }
      }
      const end = new Cell('', new Geometry(0, 0, 0, 0), { [PART_KEY]: 'end' } as CellStyle)
      end.setVertex(true)
      // The end goes after the last row, which the frame put one further.
      return addPart(diagram, first, '', { [PART_KEY]: 'frame', [FRAME_KEY]: kind }, false, () => graph.addCell(end, diagram, last + 2))
    },
    addSequenceBranch() {
      graph.stopEditing(false)
      const part = selectedPart()
      const diagram = part?.getParent()
      if (!part || !diagram || !isUnlocked(diagram)) return null
      const read = graphSequence(diagram)
      const state = partState(part, read)
      if ((state?.type !== 'frame' && state?.type !== 'branch') || !BRANCH_WORDS[state.kind]) return null
      const owners = frameOwners(read)
      const end = diagram.getChildren().find((child) => partOf(child) === 'end' && owners.get(child.getId() ?? '')?.id === state.frameId)
      return addPart(diagram, end ? diagram.getIndex(end) : diagram.getChildCount(), '', { [PART_KEY]: 'else' })
    },
    setSequenceParticipant(cellId, { kind }) {
      const changing = changingPart(cellId, 'participant')
      if (!changing || kind === undefined) return
      changeStyle(changing.cell, { [PARTICIPANT_KIND_KEY]: kind === 'participant' ? undefined : kind })
    },
    setSequenceMessage(cellId, changes) {
      const changing = changingPart(cellId, 'message')
      const message = changing?.diagram.steps.find((step) => step.id === cellId)
      if (!changing || message?.type !== 'message') return
      const keys = new Set(changing.diagram.participants.map((participant) => participant.key))
      const from = changes.from !== undefined && keys.has(changes.from) ? changes.from : message.from
      const to = changes.to !== undefined && keys.has(changes.to) ? changes.to : message.to
      // A new receiver takes over its activation of the message, a new sender its end of one.
      let activate = message.activate.map((key) => (key === message.to ? to : key))
      let deactivate = message.deactivate.map((key) => (key === message.from ? from : key))
      if (changes.activates !== undefined) activate = [...activate.filter((key) => key !== to), ...(changes.activates ? [to] : [])]
      if (changes.deactivates !== undefined) {
        deactivate = [...deactivate.filter((key) => key !== from), ...(changes.deactivates ? [from] : [])]
      }
      const next = messageStyle({
        from,
        to,
        arrow: changes.arrow ?? message.arrow,
        activate: [...new Set(activate)],
        deactivate: [...new Set(deactivate)],
      })
      changeStyle(changing.cell, {
        [FROM_KEY]: from,
        [TO_KEY]: to,
        [ARROW_KEY]: next[ARROW_KEY],
        [ACTIVATE_KEY]: next[ACTIVATE_KEY],
        [DEACTIVATE_KEY]: next[DEACTIVATE_KEY],
      })
    },
    setSequenceNote(cellId, changes) {
      const changing = changingPart(cellId, 'note')
      const note = changing?.diagram.steps.find((step) => step.id === cellId)
      if (!changing || note?.type !== 'note') return
      const keys = new Set(changing.diagram.participants.map((participant) => participant.key))
      const from = changes.from !== undefined && keys.has(changes.from) ? changes.from : note.from
      const to = changes.to !== undefined && keys.has(changes.to) ? changes.to : note.to
      const placement = changes.placement ?? note.placement
      // A note beside a participant stands by one.
      const next = noteStyle({ from, to: placement === 'over' ? to : from, placement })
      changeStyle(changing.cell, { [FROM_KEY]: next[FROM_KEY], [TO_KEY]: next[TO_KEY], [NOTE_KEY]: next[NOTE_KEY] })
    },
    setSequenceFrame(cellId, kind) {
      const changing = changingPart(cellId, 'frame')
      if (changing) changeStyle(changing.cell, { [FRAME_KEY]: kind })
    },
    setSequenceNumbering(cellId, numbered) {
      const cell = destroyed ? null : model.getCell(cellId)
      if (!cell || !isSequence(cell) || !isUnlocked(cell) || isNumbered(cell.getStyle() as Record<string, unknown>) === numbered) return
      changeStyle(cell, { [NUMBERS_KEY]: numbered || undefined })
    },
    sequenceMermaid(cellId) {
      const diagram = sequenceOf(model.getCell(cellId))
      return diagram ? mermaidOfSequence(graphSequence(diagram)) : null
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
        const style = isAssociationPair(source.getStyle(), cell.getStyle()) ? ASSOCIATION_STYLE : undefined
        graph.insertEdge({ parent, value: '', source, target: cell, style })
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
    paste(at, text, html, files = []) {
      if (files.length > 0 && images && pastesAsImage(text ?? '', html ?? '')) {
        void editor.addImages(files, at)
        return
      }
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
    async addImages(files, at) {
      if (!images || files.length === 0) return
      const center = at ?? visibleCenter()
      const stored = await Promise.all(files.map((file) => images.store(file, file instanceof File ? file.name : undefined)))
      const added = stored.filter((image): image is StoredImage => image !== null)
      if (destroyed || added.length === 0) return
      insertImages(added, center)
    },
    duplicate() {
      const cells = cellsToCopy()
      if (cells.length > 0) insertCopies(cells, PASTE_OFFSET, PASTE_OFFSET)
    },
    copyStyle() {
      const cell = styleSource()
      if (!cell) return
      styleClipboard.put(copyLook(lookOf(cell), styleKindOf(cell)!))
      notify()
    },
    pasteStyle() {
      const copied = styleClipboard.read()
      if (copied) applyLook(copied)
    },
    selectionComponent() {
      const cells = cellsToCopy()
      if (cells.length === 0) return null
      const clones = graph.cloneCells(cells, false)
      // As in the clipboard: without a parent, maxGraph would take an edge for the label of an edge and drop it.
      const holder = new Cell()
      clones.forEach((clone) => clone && holder.insert(clone))
      const shapes = cells.filter((cell) => cell.isVertex())
      const single = shapes.length === 1 ? shapes[0]! : null
      const label = single ? labelLines(String(single.getValue() ?? ''), single.getStyle() as Record<string, unknown>)[0] : undefined
      return {
        cells: clones.filter((clone): clone is Cell => clone !== null),
        image: editor.exportSvg({ selectionOnly: true, transparent: true }),
        name: label || 'Компонент',
      }
    },
    async insertComponent(content, center) {
      const cells = await diagramCells(content)
      if (destroyed || cells.length === 0) return false
      const holder = new Cell()
      cells.forEach((cell) => holder.insert(cell))
      const bounds = graph.getBoundingBoxFromGeometry(cells, false)
      const middle = center ?? visibleCenter()
      const size = graph.getGridSize()
      const snap = (value: number) => Math.round(value / size) * size
      pasteCells(cells, { x: snap(middle.x - (bounds?.width ?? 0) / 2), y: snap(middle.y - (bounds?.height ?? 0) / 2) })
      notify()
      return true
    },
    async applyComponentStyle(content) {
      const cells = await diagramCells(content)
      if (destroyed) return false
      const holder = new Cell()
      cells.forEach((cell) => holder.insert(cell))
      // The first shape, a text too, inside groups too; without shapes, the first edge.
      const shapes = (list: Cell[]): Cell[] =>
        list.flatMap((cell) => (cell.isEdge() ? [] : isGroup(cell) ? shapes(cell.getChildren()) : [cell]))
      const source = shapes(cells)[0] ?? cells.find((cell) => cell.isEdge())
      const kind = source ? styleKindOf(source) : null
      return source !== undefined && kind !== null && applyLook(copyLook(lookOf(source), kind))
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
        // the fields of base tables and what the canvas does not hold. Stickies keep the text sizes of the version.
        restoring = true
        try {
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
            // The binding marks the cells it wrote as changed by whoever restores; what it does not write is marked
            // here.
            const at = Date.now()
            for (const data of restored) {
              const entry = cells.get(data.id)
              if (entry && writeRestoredFields(entry, data) && author) writeAttribution(entry, author, at)
            }
          }, origin)
        } finally {
          restoring = false
        }
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
      // The elements of the layers shown and not locked; maxGraph would take those of the default parent only.
      graph.setSelectionCells(openChildren())
    },
    moveSelection(dx, dy) {
      // A field moves with its table: the table layout places fields; so does a part of a sequence diagram.
      const cells = new Set(
        graph.getSelectionCells().map((cell) => (isTable(cell.getParent()) || isSequencePart(cell) ? cell.getParent()! : cell)),
      )
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
      const selected = selectedLayoutCells()
      // Without a selection, the shapes of the layers shown and not locked; the others stay where they are.
      const cells = selected.length >= 2 ? selected : openChildren().filter((cell) => cell.isVertex())
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
            if (!cell || !isLayer(cell.getParent())) continue
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
        for (let parent = cell.getParent(); parent && !isLayer(parent); parent = parent.getParent()) {
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
    setStatus(status) {
      if (readOnly) return []
      const targets = statusTargets()
      const changed: string[] = []
      if (targets.length === 0) return changed
      // One transaction: one undo step, which brings back the statuses and the marks of who set them.
      document.transact(() => {
        const at = Date.now()
        for (const cell of targets) {
          const id = cell.getId()
          const entry = id ? cells.get(id) : undefined
          if (id && entry && writeStatus(entry, status, author, at)) changed.push(id)
        }
      }, origin)
      if (changed.length > 0) notify()
      return changed
    },
    setPlan(plan) {
      const targets = unlocked(planTargets())
      if (readOnly || destroyed || targets.length === 0) return
      graph.stopEditing(false)
      model.batchUpdate(() => setStyleValue(targets, PLAN_KEY, plan ?? undefined))
    },
    setPlanView(view) {
      if (!destroyed) planView.set(view)
    },
    applyTargetState() {
      if (readOnly || destroyed) return false
      const going: Cell[] = []
      const arrived: Cell[] = []
      const visit = (cell: Cell) => {
        for (const child of cell.getChildren()) {
          const plan = planOf(child.getStyle() as Record<string, unknown>)
          if (plan && isUnlocked(child)) (plan === 'removed' ? going : arrived).push(child)
          // What goes goes with what is in it.
          if (plan !== 'removed') visit(child)
        }
      }
      visit(graph.getDefaultParent())
      if (going.length === 0 && arrived.length === 0) return false
      graph.stopEditing(false)
      model.batchUpdate(() => {
        if (arrived.length > 0) setStyleValue(arrived, PLAN_KEY, undefined)
        if (going.length > 0) graph.removeCells(going, true)
      })
      return true
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
    setTheme(next) {
      if (next === theme) return
      theme = next
      restyle(graph)
    },
    exportSvg({ selectionOnly = false, onlyVisible = false, ...options } = {}) {
      // The analysis is of this canvas: the image has the page without it. With a filter, the image has only what
      // matches, or the page without the filter.
      return impactView.drawn(() => filterView.drawn(onlyVisible ? 'hidden' : 'unfiltered', () => drawImage(selectionOnly, options)))
    },
    showDependencies(cellId, depth = 1) {
      if (destroyed) return false
      impactView.set({ mode: 'dependencies', cellId, depth })
      return impactView.state() !== null
    },
    showPathBetween(from, to) {
      if (destroyed) return false
      const ends: [string, string] | null = from && to ? [from, to] : pathEnds()
      if (!ends) return false
      impactView.set({ mode: 'path', from: ends[0], to: ends[1] })
      return impactView.state() !== null
    },
    clearImpact() {
      if (impactView.state()) impactView.set(null)
    },
    canAnalyze(cellId) {
      return analysable(modelImpactRecords(graph), cellId)
    },
    canShowPath() {
      return pathEnds() !== null
    },
    setFilter(filter) {
      if (destroyed) return
      graph.stopEditing(false)
      filterView.set(isFilterActive(filter) ? filter : null)
      // A hidden cell is not selected.
      graph.setSelectionCells(graph.getSelectionCells().filter((cell) => cell.isVisible()))
    },
    currentFilter: () => filterView.filter(),
    filterChoices(filter) {
      return filterChoices(modelFilterRecords(graph), filter ?? filterView.filter() ?? undefined)
    },
    filterStatus(cellId) {
      const cell = model.getCell(cellId)
      return cell ? filterView.status(cell) : null
    },
    focus() {
      if (!graph.isEditing()) container.focus({ preventScroll: true })
    },
    onContextMenu: (listener) => listen(menuListeners, listener),
    setEdgeMarker(end, marker) {
      const edges = unlocked(selectedEdges())
      if (edges.length === 0) return
      graph.stopEditing(false)
      // The marker and its fill in one change of the model: a hollow triangle is `block` without a fill.
      const changes = markerChanges(marker, end)
      model.batchUpdate(() => edges.forEach((edge) => setStyleKeys(edge, changes)))
    },
    setEdgeRelation(relation) {
      const edges = unlocked(selectedConnectors())
      if (edges.length === 0) return
      graph.stopEditing(false)
      model.batchUpdate(() => {
        for (const edge of edges) {
          const changes = relationChanges(relation, labelOf(edge))
          setStyleKeys(edge, changes.style)
          if (changes.label !== labelOf(edge)) model.setValue(edge, changes.label)
        }
      })
    },
    setColor(target, color) {
      if (target === 'stroke') editor.setPencilLine({ color })
      const cells = unlocked(graph.getSelectionCells()).filter((cell) => target !== 'fill' || cell.isVertex())
      if (cells.length === 0) return
      graph.stopEditing(false)
      graph.setCellStyles(COLOR_KEYS[target], color, cells)
    },
    setFillOpacity(opacity) {
      const shapes = unlocked(graph.getSelectionCells()).filter((cell) => cell.isVertex())
      if (shapes.length === 0 || !Number.isFinite(opacity)) return
      const value = Math.min(100, Math.max(0, Math.round(opacity)))
      graph.stopEditing(false)
      // The default is kept by removing the key, as draw.io does.
      setStyleValue(shapes, 'fillOpacity', value === 100 ? undefined : value)
    },
    setShapeEffects({ shadow, rounded, arcSize, gradient, gradientDirection }) {
      const shapes = unlocked(graph.getSelectionCells()).filter((cell) => cell.isVertex())
      if (shapes.length === 0) return
      const roundable = shapes.filter(canRound)
      graph.stopEditing(false)
      // Default values are kept by removing their keys, as draw.io does.
      model.batchUpdate(() => {
        if (shadow !== undefined) setStyleValue(shapes, 'shadow', shadow ? true : undefined)
        if (rounded !== undefined) {
          setStyleValue(roundable, 'rounded', rounded ? true : undefined)
          if (!rounded) {
            setStyleValue(roundable, 'arcSize', undefined)
            setStyleValue(roundable, 'absoluteArcSize', undefined)
          }
        }
        if (arcSize !== undefined && Number.isFinite(arcSize)) {
          const size = Math.min(MAX_ARC_SIZE, Math.max(MIN_ARC_SIZE, Math.round(arcSize)))
          // The radius means a share of the shorter side for every shape, not pixels for some of them.
          setStyleValue(roundable, 'absoluteArcSize', undefined)
          setStyleValue(roundable, 'arcSize', size === DEFAULT_ARC_SIZE ? undefined : size)
        }
        if (gradient !== undefined) {
          const off = gradient === 'none' || gradient === ''
          setStyleValue(shapes, 'gradientColor', off ? undefined : gradient)
          if (off) setStyleValue(shapes, 'gradientDirection', undefined)
        }
        if (gradientDirection !== undefined) {
          setStyleValue(shapes, 'gradientDirection', gradientDirection === 'south' ? undefined : gradientDirection)
        }
      })
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
    setList(kind) {
      graph.stopEditing(false)
      const selected = unlocked(graph.getSelectionCells()).filter((cell) =>
        cell.isVertex() && !isTable(cell) && !isGridTable(cell) && !isTable(cell.getParent()) && !isSequence(cell) && !isSequencePart(cell),
      )
      model.batchUpdate(() => {
        for (const cell of selected) {
          graph.cellLabelChanged(cell, formatList(String(cell.getValue() ?? ''), kind), false)
          if (kind) setStyleValue([cell], 'align', 'left')
        }
        fitAutoWidth(selected)
      })
    },
    setLineStyle({ width, dash, edgeShape }) {
      editor.setPencilLine({ width, dash })
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
        const edges = cells.filter(isConnector)
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
        if (enabled) {
          setStyleValue(cells, TEXT_WRAP_KEY, undefined)
          setStyleValue(cells, TEXT_FIT_KEY, undefined)
        }
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
            // A shape that keeps its proportions, e.g. an image, changes the other side with the one that was given.
            if (keepsProportions(graph, cell) && geometry.width > 0 && geometry.height > 0) {
              const ratio = geometry.width / geometry.height
              if (width !== undefined && height === undefined) {
                next.height = Math.max(MIN_SHAPE_SIZE, Math.round(next.width / ratio))
              } else if (height !== undefined && width === undefined) {
                next.width = Math.max(MIN_SHAPE_SIZE, Math.round(next.height * ratio))
              }
            }
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
    setRotation(angle) {
      const shapes = graph.getSelectionCells().filter((cell) => graph.isCellRotatable(cell))
      if (shapes.length === 0 || !Number.isFinite(angle)) return
      graph.stopEditing(false)
      rotateShapes(shapes, angle)
    },
    setLink(link) {
      const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
      if (!cell || !isLinkable(cell) || !isUnlocked(cell)) return
      const value = link === null ? undefined : linkOf({ [LINK_KEY]: link })
      if (value === null) return
      graph.stopEditing(false)
      setStyleValue([cell], LINK_KEY, value)
    },
    setEdgeApi(api) {
      const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
      if (!cell?.isEdge() || !isUnlocked(cell)) return
      const previous = edgeApiOf(cell.getStyle())
      const label = typeof cell.getValue() === 'string' ? (cell.getValue() as string) : ''
      graph.stopEditing(false)
      model.batchUpdate(() => {
        setStyleValue([cell], EDGE_API_KEY, api === null ? undefined : writeEdgeApi(api))
        // The label follows the call while nobody wrote one of their own.
        if (api !== null && (label.trim() === '' || (previous !== null && label === apiLabel(previous)))) {
          const next = apiLabel(api)
          if (next !== label) model.setValue(cell, next)
        }
      })
    },
    setElementProperties(cellId, changes) {
      // The panel of properties applies what was typed when it goes away, which may be after the editor did.
      if (destroyed) return
      const cell = model.getCell(cellId)
      if (!cell || propertiesTarget(cell) !== 'shape' || !isUnlocked(cell)) return
      const style = cell.getStyle() as Record<string, unknown>
      const value = String(cell.getValue() ?? '')
      const current = elementProperties(style, value)
      const { showTechnology, icon, ...properties } = changes
      let next = normalizeProperties({ ...current, ...properties })
      const was = labelFormat(style, current.kind)
      const now = labelFormat(style, next.kind)
      // A label of C4 has no lines of its own: those of a plain label become the description, unless it has one, and
      // are kept aside then (see `OWN_LINES_KEY`); a plain label again gets them back.
      const kept = typeof style[OWN_LINES_KEY] === 'string' ? (style[OWN_LINES_KEY] as string) : undefined
      let aside = kept
      if (was === 'plain' && now === 'c4') {
        const lines = ownLines(style, value)
        if (!next.description) next = normalizeProperties({ ...next, description: lines.join('\n') })
        else if (lines.some((line) => line.trim())) aside = lines.join('\n')
      }
      const shown = showsTechnology(style, value)
      // A cell keeps its showing of the technology while its label is of C4, which shows the technology its own way.
      const ownShowing = style[SHOW_TECHNOLOGY_KEY] === true || style[SHOW_TECHNOLOGY_KEY] === 1 || style[SHOW_TECHNOLOGY_KEY] === '1'
      const show = now === 'plain' && (showTechnology ?? (was === 'c4' ? ownShowing : shown))
      const ownIcon = typeof style[ICON_KEY] === 'string' && style[ICON_KEY] !== '' ? (style[ICON_KEY] as string) : null
      const nextIcon = icon === undefined ? ownIcon : icon
      if (sameProperties(current, next) && show === shown && nextIcon === ownIcon) return
      const restored = was === 'c4' && now === 'plain'
      const label = restored
        ? composeLabel(next, style, { showTechnology: show, rest: kept === undefined ? [] : kept.split('\n') })
        : relabel(next, style, value, show)
      if (restored) aside = undefined
      graph.stopEditing(false)
      model.batchUpdate(() => {
        setStyleKeys(cell, {
          // A shape without an element becomes one, named by the cell: two participants make the same one.
          [ELEMENT_KEY]: (style[ELEMENT_KEY] as string | undefined) || cellId,
          ...propertiesStyle(next),
          [SHOW_TECHNOLOGY_KEY]: now === 'c4' ? (style[SHOW_TECHNOLOGY_KEY] as StyleValue | undefined) : show || undefined,
          [OWN_LINES_KEY]: aside,
          [ICON_KEY]: nextIcon ?? undefined,
        })
        if (label !== value) model.setValue(cell, label)
      })
    },
    setEdgeProperties(cellId, changes) {
      if (destroyed) return
      const cell = model.getCell(cellId)
      if (!cell || propertiesTarget(cell) !== 'edge' || !isUnlocked(cell)) return
      const current = edgeProperties(cell.getStyle() as Record<string, unknown>)
      const next: EdgeProperties = {
        technology: propertyLine(changes.technology ?? current.technology, PROPERTY_LIMITS.technology),
        interaction: changes.interaction === undefined ? current.interaction : changes.interaction,
      }
      if (next.technology === current.technology && next.interaction === current.interaction) return
      graph.stopEditing(false)
      model.batchUpdate(() => setStyleKeys(cell, edgePropertiesStyle(next)))
    },
    setLegendItem(cellId, key, changes) {
      // The panel applies a name when it goes away, which may be after the editor did.
      if (readOnly || destroyed) return
      const cell = model.getCell(cellId)
      if (!cell || !isLegend(cell) || !isUnlocked(cell)) return
      const style = cell.getStyle() as Record<string, unknown>
      const settings = legendSettings(style)
      const names = { ...settings.names }
      if (changes.name !== undefined) {
        const name = propertyLine(changes.name, PROPERTY_LIMITS.name)
        if (name) names[key] = name
        else delete names[key]
      }
      const hidden = new Set(settings.hidden)
      if (changes.hidden === true) hidden.add(key)
      if (changes.hidden === false) hidden.delete(key)
      const value = legendSettingsValue({ names, hidden: [...hidden] })
      if (value === (style[LEGEND_KEY] ?? undefined)) return
      graph.stopEditing(false)
      model.batchUpdate(() => setStyleKeys(cell, { [LEGEND_KEY]: value }))
    },
    addLayer() {
      if (destroyed) return null
      graph.stopEditing(false)
      const names = new Set(layers().map((layer) => layerName(layer.getId()!, layer.getValue())))
      let number = layers().length + 1
      while (names.has(`Слой ${number}`)) number++
      const layer = new Cell(`Слой ${number}`)
      model.batchUpdate(() => model.add(model.getRoot()!, layer))
      const id = layer.getId()!
      view.setActive(id)
      notify()
      return id
    },
    renameLayer(layerId, name) {
      // The panel applies a name when it goes away, which may be after the editor did.
      const layer = destroyed ? null : layerCell(layerId)
      const value = propertyLine(name, LAYER_NAME_LIMIT)
      if (!layer || value === String(layer.getValue() ?? '')) return
      model.batchUpdate(() => model.setValue(layer, value))
    },
    moveLayer(layerId, direction) {
      const layer = destroyed ? null : layerCell(layerId)
      const root = model.getRoot()!
      const index = layer ? root.getIndex(layer) + (direction === 'up' ? 1 : -1) : -1
      if (!layer || index < 0 || index >= root.getChildCount()) return
      model.batchUpdate(() => model.add(root, layer, index))
    },
    setLayerLocked(layerId, locked) {
      const layer = destroyed ? null : layerCell(layerId)
      if (!layer || isLockedLayer(layer) === locked) return
      graph.stopEditing(false)
      const lockedBy = participantName?.trim()
      model.batchUpdate(() =>
        setStyleKeys(layer, { [LOCKED_KEY]: locked || undefined, [LOCKED_BY_KEY]: (locked && lockedBy) || undefined }),
      )
    },
    setLayerHidden(layerId, hidden) {
      const layer = destroyed ? null : layerCell(layerId)
      if (!layer) return
      // The participant sees the layer as everybody does from now on.
      view.setVisibility(layerId, undefined)
      if (isHiddenLayerStyle(layer.getStyle()) === hidden) {
        binding.refresh([layerId])
        return
      }
      graph.stopEditing(false)
      model.batchUpdate(() => setStyleKeys(layer, { [HIDDEN_LAYER_KEY]: hidden || undefined }))
    },
    setLayerVisible(layerId, visible) {
      const layer = destroyed ? null : layerCell(layerId)
      if (!layer) return
      // A choice that is what everybody sees is none: the layer follows the visibility for everybody again.
      view.setVisibility(layerId, visible === !isHiddenLayerStyle(layer.getStyle()) ? undefined : visible)
      if (!visible) graph.stopEditing(false)
      binding.refresh([layerId])
      notify()
    },
    setActiveLayer(layerId) {
      if (destroyed || !layerCell(layerId)) return
      view.setActive(layerId)
      notify()
    },
    moveSelectionToLayer(layerId) {
      const target = destroyed ? null : layerCell(layerId)
      if (!target || isLockedLayer(target)) return
      const moving = selectionToMove(target)
      if (moving.length === 0) return
      graph.stopEditing(false)
      // On top of the elements of the layer, in the order they were drawn in.
      model.batchUpdate(() => moving.forEach((cell) => model.add(target, cell)))
    },
    deleteLayer(layerId, moveTo) {
      const layer = destroyed ? null : layerCell(layerId)
      if (!layer || layerId === LAYER_CELL_ID || isLockedLayer(layer)) return
      const content = layer.getChildren()
      const target = moveTo === null ? null : layerCell(moveTo)
      if (content.length > 0) {
        if (moveTo !== null && (!target || target === layer || isLockedLayer(target))) return
        if (moveTo === null && hasLockedDescendant(layer)) return
      }
      graph.stopEditing(false)
      model.batchUpdate(() => {
        if (target) [...content].forEach((cell) => model.add(target, cell))
        // With its elements, and the edges of other layers that end at them.
        if (layer.getChildCount() > 0) graph.removeCells([layer], true)
        else model.remove(layer)
      })
    },
    pasteAsSameElement(at) {
      const copied = clipboard.read()
      if (readOnly || destroyed || !copied) return
      const source = clipboard.source()
      // On another board, or from the clipboard of the system, nothing is the same element.
      pasteCells(copied, at, source?.document === document ? source : null)
    },
    placeElement(source, at) {
      if (readOnly || destroyed) return
      graph.stopEditing(false)
      let added: Cell | null = null
      document.transact(() => {
        let id: string | null
        let sample: CellRef | undefined
        if ('elementId' in source) {
          id = source.elementId
          const uses = elementUses(document).get(id) ?? []
          sample = uses.find((use) => use.pageId === pageId) ?? uses[0]
        } else {
          sample = source.cell
          const sampleCells = getCells(document, sample.pageId)
          const entry = sampleCells.get(sample.cellId)
          // A locked shape does not change: the new cell is an element of its own with the properties of its label.
          if (!entry || isLockedCell(sampleCells, sample.cellId)) id = entry && mayBeElement(sampleCells, sample.cellId) ? newId() : null
          else {
            id = ensureElement(document, sample)
            if (id !== null && author) writeAttribution(entry, author, Date.now())
            if (id !== null && sample.pageId === pageId) binding.refresh([sample.cellId])
          }
        }
        const entry = sample && getCells(document, sample.pageId).get(sample.cellId)
        if (id === null || !entry) return
        const data = readCell(sample!.cellId, entry)
        // The look of the cell, not its lock nor its link; a shape that is no element gives the properties of its label.
        const { [LOCKED_KEY]: _locked, [LOCKED_BY_KEY]: _lockedBy, [LINK_KEY]: _link, ...style } =
          elementIdOf(data.style) === null ? { ...data.style, ...labelPropertiesStyle(data.style, data.value) } : data.style
        const width = data.geometry?.width ?? 120
        const height = data.geometry?.height ?? 60
        const snap = (value: number) => graph.snap(value)
        added = graph.insertVertex({
          parent: graph.getDefaultParent(),
          value: data.value,
          position: [snap(at.x - width / 2), snap(at.y - height / 2)],
          size: [width, height],
          style: { ...style, [ELEMENT_KEY]: id } as CellStyle,
        })
      }, origin)
      if (!added) return
      graph.setSelectionCell(added)
      container.focus({ preventScroll: true })
    },
    setModelField(cellId, field, value) {
      // The panel applies what was typed when it goes away, which may be after the editor did.
      if (readOnly || destroyed) return
      const cell = model.getCell(cellId)
      if (!cell || propertiesTarget(cell) !== 'shape' || !isUnlocked(cell)) return
      graph.stopEditing(false)
      let changed = false
      document.transact(() => {
        // A shape without an element becomes one, as a change of its properties makes it.
        const id = ensureElement(document, { pageId, cellId })
        changed = id !== null && writeModelField(document, id, field, value)
        if (changed && author) writeAttribution(cells.get(cellId)!, author, Date.now())
      }, origin)
      binding.refresh([cellId])
      if (changed) notify()
    },
    setViewRule(rule) {
      if (readOnly || destroyed) return
      graph.stopEditing(false)
      document.transact(() => writeViewRule(document, pageId, rule), origin)
    },
    showOnView(keys) {
      if (readOnly || destroyed) return
      document.transact(() => showOnView(document, pageId, keys === 'all' ? 'all' : [...keys]), origin)
    },
    detachView() {
      if (readOnly || destroyed) return
      graph.stopEditing(false)
      let changed: string[] = []
      document.transact(() => {
        changed = detachPageView(document, pageId)
      }, origin)
      binding.refresh(changed)
      notify()
    },
    selectedElement() {
      const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
      if (!cell || propertiesTarget(cell) !== 'shape') return null
      const style = cell.getStyle() as Record<string, unknown>
      const elementId = elementIdOf(style)
      return {
        cellId: cell.getId()!,
        elementId,
        properties: elementProperties(style, String(cell.getValue() ?? '')),
        places: elementId === null ? [] : elementPlaces(document, elementId),
        canChange: !readOnly && isUnlocked(cell),
      }
    },
    mergeCandidates() {
      return selectedElements().map((cell) => {
        const style = cell.getStyle() as Record<string, unknown>
        const elementId = elementIdOf(style)
        return {
          cellId: cell.getId()!,
          elementId,
          properties: elementProperties(style, String(cell.getValue() ?? '')),
          pages: elementId === null ? 1 : Math.max(1, elementPlaces(document, elementId).length),
        }
      })
    },
    mergeElements(keepCellId) {
      if (readOnly || destroyed || selectedElements().length < 2) return
      const refs = mergeableCells().map((cell) => ({ pageId, cellId: cell.getId()! }))
      if (!refs.some((ref) => ref.cellId === keepCellId)) return
      mergeCells(refs, { pageId, cellId: keepCellId })
    },
    mergeElementCells(refs, keep) {
      if (readOnly || destroyed) return false
      const usable = refs.filter((ref) => {
        const pageCells = getCells(document, ref.pageId)
        return mayBeElement(pageCells, ref.cellId) && !isLockedCell(pageCells, ref.cellId)
      })
      if (usable.length < 2 || !usable.some((ref) => ref.pageId === keep.pageId && ref.cellId === keep.cellId)) return false
      return mergeCells(usable, keep)
    },
    detailOffer(cellId) {
      return detailOffer(cellId)
    },
    detailElement(cellId) {
      const offer = detailOffer(cellId)
      if (offer === 'open') return detailPageOf(document, { pageId, cellId })
      if (offer !== 'create' || destroyed) return null
      graph.stopEditing(false)
      let created: { pageId: string; changed: string[] } | null = null
      document.transact(() => {
        created = createDetailPage(document, { pageId, cellId }, author)
      }, origin)
      if (created === null) return null
      const { pageId: detail, changed } = created
      binding.refresh(changed)
      return detail
    },
    detachElement(cellId) {
      if (readOnly || destroyed) return
      const cell = model.getCell(cellId)
      if (!cell || propertiesTarget(cell) !== 'shape' || !isUnlocked(cell)) return
      graph.stopEditing(false)
      document.transact(() => {
        if (detachCell(document, { pageId, cellId }) !== null && author) writeAttribution(cells.get(cellId)!, author, Date.now())
      }, origin)
      binding.refresh([cellId])
    },
    deleteElementEverywhere(cellId) {
      if (readOnly || destroyed) return
      const cell = model.getCell(cellId)
      const id = cell ? elementIdOf(cell.getStyle() as Record<string, unknown>) : null
      if (!cell || id === null || propertiesTarget(cell) !== 'shape' || !isUnlocked(cell)) return
      graph.stopEditing(false)
      let removed: CellRef[] = []
      document.transact(() => {
        removed = removeElementCells(document, id)
      }, origin)
      binding.refresh(removed.filter((ref) => ref.pageId === pageId).map((ref) => ref.cellId))
    },
    getLinks() {
      pageLinks ??= findLinks()
      return pageLinks
    },
    onLinkOpen: (listener) => listen(linkListeners, listener),
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
      const { x, y, width, height } = rotatedBounds(state, rotationOf(state.style))
      return { x: x - container.scrollLeft, y: y - container.scrollTop, width, height }
    },
    edgePoints(id) {
      const cell = model.getCell(id)
      const points = cell?.isEdge() ? graph.getView().getState(cell)?.absolutePoints : null
      if (!points || points.length < 2 || points.some((point) => !point)) return null
      return points.map((point) => ({ x: point!.x - container.scrollLeft, y: point!.y - container.scrollTop }))
    },
    viewportSize: () => ({ width: container.clientWidth, height: container.clientHeight }),
    visibleArea() {
      const { scale, translate } = graph.getView()
      return {
        x: container.scrollLeft / scale - translate.x,
        y: container.scrollTop / scale - translate.y,
        width: container.clientWidth / scale,
        height: container.clientHeight / scale,
      }
    },
    pageSketch() {
      if (sketch?.version !== drawingVersion) {
        sketch = { version: drawingVersion, sketch: sketchPage(graph, (cell) => filterView.status(cell) !== null) }
      }
      return sketch.sketch
    },
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
      if (!cell || !(cell.isVertex() || cell.isEdge())) return false
      // An element of a layer hidden on this canvas shows its layer, and an edge the layers of its ends, for the participant.
      const ends = cell.isEdge() ? [cell.getTerminal(true), cell.getTerminal(false)] : []
      for (const layer of new Set([cell, ...ends].map((end) => layerOf(model, end)))) {
        if (layer && !layer.isVisible()) editor.setLayerVisible(layer.getId()!, true)
      }
      const state = graph.getView().getState(cell)
      if (!state) return false
      graph.stopEditing(false)
      // An element of a locked layer is shown without being selected.
      if (graph.isCellSelectable(cell)) graph.setSelectionCell(cell)
      else graph.clearSelection()
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
    setPencil(on) {
      if (on) setTool('pencil')
      else if (tool === 'pencil') setTool(null)
    },
    setPencilLine({ color, width, dash }) {
      const changes: Partial<PencilLine> = {}
      if (color !== undefined && color !== 'none') changes.color = color
      if (width !== undefined && Number.isFinite(width)) {
        changes.width = Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, width))
      }
      if (dash !== undefined) changes.dash = dash
      if (pencilLine.set(changes)) notify()
    },
    selectedCellIds,
    onSelectionChange: (listener) => listen(selectionListeners, listener),
    onViewChange: (listener) => listen(viewListeners, listener),
    getViewVersion: () => viewVersion,
    getEditing: () => editing,
    onEditingChange: (listener) => listen(editingListeners, listener),
    undo() {
      graph.stopEditing(false)
      undoManager.undo()
      dropCellsOfMissingPages(document)
    },
    redo() {
      graph.stopEditing(false)
      undoManager.redo()
      dropCellsOfMissingPages(document)
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
      // The graph releases the label editor but keeps its cell, so a pending resize of it would stop editing later. A new
      // part being edited stays: the page of its board may only change.
      newCell = null
      graph.stopEditing(true)
      Reflect.deleteProperty(container, EDITOR_PROPERTY)
      container.removeEventListener('pointerdown', focusCanvas, true)
      container.removeEventListener('contextmenu', preventBrowserMenu)
      container.removeEventListener('pointermove', handlePointerMove, true)
      container.removeEventListener('pointerleave', handlePointerLeave)
      endLaserStroke()
      stopPencilStroke()
      container.removeEventListener('pointerdown', pressWithTool, true)
      container.removeEventListener('pointerup', placeComment, true)
      for (const type of TOOL_STOPPED_EVENTS) container.removeEventListener(type, stopForTool, true)
      container.removeEventListener('pointerdown', pressLink, true)
      container.removeEventListener('pointerup', releaseLink, true)
      for (const type of LINK_STOPPED_EVENTS) container.removeEventListener(type, stopLinkClick, true)
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
      graph.removeListener(handleDoubleClick)
      model.removeListener(fitTexts)
      model.removeListener(redrawTables)
      model.removeListener(handleRemoteLabel)
      model.removeListener(handleLayerChanges)
      unwatchTableRows()
      unconfigureSequences()
      unconfigureLegends()
      iconBadges.destroy()
      planView.destroy()
      impactView.destroy()
      filterView.destroy()
      unwatchLocks()
      graph.removeListener(handleResize)
      model.removeListener(notifyView)
      model.removeListener(handleDrawingChange)
      model.removeListener(notify)
      model.removeListener(forgetLinks)
      cells.unobserveDeep(handleAttribution)
      cells.unobserveDeep(handleTextAuthors)
      cells.unobserveDeep(handleStatuses)
      layoutManager.destroy()
      listeners.clear()
      pointerListeners.clear()
      laserListeners.clear()
      commentListeners.clear()
      selectionListeners.clear()
      menuListeners.clear()
      viewListeners.clear()
      editingListeners.clear()
      linkListeners.clear()
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

/** A flag of draw.io in any of its spellings: it writes 1, CoDraw keeps `true`. */
const isOn = (value: unknown) => value === true || value === 1 || value === '1'

/** The second color of the gradient of a shape, `none` without one; draw.io writes `none` and `default` too. */
function gradientOf(cell: Cell): string {
  const color = cell.getStyle().gradientColor
  return typeof color === 'string' && color !== '' && color !== 'default' ? color : 'none'
}

const GRADIENT_DIRECTIONS: readonly GradientDirection[] = ['south', 'north', 'east', 'west']

/** Where the gradient of a shape goes, `null` without a gradient; draw.io goes from the top down without the key. */
function gradientDirectionOf(cell: Cell): GradientDirection | null {
  if (gradientOf(cell) === 'none') return null
  const direction = cell.getStyle().gradientDirection
  return GRADIENT_DIRECTIONS.find((value) => value === direction) ?? 'south'
}

/** The radius of the rounded corners of a shape in percent, `null` when it is in pixels; see {@link DEFAULT_ARC_SIZE}. */
function arcSizeOf(cell: Cell): number | null {
  const style = cell.getStyle()
  if (isOn(style.absoluteArcSize)) return null
  const size = Number(style.arcSize ?? DEFAULT_ARC_SIZE)
  return Number.isFinite(size) ? size : DEFAULT_ARC_SIZE
}

/** Opacity of the fill of a shape, 0–100; draw.io stores it as `fillOpacity`, opaque without it. */
function fillOpacityOf(cell: Cell): number {
  const opacity = Number(cell.getStyle().fillOpacity ?? 100)
  return Number.isFinite(opacity) ? Math.min(100, Math.max(0, opacity)) : 100
}

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

/** The edge is a line drawn by hand with the pencil. */
function isFreehand(cell: Cell): boolean {
  return cell.isEdge() && isFreehandStyle(cell.getStyle())
}

/**
 * Which properties a cell has: a shape that may be an element (not a table nor its row, a group, a label of an edge,
 * nor what {@link canBeElement} leaves out) those of an element, an edge not drawn by hand those of an edge.
 */
function propertiesTarget(cell: Cell): 'shape' | 'edge' | null {
  if (cell.isEdge()) return isFreehand(cell) ? null : 'edge'
  if (!cell.isVertex() || cell.getParent()?.isEdge() || isTable(cell) || isTable(cell.getParent()) || isGroup(cell)) return null
  if (isSequence(cell) || isSequencePart(cell)) return null
  return canBeElement(cell.getStyle() as Record<string, unknown>) ? 'shape' : null
}

/** Takes the mark of a cell computed by a view off a copy and its descendants: whoever pastes it draws it. */
function forgetComputed(cell: Cell) {
  const style = cell.getStyle() as Record<string, unknown>
  if (COMPUTED_KEY in style) {
    const { [COMPUTED_KEY]: _computed, ...rest } = style
    cell.setStyle(rest as CellStyle)
  }
  cell.getChildren().forEach(forgetComputed)
}

/** While set, clones keep the elements of the cells they copy: those of the clipboard, and the cells of the same elements. */
let keepingElements = false

/** Runs `run` with clones that keep the elements of the cells they copy (see {@link renewElements}). */
function keepElements<T>(run: () => T): T {
  const previous = keepingElements
  keepingElements = true
  try {
    return run()
  } finally {
    keepingElements = previous
  }
}

/** Calls `visit` with each cell of `originals` and its clone in `clones`, the cells inside them too. */
function pairCells(originals: readonly (Cell | null)[], clones: readonly (Cell | null)[], visit: (original: Cell, clone: Cell) => void) {
  originals.forEach((original, index) => {
    const clone = clones[index]
    if (!original || !clone) return
    visit(original, clone)
    pairCells(original.getChildren(), clone.getChildren(), visit)
  })
}

/**
 * Gives a copy of cells new elements: the copy and the cells in it that name an element name a new one, the same one
 * for the cells of one element (`renewed`, by the element copied), and the properties they carry as style keys become
 * its properties once the copy is added.
 */
function renewElements(cell: Cell, renewed: Map<string, string>) {
  const style = cell.getStyle() as Record<string, unknown>
  const id = style[ELEMENT_KEY]
  if (typeof id === 'string') {
    if (!renewed.has(id)) renewed.set(id, newId())
    cell.setStyle({ ...style, [ELEMENT_KEY]: renewed.get(id)! } as CellStyle)
  }
  cell.getChildren().forEach((child) => renewElements(child, renewed))
}

/**
 * Removes the cells of pages that the board no longer has, which an undo of a change of several pages may bring back
 * after one of them was deleted; nothing would show them. No history tracks it.
 */
function dropCellsOfMissingPages(doc: Y.Doc) {
  const pages = getPages(doc)
  const orphans = [...doc.share.keys()]
    .filter((name) => name.startsWith('cells:') && !pages.has(name.slice('cells:'.length)))
    .map((name) => doc.getMap(name))
    .filter((cells) => cells.size > 0)
  if (orphans.length === 0) return
  doc.transact(() => orphans.forEach((cells) => cells.clear()), RELABEL_ORIGIN)
}

/** The style keys of the properties that the label of a shape that is no element tells. */
function labelPropertiesStyle(style: Record<string, StyleValue>, value: string): Record<string, StyleValue> {
  return Object.fromEntries(
    Object.entries(propertiesStyle(elementProperties(style, value))).filter((entry): entry is [string, StyleValue] => entry[1] !== undefined),
  )
}

/** An edge that connects, or may connect, shapes: not a line drawn by hand, which has no ends and no shape of an edge. */
function isConnector(cell: Cell): boolean {
  return cell.isEdge() && !isFreehandStyle(cell.getStyle())
}

/**
 * The style of a line drawn by hand: an edge of draw.io without markers, curved through its points, with the color, the
 * width (1, the default, without the key) and the dash of the pencil.
 */
function freehandStyle({ color, width, dash }: PencilLine): CellStyle {
  return {
    [FREEHAND_KEY]: true,
    edgeStyle: 'none',
    curved: true,
    endArrow: 'none',
    strokeColor: color,
    ...(width !== MIN_LINE_WIDTH && { strokeWidth: width }),
    ...(dash !== 'solid' && { dashed: true }),
    ...(dash === 'dotted' && { dashPattern: DOTTED_PATTERN }),
  } as CellStyle
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

/**
 * A shape with a size of its own: not a field, which its table places, nor a part of a sequence diagram, which its
 * diagram places, nor a label of an edge.
 */
function isFreeShape(cell: Cell): boolean {
  return (
    cell.isVertex() && !isTable(cell.getParent()) && !isSequencePart(cell) && cell.getGeometry() !== null && !cell.getGeometry()!.relative
  )
}

/**
 * An element that may have a link: a shape with a size of its own, a table, a group or an edge, but not a field or an
 * index, which are rows of their table, nor a label of an edge of draw.io, which is a part of its edge.
 */
function isLinkable(cell: Cell): boolean {
  return cell.isEdge() || isFreeShape(cell)
}

/**
 * A shape that turns: a shape with a size of its own and without shapes inside, so neither a table, which lays out its
 * fields in its box, nor a group or a container of draw.io.
 */
function isRotatableShape(cell: Cell): boolean {
  return isFreeShape(cell) && !isTable(cell) && !cell.getChildren().some((child) => child.isVertex())
}

/** A shape that keeps its proportions when resized, as draw.io marks it: `aspect=fixed`, e.g. an image. */
function keepsProportions(graph: Pick<Graph, 'getCellStyle'>, cell: Cell): boolean {
  return graph.getCellStyle(cell).aspect === 'fixed'
}

/** A sticky: a shape added as one, or one whose text fits it (see {@link isStickyStyle}). */
function isSticky(cell: Cell): boolean {
  return cell.isVertex() && isStickyStyle(cell.getStyle())
}

/** Keys of the style that lay the text of a shape out, and so change the size that fits it. */
const FIT_STYLE_KEYS = [
  TEXT_FIT_KEY,
  TEXT_WRAP_KEY,
  AUTO_WIDTH_KEY,
  'fontFamily',
  'fontStyle',
  'spacing',
  'spacingTop',
  'spacingBottom',
  'spacingLeft',
  'spacingRight',
] as const

/** A change of a style changed a key, which maxGraph does not type for every key. */
function changedKey({ previous, style }: StyleChange, key: string): boolean {
  return (previous as Record<string, unknown> | null)?.[key] !== (style as Record<string, unknown> | null)?.[key]
}

/** The geometry changed its size, not only its place. */
function resized(previous: Geometry | null, geometry: Geometry | null): boolean {
  return previous?.width !== geometry?.width || previous?.height !== geometry?.height
}

/** A shape whose text size fits it: one whose words may wrap, with fitting on and auto width off. */
function fitsText(graph: Graph, cell: Cell): boolean {
  return allowsTextWrap(graph, cell) && hasTextFit(cell.getStyle())
}

/**
 * A shape whose words may wrap: one that allows auto width, but not a table, whose name and fields are a line each, nor
 * a sequence diagram, whose title is.
 */
function allowsTextWrap(graph: Graph, cell: Cell): boolean {
  return (
    isFreeShape(cell) && !isTable(cell) && !isSequence(cell) && !isLegend(cell) && allowsAutoWidth(graph.getCellStyle(cell) as ShapeStyle)
  )
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
  if (!cell?.isVertex() || cell.getChildCount() === 0 || isTable(cell) || isSequence(cell)) return false
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
  // The table is selected by its header instead, and a sequence diagram by its empty space.
  handler.isPropagateSelectionCell = (cell, immediate, me) =>
    !isTable(cell.getParent()) && !isSequencePart(cell) && propagate(cell, immediate, me)
}

/**
 * The selection frame selects what it touches of `selectable` elements of the page, as on the desktop of Windows; see
 * {@link touchedByRegion}.
 */
function configureRegionSelection(graph: Graph, selectable: () => Cell[]) {
  const rubberBand = graph.getPlugin<RubberBandHandler>('RubberBandHandler')
  // The frame is translucent through its stylesheet; the opacity of maxGraph would fade its border as well.
  if (rubberBand) rubberBand.defaultOpacity = 100
  graph.selectRegion = (region, event) => {
    const view = graph.getView()
    const cells = selectable()
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

/**
 * Shapes turn when {@link isRotatableShape} says so, unless they are locked (see {@link configureLocks}) or the
 * participant may only view, and a selected one that turns has a handle that turns it by `rotate`; see
 * {@link ShapeHandler}.
 */
function configureRotation(graph: Graph, rotate: (cell: Cell, angle: number) => void) {
  const isCellRotatable = graph.isCellRotatable.bind(graph)
  // A participant who may only view has every cell locked.
  graph.isCellRotatable = (cell) => isCellRotatable(cell) && isRotatableShape(cell) && !graph.isCellsLocked()
  graph.createVertexHandler = (state) => new ShapeHandler(state, rotate)
}

/**
 * Handles of a selected shape, with a handle out of its top-left corner that turns the shape if it turns: the arrows of
 * quick connect are at the middles of the sides, and the badge of comments at the top-right corner. Dragging the handle
 * turns the frame of the selection around the centre of the shape in steps of {@link ROTATION_STEP}°, or of 1° while
 * Alt is held, which frees moving from the grid as well (a press with Alt starts the selection frame, as in draw.io);
 * releasing it turns the shape through `rotate`, in the change of the model that maxGraph makes of it.
 */
class ShapeHandler extends VertexHandler {
  private readonly rotate: (cell: Cell, angle: number) => void
  /** Alt is down while the handle is dragged. */
  private freeRotation = false

  constructor(state: CellState, rotate: (cell: Cell, angle: number) => void) {
    super(state)
    this.rotate = rotate
    // One step at any distance from the centre, instead of the steps of maxGraph that get finer away from it.
    this.rotationRaster = false
    this.rotationShape?.setCursor(ROTATION_CURSOR)
  }

  protected override isRotationEnabled() {
    return true
  }

  override createSizerShape(bounds: Rectangle, index: number, fillColor?: string) {
    if (index !== InternalEvent.ROTATION_HANDLE) return super.createSizerShape(bounds, index, fillColor)
    const { width, height, src } = ROTATION_ICON
    const icon = new ImageShape(new Rectangle(bounds.x, bounds.y, width, height), src)
    icon.preserveImageAspect = false
    return icon
  }

  override getRotationHandlePosition() {
    return new GraphPoint(this.bounds.x - ROTATION_HANDLE_OFFSET, this.bounds.y - ROTATION_HANDLE_OFFSET)
  }

  override start(x: number, y: number, index: number) {
    const rotating = index === InternalEvent.ROTATION_HANDLE
    // While the shape turns, the live preview of maxGraph hides the handles, which would stay where they were, and only
    // the frame of the selection turns; resizing keeps its own preview.
    this.livePreview = rotating
    super.start(x, y, index)
    if (!rotating) return
    // maxGraph measures the angle of handles right of the centre only; this one is measured as the pointer is:
    // clockwise from straight up.
    const handle = this.getRotationHandlePosition()
    const angle = Math.atan2(handle.x - this.state.getCenterX(), this.state.getCenterY() - handle.y)
    this.startAngle = (angle * 180) / Math.PI
  }

  // Shift keeps the proportions of a shape while it is resized; a shape that keeps them anyway, e.g. an image, is freed.
  override isConstrainedEvent(me: InternalMouseEvent) {
    const shift = eventUtils.isShiftDown(me.getEvent())
    return keepsProportions(this.graph, this.state.cell) ? !shift : shift
  }

  override rotateVertex(me: InternalMouseEvent) {
    this.freeRotation = !this.graph.isGridEnabledEvent(me.getEvent())
    super.rotateVertex(me)
  }

  override roundAngle(angle: number) {
    const step = this.freeRotation ? 1 : ROTATION_STEP
    return Math.round(angle / step) * step
  }

  override rotateCell(cell: Cell, angle: number) {
    this.rotate(cell, angle)
  }
}

/**
 * Lines drawn by hand: a selected one shows its outline without handles (see {@link FreehandHandler}), and one without
 * ends is valid, so that maxGraph clones it when it is copied, pasted or duplicated; dangling edges are not allowed
 * otherwise.
 */
function configureFreehand(graph: Graph) {
  const createEdgeHandler = graph.createEdgeHandler.bind(graph)
  graph.createEdgeHandler = (state, edgeStyle) =>
    isFreehand(state.cell) ? new FreehandHandler(state) : createEdgeHandler(state, edgeStyle)
  const getEdgeValidationError = graph.getEdgeValidationError.bind(graph)
  graph.getEdgeValidationError = (edge, source, target) =>
    edge && isFreehand(edge) && !source && !target ? null : getEdgeValidationError(edge, source, target)
}

/**
 * The handles of a selected line drawn by hand: only its dashed outline. A handle at each of its many bends would hide
 * it, and dragging one would break it; the line moves as a whole, with the selection handler.
 */
class FreehandHandler extends EdgeHandler {
  override isHandleVisible(_index: number) {
    return false
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
  const insertEdge = handler.insertEdge.bind(handler)
  handler.insertEdge = (parent, id, value, source, target, style) => {
    const association = isAssociationPair(source?.getStyle() ?? null, target?.getStyle() ?? null)
    return insertEdge(parent, id, value, source, target, association ? { ...style, ...ASSOCIATION_STYLE } : style)
  }
}

/** A new edge between an actor and a use case: an association of UML, a line without markers. */
const ASSOCIATION_STYLE: CellStyle = { endArrow: 'none' }

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
    // maxGraph leaves no clone of an edge that would be invalid without its ends. A copy is drawn: no view computed it.
    clones.forEach((clone) => clone && unlockCopy(clone))
    clones.forEach((clone) => clone && forgetComputed(clone))
    // A copy is an element of its own, unless it is to be a cell of the same element (see `keepElements`); the copies of
    // the cells of one element are cells of one new element.
    const renewed = new Map<string, string>()
    if (!keepingElements) clones.forEach((clone) => clone && renewElements(clone, renewed))
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
 * The label of a shape of an element that is written on the canvas changes its properties (see
 * {@link propertiesOfLabel}): of C4 the name, the type, the technology and the description, plain the name and the
 * technology on the second line. The label is then made of them again, in the same change of the model.
 */
function configureElementLabels(graph: Graph) {
  const cellLabelChanged = graph.cellLabelChanged.bind(graph)
  graph.cellLabelChanged = (cell, value, autoSize) => {
    const style = cell.getStyle() as Record<string, unknown>
    if (!hasElement(style) || propertiesTarget(cell) !== 'shape') return cellLabelChanged(cell, value, autoSize)
    const text = String(value ?? '')
    const before = String(cell.getValue() ?? '')
    const current = elementProperties(style, before)
    const { properties, showTechnology, rest } = propertiesOfLabel(text, current, style, showsTechnology(style, before))
    const plain = labelFormat(style, properties.kind) === 'plain'
    const label = composeLabel(properties, style, { showTechnology, rest })
    const model = graph.getDataModel()
    model.batchUpdate(() => {
      const next: Record<string, unknown> = { ...style, ...propertiesStyle(properties), [SHOW_TECHNOLOGY_KEY]: (plain && showTechnology) || undefined }
      for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
      model.setStyle(cell, next as CellStyle)
      cellLabelChanged(cell, label, autoSize)
    })
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

/**
 * Draws the page for the theme of the canvas that `theme` tells: on the dark canvas the black lines and text that lie on
 * the canvas are drawn light, see {@link darkCanvasStyle}. Only the drawing changes: the document, the colors that the
 * toolbar shows (the style of the cell with the defaults of the stylesheet) and images of the page keep the colors of the
 * diagram.
 */
function configureCanvasTheme(graph: Graph, theme: () => CanvasTheme) {
  const getCellStyle = graph.getCellStyle.bind(graph)
  const view = graph.getView()
  /** No shape that holds the cell, e.g. a table, fills the area under it. */
  const onCanvas = (cell: Cell) => {
    for (let parent = cell.getParent(); parent?.isVertex(); parent = parent.getParent()) {
      if (coversChildren(view.getState(parent)?.style ?? getCellStyle(parent))) return false
    }
    return true
  }
  graph.getCellStyle = (cell) => {
    const style = getCellStyle(cell)
    return theme() === 'dark' ? darkCanvasStyle(style, cell.isEdge(), onCanvas(cell)) : style
  }
}

/** Draws every cell of the page again with its style computed anew, e.g. for another theme of the canvas. */
function restyle(graph: Graph) {
  const view = graph.getView()
  for (const state of view.getStates().values()) state.invalidStyle = true
  view.invalidate()
  view.validate()
}

function configureStyles(graph: Graph) {
  const stylesheet = graph.getStylesheet()
  Object.assign(stylesheet.getDefaultVertexStyle(), {
    fillColor: DEFAULT_FILL_COLOR,
    strokeColor: DEFAULT_LINE_COLOR,
    fontColor: DEFAULT_LINE_COLOR,
    fontSize: 13,
    // A gradient without a direction goes from the top down, as in draw.io; maxGraph would draw it from the left.
    gradientDirection: 'south',
  })
  Object.assign(stylesheet.getDefaultEdgeStyle(), {
    edgeStyle: 'orthogonalEdgeStyle',
    strokeColor: DEFAULT_LINE_COLOR,
    fontColor: DEFAULT_LINE_COLOR,
    endArrow: DEFAULT_END_ARROW,
  })
}
