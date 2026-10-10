import {
  Cell,
  Geometry,
  GraphLayout,
  InternalEvent,
  SelectionHandler,
  Shape,
  ShapeRegistry,
  type AbstractCanvas2D,
  type AbstractGraph,
  type CellStyle,
  type EventObject,
  type Graph,
} from '@maxgraph/core'
import { parseMessageLine } from '../mermaid/sequenceMermaid.ts'
import { createCell } from './binding.ts'
import { newId } from './ids.ts'
import { sequenceShapeMessages as m } from './sequenceShapes.messages.ts'
import { compareCells, type CellData } from './model.ts'
import {
  ACTIVATE_KEY,
  conditionLabel,
  DEACTIVATE_KEY,
  FROM_KEY,
  frameOwners,
  isSequenceStyle,
  messageLabel,
  PARTICIPANT_KIND_KEY,
  participantStyle,
  readSequence,
  SEQUENCE_SHAPE,
  sequencePartOf,
  titleLabel,
  TO_KEY,
  ARROW_KEY,
  PARTICIPANT_KEY,
  type PartRecord,
  type SequenceDiagram,
  type SequencePart,
} from './sequence.ts'
import {
  BAR_WIDTH,
  FRAME_HEADER,
  layoutSequence,
  SELF_LABEL_X,
  SELF_WIDTH,
  TAB_HEIGHT,
  type SequenceLayout,
} from './sequenceLayout.ts'
import { measureLabel } from './textMeasure.ts'

/**
 * Sequence diagrams on the canvas: the shapes of their parts, which are set when a part is drawn and never stored, the
 * layout that places the parts in their diagram (see `sequenceLayout.ts`) and the hooks of the graph that keep the
 * parts in their diagram: they connect to nothing, take no handles and turn not.
 */

/** Shapes of the parts of a diagram; the diagram has {@link SEQUENCE_SHAPE}. */
const PART_SHAPES: Record<SequencePart, string> = {
  participant: 'codraw.seqParticipant',
  message: 'codraw.seqMessage',
  note: 'codraw.seqNote',
  frame: 'codraw.seqFrame',
  else: 'codraw.seqBranch',
  end: 'codraw.seqEnd',
}

/** A cell of a sequence diagram. */
export function isSequence(cell: Cell | null | undefined): boolean {
  return cell?.isVertex() === true && isSequenceStyle(cell.getStyle() as Record<string, unknown>)
}

/** What a part of a diagram is; `null` for any other cell. */
export function partOf(cell: Cell | null | undefined): SequencePart | null {
  if (!cell?.isVertex() || !isSequence(cell.getParent())) return null
  return sequencePartOf(cell.getStyle() as Record<string, unknown>)
}

/** A participant, a row or another part of a sequence diagram. */
export const isSequencePart = (cell: Cell | null | undefined) => partOf(cell) !== null

/** The diagram of a cell: the cell itself, or the diagram it is a part of; `null` for other cells. */
export function sequenceOf(cell: Cell | null | undefined): Cell | null {
  if (isSequence(cell)) return cell!
  return isSequencePart(cell) ? cell!.getParent() : null
}

const record = (cell: Cell): PartRecord => ({
  id: cell.getId() ?? '',
  value: String(cell.getValue() ?? ''),
  style: cell.getStyle() as Record<string, unknown>,
})

/** The diagram of a cell of a sequence diagram, read from its children in their order. */
export function graphSequence(diagram: Cell): SequenceDiagram {
  return readSequence(record(diagram), diagram.getChildren().filter((child) => child.isVertex()).map(record))
}

/**
 * The cells to remove with `cells`: the messages of a removed participant and the notes over it, and the branches and the
 * end of a removed frame. Their rows go with them; a frame keeps its rows.
 */
export function withDependentParts(cells: Cell[]): Cell[] {
  const removed = new Set(cells)
  for (const cell of cells) {
    const part = partOf(cell)
    const diagram = cell.getParent()
    if (!diagram || (part !== 'participant' && part !== 'frame')) continue
    if (part === 'participant') {
      const key = String(cell.getStyle()[PARTICIPANT_KEY as keyof CellStyle] ?? '')
      for (const child of diagram.getChildren()) {
        const style = child.getStyle() as Record<string, unknown>
        const kind = partOf(child)
        if ((kind === 'message' || kind === 'note') && (style[FROM_KEY] === key || style[TO_KEY] === key)) removed.add(child)
      }
    } else {
      const owners = frameOwners(graphSequence(diagram))
      for (const child of diagram.getChildren()) if (owners.get(child.getId() ?? '')?.id === cell.getId()) removed.add(child)
    }
  }
  return [...removed]
}

/** The cell of a diagram with its parts inside it in their order, from their data, e.g. of {@link sequenceCells}. */
export function diagramCell(data: CellData[]): Cell {
  const [diagram, ...parts] = data
  const cell = createCell(diagram!)
  for (const part of [...parts].sort(compareCells)) cell.insert(createCell(part))
  return cell
}

/** The last layout of each diagram, which its parts are drawn with. */
const layouts = new WeakMap<Cell, SequenceLayout>()

/** The layout of a diagram: the one its layout made last, or a new one. */
export function sequenceLayoutOf(diagram: Cell): SequenceLayout {
  let layout = layouts.get(diagram)
  if (!layout) {
    layout = layoutSequence(graphSequence(diagram), measureLabel)
    layouts.set(diagram, layout)
  }
  return layout
}

/** The box of a part in the layout of its diagram. */
const boxOf = (layout: SequenceLayout, id: string) => layout.participants.get(id)?.box ?? layout.steps.get(id)?.box ?? null

/**
 * Places the parts of a sequence diagram where {@link layoutSequence} puts them, and sizes the diagram around them.
 * Dragging a participant moves it among the participants to where it was dropped, a message or a note among the rows.
 */
export class SequenceDiagramLayout extends GraphLayout {
  // The parts cannot be moved by the participant other than by dragging, which this layout turns into their order.
  override isVertexMovable(_cell: Cell) {
    return true
  }

  override execute(parent: Cell) {
    const layout = layoutSequence(graphSequence(parent), measureLabel)
    layouts.set(parent, layout)
    const model = this.graph.getDataModel()
    model.batchUpdate(() => {
      for (const child of parent.getChildren()) {
        const box = boxOf(layout, child.getId() ?? '')
        if (box && partOf(child)) setBox(model, child, box.x, box.y, box.width, box.height)
      }
      const geometry = parent.getGeometry()
      if (geometry) setBox(model, parent, geometry.x, geometry.y, layout.width, layout.height)
    })
  }

  override moveCell(cell: Cell, x: number, y: number) {
    const parent = cell.getParent()
    const part = partOf(cell)
    const state = parent ? this.graph.getView().getState(parent) : null
    if (!parent || !state || (part !== 'participant' && part !== 'message' && part !== 'note')) return
    const scale = this.graph.getView().scale
    const layout = sequenceLayoutOf(parent)
    const children = parent.getChildren()
    let target: Cell | null = null
    let last: Cell | null = null
    if (part === 'participant') {
      const dropped = (x - state.x) / scale
      for (const child of children) {
        if (child === cell || partOf(child) !== 'participant') continue
        const center = layout.participants.get(child.getId() ?? '')?.center ?? 0
        if (center > dropped) {
          target = child
          break
        }
        last = child
      }
    } else {
      const dropped = (y - state.y) / scale
      for (const child of children) {
        const kind = partOf(child)
        if (child === cell || !kind || kind === 'participant') continue
        const step = layout.steps.get(child.getId() ?? '')
        // The box of a frame takes in its rows: as a row, a frame is its tab, and a part dropped below the tab goes inside.
        const middle = step ? step.box.y + (kind === 'frame' ? FRAME_HEADER : step.box.height) / 2 : 0
        if (step && !step.hidden && middle > dropped) {
          target = child
          break
        }
        last = child
      }
    }
    const current = parent.getIndex(cell)
    // Before the part it was dropped above, or after the last part of its kind; inserting takes the cell out first.
    let index = target ? parent.getIndex(target) : last ? parent.getIndex(last) + 1 : part === 'participant' ? 0 : children.length
    if (index > current) index--
    if (index !== current) this.graph.getDataModel().add(parent, cell, index)
  }
}

/** Gives a cell this box unless it has it already, as one change of the model. */
function setBox(model: ReturnType<AbstractGraph['getDataModel']>, cell: Cell, x: number, y: number, width: number, height: number) {
  const geometry = cell.getGeometry()
  if (geometry && geometry.x === x && geometry.y === y && geometry.width === width && geometry.height === height) return
  const placed = geometry ? geometry.clone() : new Geometry()
  placed.x = x
  placed.y = y
  placed.width = width
  placed.height = height
  model.setGeometry(cell, placed)
}

/** What the parts of a diagram look like unless the participant chose otherwise. */
const PART_DEFAULTS: Record<SequencePart, CellStyle> = {
  participant: { align: 'center', verticalAlign: 'middle' },
  message: { fillColor: 'none', align: 'center', verticalAlign: 'top', spacing: 0, spacingTop: 1, overflow: 'visible' },
  note: { fillColor: '#fff2cc', strokeColor: '#d6b656', fontColor: '#1f2328', align: 'center', verticalAlign: 'middle' },
  frame: { fillColor: 'none', align: 'left', verticalAlign: 'top', spacing: 0, spacingTop: 4, overflow: 'visible' },
  else: { fillColor: 'none', align: 'left', verticalAlign: 'top', spacing: 0, spacingLeft: 8, spacingTop: 3, overflow: 'visible' },
  end: { fillColor: 'none', strokeColor: 'none', noLabel: true },
}

/** What the parts of a diagram may do whatever their style says: participants and rows move only to change order. */
const PART_BEHAVIOUR: Record<SequencePart, CellStyle> = {
  participant: { movable: true, resizable: false, rotatable: false, cloneable: false },
  message: { movable: true, resizable: false, rotatable: false, cloneable: false },
  note: { movable: true, resizable: false, rotatable: false, cloneable: false },
  frame: { movable: false, resizable: false, rotatable: false, cloneable: false, pointerEvents: false },
  else: { movable: false, resizable: false, rotatable: false, cloneable: false },
  end: { movable: false, resizable: false, rotatable: false, cloneable: false, editable: false, pointerEvents: false },
}

/** What a diagram looks like unless the participant chose otherwise: a grey frame with its title in its tab. */
const DIAGRAM_DEFAULTS: CellStyle = {
  fillColor: 'none',
  strokeColor: '#6e7781',
  fontStyle: 1,
  align: 'left',
  verticalAlign: 'top',
  spacing: 0,
  spacingLeft: 8,
  spacingTop: 3,
  overflow: 'visible',
}

/**
 * Hooks of the graph for sequence diagrams: the shapes and the defaults of their parts, the labels with the numbers
 * of messages and the conditions of frames in brackets, messages written as lines of Mermaid, no edges to them, and
 * every part of a changed diagram drawn again, since bars and arrows depend on the rows around them. Returns a function
 * that removes the listener.
 */
export function configureSequences(graph: Graph): () => void {
  const getCellStyle = graph.getCellStyle.bind(graph)
  graph.getCellStyle = (cell) => {
    const style = getCellStyle(cell)
    if (isSequence(cell)) {
      return { ...style, ...DIAGRAM_DEFAULTS, ...cell.getStyle(), shape: SEQUENCE_SHAPE, resizable: false, rotatable: false }
    }
    const part = partOf(cell)
    if (!part) return style
    const own = cell.getStyle() as CellStyle & Record<string, unknown>
    const extra: CellStyle = {}
    if (part === 'participant' && own[PARTICIPANT_KIND_KEY] === 'actor') Object.assign(extra, { verticalAlign: 'bottom', spacingBottom: 0 })
    if (part === 'message' && sequenceLayoutOf(cell.getParent()!).messages.get(cell.getId() ?? '')?.self) {
      Object.assign(extra, { align: 'left', spacingLeft: SELF_LABEL_X })
    }
    if (part === 'frame') {
      const tab = sequenceLayoutOf(cell.getParent()!).frames.get(cell.getId() ?? '')?.tabWidth ?? 0
      extra.spacingLeft = tab + 6
    }
    return { ...style, ...PART_DEFAULTS[part], ...extra, ...own, shape: PART_SHAPES[part], ...PART_BEHAVIOUR[part] }
  }
  const getLabel = graph.getLabel.bind(graph)
  graph.getLabel = (cell) => {
    const label = getLabel(cell)
    if (!cell || label === null) return label
    if (isSequence(cell)) return cell.getStyle().noLabel ? label : titleLabel(String(cell.getValue() ?? ''))
    switch (partOf(cell)) {
      case 'message':
        return messageLabel(label, sequenceLayoutOf(cell.getParent()!).messages.get(cell.getId() ?? '')?.number ?? null)
      case 'frame':
        return conditionLabel(label)
      case 'else':
        // A branch left outside any frame, e.g. after another participant undid the frame, shows no condition either.
        return sequenceLayoutOf(cell.getParent()!).steps.get(cell.getId() ?? '')?.hidden ? '' : conditionLabel(label)
      case 'end':
        return ''
      default:
        return label
    }
  }
  // A message written as a line of Mermaid, `Клиент->>API: POST /login`, takes its participants, its kind and its
  // activations from the line, and its text after the colon; a participant the diagram lacks is added at the right.
  const cellLabelChanged = graph.cellLabelChanged.bind(graph)
  graph.cellLabelChanged = (cell, value, autoSize) => {
    const line = partOf(cell) === 'message' ? parseMessageLine(String(value ?? '')) : null
    if (!line) return cellLabelChanged(cell, value, autoSize)
    const diagram = cell.getParent()!
    const model = graph.getDataModel()
    model.batchUpdate(() => {
      const keyOf = (name: string) => {
        const found = graphSequence(diagram).participants.find((participant) => participant.name.trim().toLowerCase() === name.toLowerCase())
        if (found) return found.key
        const key = newId()
        const participant = new Cell(name, new Geometry(0, 0, 0, 0), participantStyle(key, 'participant') as CellStyle)
        participant.setVertex(true)
        const last = diagram.getChildren().reduce((at, child, index) => (partOf(child) === 'participant' ? index : at), -1)
        graph.addCell(participant, diagram, last + 1)
        return key
      }
      const from = keyOf(line.from)
      const to = keyOf(line.to)
      const style = { ...cell.getStyle() } as Record<string, unknown>
      style[FROM_KEY] = from
      style[TO_KEY] = to
      if (line.arrow === 'sync') delete style[ARROW_KEY]
      else style[ARROW_KEY] = line.arrow
      delete style[ACTIVATE_KEY]
      delete style[DEACTIVATE_KEY]
      if (line.activation === '+') style[ACTIVATE_KEY] = [to]
      if (line.activation === '-') style[DEACTIVATE_KEY] = [from]
      model.setStyle(cell, style as CellStyle)
      cellLabelChanged(cell, line.text, autoSize)
    })
  }
  // Parts and diagrams take no edges.
  const isValidSource = graph.isValidSource.bind(graph)
  graph.isValidSource = (cell) => !sequenceOf(cell) && isValidSource(cell)
  // A part dropped outside its diagram, e.g. a message below the last row, stays in it: the layout puts it last.
  const selection = graph.getPlugin<SelectionHandler>('SelectionHandler')
  if (selection) {
    const shouldRemoveCellsFromParent = selection.shouldRemoveCellsFromParent.bind(selection)
    selection.shouldRemoveCellsFromParent = (parent, cells, event) => !isSequence(parent) && shouldRemoveCellsFromParent(parent, cells, event)
  }

  const redraw = (_sender: unknown, event: EventObject) => {
    const diagrams = new Set<Cell>()
    for (const change of (event.getProperty('edit') as { changes: object[] }).changes) {
      const { cell, child, parent, previous } = change as Record<string, unknown>
      for (const value of [cell, child, parent, previous]) {
        const diagram = value instanceof Cell ? sequenceOf(value) : null
        if (diagram) diagrams.add(diagram)
      }
    }
    const view = graph.getView()
    for (const diagram of diagrams) {
      for (const cell of [diagram, ...diagram.getChildren()]) {
        const state = view.getState(cell)
        if (!state) continue
        state.style = graph.getCellStyle(cell)
        graph.cellRenderer.redraw(state, true, true)
      }
    }
  }
  graph.getDataModel().addListener(InternalEvent.CHANGE, redraw)
  return () => graph.getDataModel().removeListener(redraw)
}

/** The color of the lines of a shape, black without one. */
const strokeOf = (shape: Shape) => (shape.stroke && shape.stroke !== 'none' ? shape.stroke : '#1f2328')

/**
 * `codraw.sequence`: the frame of a diagram with `sd` and its title in a tab at the top-left corner, the lifelines of
 * its participants and the bars of their activations, under all its parts. Its empty space catches clicks, so that the
 * diagram is selected and dragged by it.
 */
class SequenceShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const cell = this.state?.cell
    const layout = cell ? sequenceLayoutOf(cell) : null
    c.rect(x, y, w, h)
    if (this.fill && this.fill !== 'none') c.fillAndStroke()
    else c.stroke()
    if (!layout) return
    c.setShadow(false)
    const tab = Math.min(layout.titleWidth, w)
    c.begin()
    c.moveTo(x, y + TAB_HEIGHT)
    c.lineTo(x + tab - 6, y + TAB_HEIGHT)
    c.lineTo(x + tab, y + TAB_HEIGHT - 6)
    c.lineTo(x + tab, y)
    c.stroke()
    c.pointerEvents = false
    const lines = strokeOf(this)
    c.setStrokeColor(lines)
    c.setStrokeWidth(1)
    c.setDashed(true, true)
    c.setDashPattern('4 4')
    c.begin()
    for (const participant of layout.participants.values()) {
      c.moveTo(x + participant.center, y + layout.lifelineTop)
      c.lineTo(x + participant.center, y + layout.lifelineBottom)
    }
    c.stroke()
    c.setDashed(false)
    for (const bar of layout.bars) {
      c.setFillColor(this.fill && this.fill !== 'none' ? this.fill : '#ffffff')
      c.rect(x + bar.x, y + bar.top, BAR_WIDTH, Math.max(1, bar.bottom - bar.top))
      c.fillAndStroke()
    }
  }
}

/** `codraw.seqParticipant`: the header of a participant by its kind; an actor has its name under its figure. */
class ParticipantShape extends Shape {
  constructor() {
    super()
    // The whole header takes clicks, the figure of an actor too.
    this.shapePointerEvents = true
  }

  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const kind = (this.state?.cell.getStyle() as Record<string, unknown> | undefined)?.[PARTICIPANT_KIND_KEY]
    if (kind === 'actor') {
      paintActor(c, x + w / 2, y + 2, Math.max(10, h - 20))
    } else if (kind === 'service') {
      c.roundrect(x, y, w, h, 8, 8)
      c.fillAndStroke()
    } else if (kind === 'database') {
      const dy = Math.min(8, h / 5)
      c.begin()
      c.moveTo(x, y + dy)
      c.curveTo(x, y - dy / 3, x + w, y - dy / 3, x + w, y + dy)
      c.lineTo(x + w, y + h - dy)
      c.curveTo(x + w, y + h + dy / 3, x, y + h + dy / 3, x, y + h - dy)
      c.close()
      c.fillAndStroke()
      c.begin()
      c.moveTo(x, y + dy)
      c.curveTo(x, y + 2 * dy, x + w, y + 2 * dy, x + w, y + dy)
      c.stroke()
    } else if (kind === 'queue') {
      const dx = Math.min(10, w / 6)
      c.begin()
      c.moveTo(x + dx, y)
      c.lineTo(x + w - dx, y)
      c.curveTo(x + w + dx / 3, y, x + w + dx / 3, y + h, x + w - dx, y + h)
      c.lineTo(x + dx, y + h)
      c.curveTo(x - dx / 3, y + h, x - dx / 3, y, x + dx, y)
      c.close()
      c.fillAndStroke()
      c.begin()
      c.moveTo(x + w - dx, y)
      c.curveTo(x + w - 2 * dx, y, x + w - 2 * dx, y + h, x + w - dx, y + h)
      c.stroke()
    } else {
      c.rect(x, y, w, h)
      c.fillAndStroke()
    }
  }
}

/** A stick figure `height` tall, its head at the top middle point (`cx`, `top`). */
export function paintActor(c: AbstractCanvas2D, cx: number, top: number, height: number) {
  const head = height * 0.16
  c.ellipse(cx - head, top, 2 * head, 2 * head)
  c.fillAndStroke()
  const neck = top + 2 * head
  const hip = top + height * 0.66
  c.begin()
  c.moveTo(cx, neck)
  c.lineTo(cx, hip)
  c.moveTo(cx - height * 0.3, top + height * 0.42)
  c.lineTo(cx + height * 0.3, top + height * 0.42)
  c.moveTo(cx - height * 0.25, top + height)
  c.lineTo(cx, hip)
  c.lineTo(cx + height * 0.25, top + height)
  c.stroke()
}

/** Length and half-width of the head of an arrow. */
const HEAD_LENGTH = 10
const HEAD_WIDTH = 4

/** The head of an arrow that ends at (`x`, `y`) coming along `direction` (1 rightwards, -1 leftwards). */
function paintHead(c: AbstractCanvas2D, x: number, y: number, direction: number, filled: boolean) {
  c.setDashed(false)
  c.begin()
  c.moveTo(x - direction * HEAD_LENGTH, y - HEAD_WIDTH)
  c.lineTo(x, y)
  c.lineTo(x - direction * HEAD_LENGTH, y + HEAD_WIDTH)
  if (filled) {
    c.close()
    c.fillAndStroke()
  } else {
    c.stroke()
  }
}

/**
 * `codraw.seqMessage`: the arrow of a message from the lifeline of its sender to that of its receiver, or the loop of a
 * call of oneself, where the layout of its diagram puts it: solid with a filled head for a call, solid with an open one
 * for an asynchronous message, dashed with an open one for an answer. Its whole row takes clicks; an empty message shows
 * a placeholder on the canvas.
 */
class MessageShape extends Shape {
  constructor() {
    super()
    this.shapePointerEvents = true
  }

  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const cell = this.state?.cell
    const diagram = cell?.getParent()
    const geometry = cell?.getGeometry()
    const message = cell && diagram && isSequence(diagram) ? sequenceLayoutOf(diagram).messages.get(cell.getId() ?? '') : undefined
    const arrow = (cell?.getStyle() as Record<string, unknown> | undefined)?.[ARROW_KEY]
    const stroke = strokeOf(this)
    c.setStrokeColor(stroke)
    c.setFillColor(stroke)
    c.setDashed(arrow === 'reply', true)
    if (arrow === 'reply') c.setDashPattern('6 4')
    const filled = arrow !== 'async' && arrow !== 'reply'
    if (!message || !geometry) {
      c.begin()
      c.moveTo(x, y + h - 4)
      c.lineTo(x + w, y + h - 4)
      c.stroke()
      paintHead(c, x + w, y + h - 4, 1, filled)
    } else {
      // The layout places the arrow in the diagram; the shape is drawn where its row is.
      const ox = x - geometry.x
      const oy = y - geometry.y
      c.begin()
      if (message.self) {
        const loop = ox + Math.max(message.from, message.to) + SELF_WIDTH
        c.moveTo(ox + message.from, oy + message.y)
        c.lineTo(loop, oy + message.y)
        c.lineTo(loop, oy + message.y2)
        c.lineTo(ox + message.to, oy + message.y2)
        c.stroke()
        paintHead(c, ox + message.to, oy + message.y2, -1, filled)
      } else {
        c.moveTo(ox + message.from, oy + message.y)
        c.lineTo(ox + message.to, oy + message.y)
        c.stroke()
        paintHead(c, ox + message.to, oy + message.y, message.to >= message.from ? 1 : -1, filled)
      }
    }
    const graph = this.state?.view.graph
    // On the canvas only, not in an exported image, and not while the message is being written.
    const onCanvas = (c as unknown as { root?: Element }).root === this.node
    if (cell && graph && onCanvas && !String(cell.getValue() ?? '').trim() && !graph.isEditing(cell)) {
      const style = this.style ?? {}
      c.save()
      c.setAlpha(0.4)
      c.setFontColor(String(style.fontColor ?? '#1f2328'))
      c.setFontSize(Number(style.fontSize ?? 13))
      c.setFontStyle(2)
      const left = message?.self ? x + SELF_LABEL_X : x + w / 2
      c.text(left, y + 2, 0, 0, m.messagePlaceholder, message?.self ? 'left' : 'center', 'top', false, '', 'visible', false, 0, '')
      c.restore()
    }
  }
}

/** `codraw.seqNote`: a sheet with a folded top-right corner. */
class SequenceNoteShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const fold = Math.min(10, w / 4, h / 4)
    c.begin()
    c.moveTo(x, y)
    c.lineTo(x + w - fold, y)
    c.lineTo(x + w, y + fold)
    c.lineTo(x + w, y + h)
    c.lineTo(x, y + h)
    c.close()
    c.fillAndStroke()
    c.begin()
    c.moveTo(x + w - fold, y)
    c.lineTo(x + w - fold, y + fold)
    c.lineTo(x + w, y + fold)
    c.stroke()
  }
}

/**
 * `codraw.seqFrame`: the box of a frame around its rows with its kind in a tab at the top-left corner; clicks inside
 * reach the rows, only its border and its tab select it.
 */
class FrameShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const cell = this.state?.cell
    const frame = cell?.getParent() && isSequence(cell.getParent()) ? sequenceLayoutOf(cell.getParent()!).frames.get(cell.getId() ?? '') : undefined
    const stroke = strokeOf(this)
    c.pointerEvents = false
    c.rect(x, y, w, h)
    c.stroke()
    const tab = Math.min(frame?.tabWidth ?? 40, w)
    c.pointerEvents = true
    c.setFillColor(stroke)
    c.setFillAlpha(0.08)
    c.begin()
    c.moveTo(x, y)
    c.lineTo(x + tab, y)
    c.lineTo(x + tab, y + TAB_HEIGHT - 6)
    c.lineTo(x + tab - 6, y + TAB_HEIGHT)
    c.lineTo(x, y + TAB_HEIGHT)
    c.close()
    c.fillAndStroke()
    const style = this.style ?? {}
    c.setFontColor(String(style.fontColor ?? '#1f2328'))
    c.setFontSize(Number(style.fontSize ?? 13))
    if (style.fontFamily) c.setFontFamily(style.fontFamily)
    c.setFontStyle(1)
    const kind = frame?.kind ?? String((cell?.getStyle() as Record<string, unknown> | undefined)?.codrawSeqFrame ?? '')
    c.text(x + (tab - 4) / 2, y + TAB_HEIGHT / 2, 0, 0, kind, 'center', 'middle', false, '', 'visible', false, 0, '')
  }
}

/** `codraw.seqBranch`: the dashed line at the top of a branch of a frame; its whole row takes clicks. */
class BranchShape extends Shape {
  constructor() {
    super()
    this.shapePointerEvents = true
  }

  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, _h: number) {
    c.setDashed(true, true)
    c.setDashPattern('6 4')
    c.begin()
    c.moveTo(x, y)
    c.lineTo(x + w, y)
    c.stroke()
  }
}

/** `codraw.seqEnd`: the end of a frame, which the frame draws. */
class EndShape extends Shape {
  override paintVertexShape() {}
}

/** Adds the shapes of sequence diagrams. Safe to call more than once. */
export function registerSequenceShapes() {
  ShapeRegistry.add(SEQUENCE_SHAPE, SequenceShape)
  ShapeRegistry.add(PART_SHAPES.participant, ParticipantShape)
  ShapeRegistry.add(PART_SHAPES.message, MessageShape)
  ShapeRegistry.add(PART_SHAPES.note, SequenceNoteShape)
  ShapeRegistry.add(PART_SHAPES.frame, FrameShape)
  ShapeRegistry.add(PART_SHAPES.else, BranchShape)
  ShapeRegistry.add(PART_SHAPES.end, EndShape)
}
