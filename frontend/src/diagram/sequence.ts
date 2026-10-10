import { generateNKeysBetween } from 'fractional-indexing'
import { newId } from './ids.ts'
import { sequenceMessages as m } from './sequence.messages.ts'
import { LAYER_CELL_ID, type CellData, type StyleValue } from './model.ts'
import { layoutSequence, type SequenceLayout } from './sequenceLayout.ts'
import { measureLabel, type LabelStyle } from './textMeasure.ts'

/**
 * A sequence diagram as cells, without maxGraph: a cell of the diagram, whose label is its title, and its children —
 * participants, then rows of messages, notes, frames, their branches and their ends — in the order of the cells.
 * Participants stand from left to right in their order and rows from top to bottom in theirs; messages and notes name
 * participants by a key of their own, which copies of the diagram keep, rather than by the ids of their cells, which
 * copies change. A frame is the row where it starts and the row where it ends, so that a row inserted between them is
 * inside it. What reads and writes files, e.g. `.drawio` and Mermaid, takes the diagram from here without the editor.
 */

/** The shape of a cell of a sequence diagram, by which it is known. */
export const SEQUENCE_SHAPE = 'codraw.sequence'

/** The shape of the palette the diagram is made from. */
export const SEQUENCE_PRESET = 'sequence'

/** Style key of a part of a diagram: what it is, see {@link SequencePart}. */
export const PART_KEY = 'codrawSeq'
/** Style key of the key of a participant, by which messages and notes name it. */
export const PARTICIPANT_KEY = 'codrawSeqKey'
/** Style key of the kind of a participant; a plain participant has none. */
export const PARTICIPANT_KIND_KEY = 'codrawSeqKind'
/** Style keys of the participants of a message (its sender and receiver) or of a note (from one to another). */
export const FROM_KEY = 'codrawSeqFrom'
export const TO_KEY = 'codrawSeqTo'
/** Style key of the kind of a message; a synchronous call has none. */
export const ARROW_KEY = 'codrawSeqArrow'
/** Style keys of the participants whose activation a message starts and ends: lists of keys. */
export const ACTIVATE_KEY = 'codrawSeqActivate'
export const DEACTIVATE_KEY = 'codrawSeqDeactivate'
/** Style key of where a note stands; over its participants without it. */
export const NOTE_KEY = 'codrawSeqNote'
/** Style key of the kind of a frame. */
export const FRAME_KEY = 'codrawSeqFrame'
/** Style key of a diagram whose messages are numbered. draw.io writes it as 0 or 1. */
export const NUMBERS_KEY = 'codrawSeqNumbers'

/** The style keys of sequence diagrams, which no other cell has. */
export const SEQUENCE_KEYS: readonly string[] = [
  PART_KEY,
  PARTICIPANT_KEY,
  PARTICIPANT_KIND_KEY,
  FROM_KEY,
  TO_KEY,
  ARROW_KEY,
  ACTIVATE_KEY,
  DEACTIVATE_KEY,
  NOTE_KEY,
  FRAME_KEY,
  NUMBERS_KEY,
]

export type SequencePart = 'participant' | 'message' | 'note' | 'frame' | 'else' | 'end'
export type ParticipantKind = 'participant' | 'actor' | 'service' | 'database' | 'queue'
export type MessageArrow = 'sync' | 'async' | 'reply'
export type NotePlacement = 'over' | 'left' | 'right'
export type FrameKind = 'alt' | 'opt' | 'loop' | 'par' | 'critical' | 'break'

const PARTS: readonly SequencePart[] = ['participant', 'message', 'note', 'frame', 'else', 'end']

/** The kinds of participants as the panel names them, in its order. */
export const PARTICIPANT_KINDS: readonly { value: ParticipantKind; label: string }[] = [
  { value: 'participant', get label() { return m.participantKinds.participant } },
  { value: 'actor', get label() { return m.participantKinds.actor } },
  { value: 'service', get label() { return m.participantKinds.service } },
  { value: 'database', get label() { return m.participantKinds.database } },
  { value: 'queue', get label() { return m.participantKinds.queue } },
]

/** The kinds of messages as the panel names them, in its order. */
export const MESSAGE_ARROWS: readonly { value: MessageArrow; label: string }[] = [
  { value: 'sync', get label() { return m.messageArrows.sync } },
  { value: 'async', get label() { return m.messageArrows.async } },
  { value: 'reply', get label() { return m.messageArrows.reply } },
]

/** Where a note stands, as the panel names it, in its order. */
export const NOTE_PLACEMENTS: readonly { value: NotePlacement; label: string }[] = [
  { value: 'over', get label() { return m.notePlacements.over } },
  { value: 'right', get label() { return m.notePlacements.right } },
  { value: 'left', get label() { return m.notePlacements.left } },
]

/** The kinds of frames, as UML and Mermaid name them, with what they mean. */
export const FRAME_KINDS: readonly { value: FrameKind; label: string }[] = [
  { value: 'alt', get label() { return m.frameKinds.alt } },
  { value: 'opt', get label() { return m.frameKinds.opt } },
  { value: 'loop', get label() { return m.frameKinds.loop } },
  { value: 'par', get label() { return m.frameKinds.par } },
  { value: 'critical', get label() { return m.frameKinds.critical } },
  { value: 'break', get label() { return m.frameKinds.break } },
]

/** The word of Mermaid that starts a branch of a frame; frames of other kinds have no branches. */
export const BRANCH_WORDS: Readonly<Partial<Record<FrameKind, string>>> = { alt: 'else', par: 'and', critical: 'option' }

const isOneOf = <T extends string>(values: readonly { value: T }[], value: unknown): value is T =>
  values.some((item) => item.value === value)

export interface Participant {
  /** The id of its cell. */
  id: string
  /** The key by which messages and notes name it. */
  key: string
  name: string
  kind: ParticipantKind
  font: LabelStyle
}

export interface SequenceMessage {
  type: 'message'
  id: string
  text: string
  /** The keys of the sender and of the receiver; the same key for a call of oneself. */
  from: string
  to: string
  arrow: MessageArrow
  /** The keys of the participants whose activation starts at the arrow of the message. */
  activate: string[]
  /** The keys of the participants whose last activation ends at the arrow of the message. */
  deactivate: string[]
  font: LabelStyle
}

export interface SequenceNote {
  type: 'note'
  id: string
  text: string
  placement: NotePlacement
  /** The participant of the note, or for a note over several, the first and the last of them. */
  from: string
  to: string
  font: LabelStyle
}

export interface SequenceFrame {
  type: 'frame'
  id: string
  kind: FrameKind
  /** The condition. */
  text: string
  font: LabelStyle
}

export interface SequenceBranch {
  type: 'else'
  id: string
  /** The condition of the branch. */
  text: string
  font: LabelStyle
}

export interface SequenceEnd {
  type: 'end'
  id: string
}

export type SequenceStep = SequenceMessage | SequenceNote | SequenceFrame | SequenceBranch | SequenceEnd

export interface SequenceDiagram {
  title: string
  numbered: boolean
  /** The font of the title. */
  font: LabelStyle
  participants: Participant[]
  /** The rows from top to bottom. */
  steps: SequenceStep[]
}

/** A cell as the diagram is read from it: of the document, of maxGraph or of a file. */
export interface PartRecord {
  id: string
  value: string
  style: Record<string, unknown>
}

/** A cell of a sequence diagram. */
export function isSequenceStyle(style: Record<string, unknown> | null | undefined): boolean {
  return style?.shape === SEQUENCE_SHAPE
}

/** What a part of a diagram is, from its style; `null` for a cell that is no part. */
export function sequencePartOf(style: Record<string, unknown> | null | undefined): SequencePart | null {
  const part = style?.[PART_KEY]
  return PARTS.includes(part as SequencePart) ? (part as SequencePart) : null
}

/** A flag of draw.io in any of its spellings: it writes 1, CoDraw keeps `true`. */
const isOn = (value: unknown) => value === true || value === 1 || value === '1'

/** The messages of the diagram are numbered. */
export const isNumbered = (style: Record<string, unknown> | null | undefined) => isOn(style?.[NUMBERS_KEY])

/** A list of keys as a style keeps it: an array, or the words of a file of draw.io joined with commas. */
export function keyList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return [...new Set(items.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
}

const stringOf = (value: unknown) => (typeof value === 'string' ? value : '')

/** The font of a label from a style: its size, family and flags. */
export function fontOf(style: Record<string, unknown>): LabelStyle {
  const font: LabelStyle = {}
  if (style.fontSize !== undefined) font.fontSize = style.fontSize
  if (style.fontFamily !== undefined) font.fontFamily = style.fontFamily
  if (style.fontStyle !== undefined) font.fontStyle = style.fontStyle
  return font
}

/**
 * The diagram of a cell of a diagram and its children in their order. Children that are no parts are left out, values
 * of the style that are not what they should be are their defaults, and a participant whose key another one before it
 * has takes its id: the messages name the first. A message or a note that names no participant of the diagram names the
 * first one; activations name only participants of the diagram.
 */
export function readSequence(diagram: PartRecord, children: readonly PartRecord[]): SequenceDiagram {
  const participants: Participant[] = []
  const keys = new Set<string>()
  for (const child of children) {
    if (sequencePartOf(child.style) !== 'participant') continue
    const own = stringOf(child.style[PARTICIPANT_KEY]).trim()
    const key = own && !keys.has(own) ? own : child.id
    keys.add(key)
    const kind = child.style[PARTICIPANT_KIND_KEY]
    participants.push({
      id: child.id,
      key,
      name: child.value,
      kind: isOneOf(PARTICIPANT_KINDS, kind) ? kind : 'participant',
      font: fontOf(child.style),
    })
  }
  const first = participants[0]?.key ?? ''
  const known = (value: unknown) => {
    const key = stringOf(value)
    return keys.has(key) ? key : first
  }
  const knownList = (value: unknown) => keyList(value).filter((key) => keys.has(key))
  const steps: SequenceStep[] = []
  for (const child of children) {
    const { id, value, style } = child
    const font = fontOf(style)
    switch (sequencePartOf(style)) {
      case 'message': {
        const arrow = style[ARROW_KEY]
        steps.push({
          type: 'message',
          id,
          text: value,
          from: known(style[FROM_KEY]),
          to: known(style[TO_KEY]),
          arrow: isOneOf(MESSAGE_ARROWS, arrow) ? arrow : 'sync',
          activate: knownList(style[ACTIVATE_KEY]),
          deactivate: knownList(style[DEACTIVATE_KEY]),
          font,
        })
        break
      }
      case 'note': {
        const placement = style[NOTE_KEY]
        const from = known(style[FROM_KEY])
        steps.push({
          type: 'note',
          id,
          text: value,
          placement: isOneOf(NOTE_PLACEMENTS, placement) ? placement : 'over',
          from,
          to: style[TO_KEY] === undefined ? from : known(style[TO_KEY]),
          font,
        })
        break
      }
      case 'frame': {
        const kind = style[FRAME_KEY]
        steps.push({ type: 'frame', id, kind: isOneOf(FRAME_KINDS, kind) ? kind : 'opt', text: value, font })
        break
      }
      case 'else':
        steps.push({ type: 'else', id, text: value, font })
        break
      case 'end':
        steps.push({ type: 'end', id })
        break
      default:
        break
    }
  }
  return { title: diagram.value, numbered: isNumbered(diagram.style), font: fontOf(diagram.style), participants, steps }
}

/**
 * The frame that each branch and each end of the diagram belongs to, by their ids: the innermost frame open before it.
 * A branch or an end outside any frame has none.
 */
export function frameOwners(diagram: SequenceDiagram): Map<string, SequenceFrame> {
  const owners = new Map<string, SequenceFrame>()
  const open: SequenceFrame[] = []
  for (const step of diagram.steps) {
    if (step.type === 'frame') open.push(step)
    else if (step.type === 'else' && open.length > 0) owners.set(step.id, open.at(-1)!)
    else if (step.type === 'end' && open.length > 0) owners.set(step.id, open.pop()!)
  }
  return owners
}

/** The label of a message as the canvas shows it: with its number before the text when the diagram is numbered. */
export const messageLabel = (text: string, number: number | null) => (number === null ? text : `${number}. ${text}`)

/** The label of a frame or a branch as the canvas shows it: its condition in brackets, none without one. */
export const conditionLabel = (text: string) => (text.trim() ? `[${text}]` : '')

/** The label of a diagram as its tab shows it: `sd` and the title. */
export const titleLabel = (title: string) => (title.trim() ? `sd ${title}` : 'sd')

/** The keys of the style of a participant as the document keeps them. */
export function participantStyle(key: string, kind: ParticipantKind): Record<string, StyleValue> {
  return { [PART_KEY]: 'participant', [PARTICIPANT_KEY]: key, ...(kind !== 'participant' && { [PARTICIPANT_KIND_KEY]: kind }) }
}

/** The keys of the style of a message as the document keeps them: none for a default. */
export function messageStyle(message: Pick<SequenceMessage, 'from' | 'to' | 'arrow' | 'activate' | 'deactivate'>): Record<string, StyleValue> {
  return {
    [PART_KEY]: 'message',
    [FROM_KEY]: message.from,
    [TO_KEY]: message.to,
    ...(message.arrow !== 'sync' && { [ARROW_KEY]: message.arrow }),
    ...(message.activate.length > 0 && { [ACTIVATE_KEY]: [...message.activate] }),
    ...(message.deactivate.length > 0 && { [DEACTIVATE_KEY]: [...message.deactivate] }),
  }
}

/** The keys of the style of a note as the document keeps them. */
export function noteStyle(note: Pick<SequenceNote, 'from' | 'to' | 'placement'>): Record<string, StyleValue> {
  return {
    [PART_KEY]: 'note',
    [FROM_KEY]: note.from,
    [TO_KEY]: note.to,
    ...(note.placement !== 'over' && { [NOTE_KEY]: note.placement }),
  }
}

/** The style of a part of a step as the document keeps it. */
function stepStyle(step: SequenceStep): Record<string, StyleValue> {
  switch (step.type) {
    case 'message':
      return messageStyle(step)
    case 'note':
      return noteStyle(step)
    case 'frame':
      return { [PART_KEY]: 'frame', [FRAME_KEY]: step.kind }
    case 'else':
      return { [PART_KEY]: 'else' }
    case 'end':
      return { [PART_KEY]: 'end' }
  }
}

/** The style of a cell of a sequence diagram as the document keeps it. */
export function sequenceStyle(numbered: boolean): Record<string, StyleValue> {
  return { shape: SEQUENCE_SHAPE, codrawShape: SEQUENCE_PRESET, ...(numbered && { [NUMBERS_KEY]: true }) }
}

const fontKeys = (font: LabelStyle): Record<string, StyleValue> =>
  Object.fromEntries(Object.entries(font).filter(([, value]) => ['string', 'number'].includes(typeof value))) as Record<string, StyleValue>

/**
 * The cells of a diagram laid out (see {@link layoutSequence}) with its top-left corner at `origin`, on the layer: the
 * cell of the diagram, then its participants and rows ordered among themselves as they come.
 */
export function sequenceCells(
  diagram: SequenceDiagram,
  origin: { x: number; y: number },
  measure: (text: string, font: LabelStyle) => number = measureLabel,
): CellData[] {
  const layout = layoutSequence(diagram, measure)
  const id = newId()
  const parts: { id: string; value: string; style: Record<string, StyleValue> }[] = [
    ...diagram.participants.map((participant) => ({
      id: participant.id,
      value: participant.name,
      style: { ...participantStyle(participant.key, participant.kind), ...fontKeys(participant.font) },
    })),
    ...diagram.steps.map((step) => ({
      id: step.id,
      value: step.type === 'end' ? '' : step.text,
      style: { ...stepStyle(step), ...(step.type === 'end' ? {} : fontKeys(step.font)) },
    })),
  ]
  const orders = generateNKeysBetween(null, null, parts.length)
  return [
    {
      id,
      kind: 'vertex',
      parent: LAYER_CELL_ID,
      order: '',
      value: diagram.title,
      geometry: { x: origin.x, y: origin.y, width: layout.width, height: layout.height },
      source: null,
      target: null,
      style: { ...sequenceStyle(diagram.numbered), ...fontKeys(diagram.font) },
    },
    ...parts.map((part, index) => ({
      id: part.id,
      kind: 'vertex' as const,
      parent: id,
      order: orders[index]!,
      value: part.value,
      geometry: boxOf(layout, part.id),
      source: null,
      target: null,
      style: part.style,
    })),
  ]
}

/** Where the layout puts a part. */
function boxOf(layout: SequenceLayout, id: string) {
  const box = layout.participants.get(id)?.box ?? layout.steps.get(id)?.box ?? { x: 0, y: 0, width: 0, height: 0 }
  return { ...box }
}

/** A diagram to build, e.g. from Mermaid or a template: parts get new ids and participants new keys. */
export class SequenceBuilder {
  readonly diagram: SequenceDiagram

  constructor(title = '', numbered = false) {
    this.diagram = { title, numbered, font: {}, participants: [], steps: [] }
  }

  /** Adds a participant at the right and returns its key. */
  participant(name: string, kind: ParticipantKind = 'participant'): string {
    const key = newId()
    this.diagram.participants.push({ id: newId(), key, name, kind, font: {} })
    return key
  }

  message(from: string, to: string, text: string, arrow: MessageArrow = 'sync', activations: { activate?: string[]; deactivate?: string[] } = {}): SequenceMessage {
    const message: SequenceMessage = {
      type: 'message',
      id: newId(),
      text,
      from,
      to,
      arrow,
      activate: activations.activate ?? [],
      deactivate: activations.deactivate ?? [],
      font: {},
    }
    this.diagram.steps.push(message)
    return message
  }

  note(from: string, to: string, text: string, placement: NotePlacement = 'over') {
    this.diagram.steps.push({ type: 'note', id: newId(), text, placement, from, to, font: {} })
  }

  frame(kind: FrameKind, condition: string) {
    this.diagram.steps.push({ type: 'frame', id: newId(), kind, text: condition, font: {} })
  }

  branch(condition: string) {
    this.diagram.steps.push({ type: 'else', id: newId(), text: condition, font: {} })
  }

  end() {
    this.diagram.steps.push({ type: 'end', id: newId() })
  }
}

/** What a new diagram of the palette has: «Клиент» calls «Сервис», which answers. */
export function starterSequence(): SequenceDiagram {
  const { title, client: clientName, service: serviceName, request, reply } = m.starter
  const builder = new SequenceBuilder(title)
  const client = builder.participant(clientName)
  const service = builder.participant(serviceName)
  builder.message(client, service, request)
  builder.message(service, client, reply, 'reply')
  return builder.diagram
}
