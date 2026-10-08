import type { CellData, StyleValue } from '../diagram/model.ts'
import {
  conditionLabel,
  messageLabel,
  readSequence,
  SEQUENCE_KEYS,
  titleLabel,
  type ParticipantKind,
  type SequenceDiagram,
} from '../diagram/sequence.ts'
import { BAR_WIDTH, layoutSequence, SELF_WIDTH, TAB_HEIGHT, type ActivationBar, type SequenceLayout } from '../diagram/sequenceLayout.ts'
import { measureLabel } from '../diagram/textMeasure.ts'

/**
 * A sequence diagram in a file of draw.io: shapes and edges of draw.io where the canvas draws the diagram, so that
 * draw.io shows the same sequence — the frame `umlFrame` holding everything, lifelines `umlLifeline` with the bars of
 * their activations, frames of rows `umlFrame` with their conditions, dashed lines of branches, notes and messages as
 * edges between lifelines or bars. A file brings them back as ordinary shapes and edges. The diagram is laid out anew
 * from its parts: its geometry in the document may be older than its parts after changes made at once.
 */

/** The look of a part as the participant set it, without what makes it a part of a diagram of CoDraw. */
function look(style: Record<string, StyleValue>): Record<string, StyleValue> {
  const own: Record<string, StyleValue> = {}
  for (const [key, value] of Object.entries(style)) {
    if (key !== 'shape' && key !== 'codrawShape' && !SEQUENCE_KEYS.includes(key)) own[key] = value
  }
  return own
}

/** The header of a lifeline of draw.io for a kind of participant. */
const HEADERS: Record<ParticipantKind, Record<string, StyleValue>> = {
  participant: {},
  service: { rounded: true },
  actor: { participant: 'umlActor', verticalAlign: 'top' },
  database: { participant: 'cylinder' },
  queue: { participant: 'cylinder' },
}

const ARROWS = {
  sync: { endArrow: 'block', endFill: true },
  async: { endArrow: 'open', endSize: 8 },
  reply: { endArrow: 'open', endSize: 8, dashed: true },
} as const satisfies Record<string, Record<string, StyleValue>>

const vertex = (
  id: string,
  parent: string,
  value: string,
  geometry: { x: number; y: number; width: number; height: number },
  style: Record<string, StyleValue>,
): CellData => ({ id, kind: 'vertex', parent, order: '', value, geometry: { ...geometry }, source: null, target: null, style })

/** Where an arrow ends: on a bar it meets at its side, or on the lifeline at its height, as a fixed point of draw.io. */
interface End {
  terminal: string
  x: number
  y: number
}

/**
 * The cells of draw.io for `diagram`, a cell of a sequence diagram of the document, and its children `parts` in their
 * order: the frame of the diagram first with the id of the diagram, then what it holds, frames under lifelines under
 * notes under messages. Their ids are the ids of the parts, and of bars and conditions ids made from them.
 */
export function sequenceDrawioCells(diagram: CellData, parts: CellData[], measure = measureLabel): CellData[] {
  const read: SequenceDiagram = readSequence(diagram, parts)
  const layout: SequenceLayout = layoutSequence(read, measure)
  const byId = new Map(parts.map((part) => [part.id, part]))
  const styleOf = (id: string) => look(byId.get(id)?.style ?? {})
  const id = diagram.id
  const cells: CellData[] = [
    {
      ...diagram,
      value: titleLabel(diagram.value),
      geometry: { x: diagram.geometry?.x ?? 0, y: diagram.geometry?.y ?? 0, width: layout.width, height: layout.height },
      style: {
        fontStyle: 1,
        ...look(diagram.style),
        shape: 'umlFrame',
        whiteSpace: 'wrap',
        align: 'left',
        verticalAlign: 'top',
        spacingLeft: 6,
        width: layout.titleWidth,
        height: TAB_HEIGHT,
        container: true,
        collapsible: false,
        recursiveResize: false,
        pointerEvents: false,
      },
    },
  ]

  for (const step of read.steps) {
    const box = layout.steps.get(step.id)
    if (!box || box.hidden) continue
    if (step.type === 'frame') {
      const frame = layout.frames.get(step.id)!
      cells.push(
        vertex(step.id, id, step.kind, box.box, {
          fontStyle: 1,
          ...styleOf(step.id),
          shape: 'umlFrame',
          whiteSpace: 'wrap',
          pointerEvents: false,
          width: frame.tabWidth,
          height: TAB_HEIGHT,
        }),
      )
      if (step.text.trim()) {
        const x = box.box.x + frame.tabWidth + 6
        cells.push(
          vertex(`${step.id}-label`, id, conditionLabel(step.text), { x, y: box.box.y, width: Math.max(40, box.box.x + box.box.width - x - 6), height: TAB_HEIGHT }, {
            ...styleOf(step.id),
            fillColor: 'none',
            strokeColor: 'none',
            align: 'left',
            verticalAlign: 'middle',
          }),
        )
      }
    } else if (step.type === 'else') {
      cells.push(
        vertex(step.id, id, conditionLabel(step.text), { x: box.box.x, y: box.box.y - 5, width: box.box.width, height: 10 }, {
          ...styleOf(step.id),
          shape: 'line',
          dashed: true,
          strokeWidth: 1,
          fillColor: 'none',
          labelPosition: 'center',
          verticalLabelPosition: 'bottom',
          align: 'left',
          verticalAlign: 'top',
          spacingLeft: 8,
        }),
      )
    }
  }

  const barsOf = new Map<string, ActivationBar[]>()
  for (const bar of layout.bars) barsOf.set(bar.participant, [...(barsOf.get(bar.participant) ?? []), bar])
  const barId = (participant: string, index: number) => `${participant}-bar-${index + 1}`
  for (const participant of read.participants) {
    const { box } = layout.participants.get(participant.id)!
    const height = layout.lifelineBottom - box.y
    cells.push(
      vertex(participant.id, id, participant.name, { ...box, height }, {
        ...styleOf(participant.id),
        shape: 'umlLifeline',
        perimeter: 'lifelinePerimeter',
        whiteSpace: 'wrap',
        container: true,
        dropTarget: false,
        collapsible: false,
        recursiveResize: false,
        outlineConnect: false,
        portConstraint: 'eastwest',
        size: box.height,
        ...HEADERS[participant.kind],
        ...(participant.kind === 'actor' && { spacingTop: box.height - 18 }),
      }),
    )
    ;(barsOf.get(participant.id) ?? []).forEach((bar, index) => {
      cells.push(
        vertex(barId(participant.id, index), participant.id, '', { x: bar.x - box.x, y: bar.top - box.y, width: BAR_WIDTH, height: bar.bottom - bar.top }, {
          perimeter: 'orthogonalPerimeter',
          outlineConnect: false,
          targetShapes: 'umlLifeline',
          portConstraint: 'eastwest',
        }),
      )
    })
  }

  for (const step of read.steps) {
    const box = layout.steps.get(step.id)
    if (step.type !== 'note' || !box) continue
    cells.push(
      vertex(step.id, id, step.text, box.box, {
        fillColor: '#fff2cc',
        strokeColor: '#d6b656',
        ...styleOf(step.id),
        shape: 'note',
        size: 10,
        whiteSpace: 'wrap',
      }),
    )
  }

  const participantId = new Map(read.participants.map((participant) => [participant.key, participant.id]))
  /** Where an arrow at `x`, `y` meets the lifeline of `key`: the side of a bar there, or the lifeline itself. */
  const end = (key: string, x: number, y: number): End & { exit: Record<string, StyleValue> } => {
    const lifeline = participantId.get(key) ?? read.participants[0]?.id ?? ''
    const bars = barsOf.get(lifeline) ?? []
    const index = bars.findIndex((bar) => bar.top <= y && y <= bar.bottom && (bar.x === x || bar.x + BAR_WIDTH === x))
    if (index >= 0) {
      const bar = bars[index]!
      const fraction = bar.bottom > bar.top ? (y - bar.top) / (bar.bottom - bar.top) : 0
      return { terminal: barId(lifeline, index), x, y, exit: { X: bar.x === x ? 0 : 1, Y: round(fraction), Perimeter: false } }
    }
    const header = layout.participants.get(lifeline)?.box
    const height = header ? layout.lifelineBottom - header.y : 1
    return { terminal: lifeline, x, y, exit: { X: 0.5, Y: header ? round((y - header.y) / height) : 0, Perimeter: false } }
  }
  for (const step of read.steps) {
    const message = layout.messages.get(step.id)
    if (step.type !== 'message' || !message) continue
    const source = end(step.from, message.from, message.y)
    const target = end(step.to, message.to, message.y2)
    const loop = Math.max(message.from, message.to) + SELF_WIDTH
    const prefixed = (prefix: string, keys: Record<string, StyleValue>) =>
      Object.fromEntries(Object.entries(keys).map(([key, value]) => [`${prefix}${key}`, value]))
    cells.push({
      id: step.id,
      kind: 'edge',
      parent: id,
      order: '',
      value: messageLabel(step.text, message.number),
      geometry: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        relative: true,
        sourcePoint: { x: source.x, y: source.y },
        targetPoint: { x: target.x, y: target.y },
        ...(message.self && { points: [{ x: loop, y: message.y }, { x: loop, y: message.y2 }] }),
      },
      source: source.terminal,
      target: target.terminal,
      style: {
        ...styleOf(step.id),
        ...ARROWS[step.arrow],
        edgeStyle: 'none',
        curved: false,
        rounded: false,
        verticalAlign: 'bottom',
        ...(message.self && { align: 'left', spacingLeft: 4 }),
        ...prefixed('exit', source.exit),
        ...prefixed('entry', target.exit),
      },
    })
  }
  return cells
}

/** A fraction as a file keeps it: four digits are enough for any diagram on screen. */
const round = (value: number) => Math.round(value * 10_000) / 10_000
