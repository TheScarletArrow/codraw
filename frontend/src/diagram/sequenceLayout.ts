import type { FrameKind, Participant, SequenceDiagram, SequenceMessage, SequenceNote } from './sequence.ts'
import { DEFAULT_FONT_SIZE, LINE_HEIGHT, numeric, type LabelStyle } from './textMeasure.ts'

/**
 * The layout of a sequence diagram: where its participants, rows, lifelines and activations go, from the order and the
 * text of its parts alone, so that every participant of a board, every file and every import lays it out the same. All
 * positions are relative to the top-left corner of the diagram and whole pixels.
 */

/** Width of a text drawn with a font, in pixels at 100%. */
export type Measure = (text: string, font: LabelStyle) => number

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Room around everything inside the frame of the diagram. */
export const PADDING = 16
/** Height of the tab of the frame of a diagram, `sd` and its title; and of the tab of a frame of rows. */
export const TAB_HEIGHT = 20
/** Where the headers of participants start. */
const TOP = TAB_HEIGHT + 16
/** Height of the header of a participant drawn as a box, and of an actor, a figure with its name under it. */
export const HEADER_HEIGHT = 40
export const ACTOR_HEADER_HEIGHT = 64
/** The narrowest header, and the room around the name in a header. */
const MIN_HEADER_WIDTH = 90
const HEADER_PADDING = 24
/** The narrowest actor; its name may be wider than its figure. */
const MIN_ACTOR_WIDTH = 60
/** Room between the headers of neighbours. */
const HEADER_GAP = 30
/** Room around the label of a message between the lifelines it joins. */
const LABEL_ROOM = 24
/** Room between the headers and the first row, and under the last row. */
const FIRST_ROW_GAP = 16
const LIFELINE_TAIL = 16
/** Room between the label of a message and its arrow, and under the arrow. */
const ARROW_GAP = 6
const ROW_GAP = 8
/** How far a call of oneself goes right of the lifeline, and down. */
export const SELF_WIDTH = 32
const SELF_HEIGHT = 18
/** Where the label of a call of oneself starts right of the lifeline. */
export const SELF_LABEL_X = 8
/** The narrowest note, the room around its text and between it and a lifeline it stands beside. */
const MIN_NOTE_WIDTH = 80
const NOTE_PADDING = 8
const NOTE_GAP = 12
/** How far a note over several participants reaches beyond their lifelines. */
const NOTE_OVERHANG = 16
/** Rows of frames: the tab of the kind, a branch with its condition and the end, and the room around what a frame holds. */
const FRAME_HEADER = TAB_HEIGHT + 8
const BRANCH_GAP = 10
const FRAME_FOOTER = 8
const FRAME_PADDING = 12
/** How far a frame without rows reaches beyond the outer lifelines. */
const EMPTY_FRAME_OVERHANG = 20
/** Width of a bar of activation, and the shift of a bar inside another of the same participant. */
export const BAR_WIDTH = 10
export const BAR_SHIFT = 5
/** Where a bar not ended stops above the end of the lifeline. */
const OPEN_BAR_TAIL = 8
/** The narrowest diagram. */
const MIN_WIDTH = 160

/** Room for the kind of a frame in its tab, and of the title in the tab of the diagram. */
export const tabWidth = (textWidth: number) => Math.ceil(textWidth) + 20

export interface ParticipantLayout {
  /** The header. */
  box: Box
  /** Where its lifeline goes down. */
  center: number
}

export interface StepLayout {
  box: Box
  /** A branch or an end outside any frame: it takes no room and is not drawn. */
  hidden: boolean
}

/** Where the arrow of a message goes: from `from` to `to` at `y`; a call of oneself comes back at `y2`. */
export interface MessageLayout {
  from: number
  to: number
  y: number
  y2: number
  self: boolean
  /** The number of the message in a numbered diagram. */
  number: number | null
}

export interface FrameLayout {
  /** The kind and the width of its tab. */
  kind: FrameKind
  tabWidth: number
  /** Where its branches start, from its top. */
  branches: number[]
}

export interface ActivationBar {
  /** The id of the participant. */
  participant: string
  x: number
  top: number
  bottom: number
}

export interface SequenceLayout {
  width: number
  height: number
  /** Width of the tab of the diagram. */
  titleWidth: number
  /** Where the lifelines start and end. */
  lifelineTop: number
  lifelineBottom: number
  participants: Map<string, ParticipantLayout>
  steps: Map<string, StepLayout>
  messages: Map<string, MessageLayout>
  frames: Map<string, FrameLayout>
  bars: ActivationBar[]
}

const lineHeight = (font: LabelStyle) => Math.ceil(numeric(font.fontSize, DEFAULT_FONT_SIZE) * LINE_HEIGHT)
/** Height of the lines of a text; an empty text takes one line. */
const textHeight = (text: string, font: LabelStyle) => text.split('\n').length * lineHeight(font)
const bold = (font: LabelStyle): LabelStyle => ({ ...font, fontStyle: numeric(font.fontStyle, 0) | 1 })

interface Need {
  from: number
  to: number
  room: number
}

/** The width of the header of a participant for its name. */
function headerWidth(participant: Participant, measure: Measure): number {
  const text = measure(participant.name, participant.font)
  if (participant.kind === 'actor') return Math.max(MIN_ACTOR_WIDTH, Math.ceil(text) + 8)
  return Math.max(MIN_HEADER_WIDTH, Math.ceil(text) + HEADER_PADDING + (participant.kind === 'queue' ? 12 : 0))
}

const headerHeight = (participant: Participant) => (participant.kind === 'actor' ? ACTOR_HEADER_HEIGHT : HEADER_HEIGHT)

const noteWidth = (note: SequenceNote, measure: Measure) =>
  Math.max(MIN_NOTE_WIDTH, Math.ceil(measure(note.text, note.font)) + 2 * NOTE_PADDING)

/** Lays the diagram out with `measure` for the widths of its texts; see {@link SequenceLayout}. */
export function layoutSequence(diagram: SequenceDiagram, measure: Measure): SequenceLayout {
  const { participants, steps } = diagram
  const index = new Map(participants.map((participant, at) => [participant.key, at]))
  const at = (key: string) => index.get(key) ?? 0
  const widths = participants.map((participant) => headerWidth(participant, measure))

  // The numbers of messages, which their labels show.
  const numbers = new Map<string, number>()
  steps.filter((step) => step.type === 'message').forEach((step, place) => numbers.set(step.id, place + 1))
  const label = (message: SequenceMessage) =>
    diagram.numbered ? `${numbers.get(message.id)}. ${message.text}` : message.text

  // Horizontally: the gaps between neighbours fit their headers, then what the rows between them need, shorter spans
  // first; what is missing goes to the last gap of the span.
  const gaps = widths.slice(1).map((width, gap) => widths[gap]! / 2 + width / 2 + HEADER_GAP)
  const needs: Need[] = []
  const need = (from: number, to: number, room: number) => {
    if (from < to) needs.push({ from, to, room })
  }
  for (const step of steps) {
    if (step.type === 'message') {
      const width = Math.ceil(measure(label(step), step.font))
      const [from, to] = [at(step.from), at(step.to)]
      if (from === to) {
        // The label of a call of oneself goes right of the lifeline, up to the next one; of the last one, the diagram
        // gets wider.
        if (from < participants.length - 1) need(from, from + 1, Math.max(SELF_WIDTH, width + SELF_LABEL_X) + LABEL_ROOM / 2)
      } else {
        need(Math.min(from, to), Math.max(from, to), width + LABEL_ROOM)
      }
    } else if (step.type === 'note') {
      const width = noteWidth(step, measure)
      const [from, to] = [Math.min(at(step.from), at(step.to)), Math.max(at(step.from), at(step.to))]
      if (step.placement === 'right' && from < participants.length - 1) need(from, from + 1, 2 * NOTE_GAP + width)
      else if (step.placement === 'left' && from > 0) need(from - 1, from, 2 * NOTE_GAP + width)
      else if (step.placement === 'over' && from < to) need(from, to, width - 2 * NOTE_OVERHANG)
    }
  }
  needs.sort((a, b) => a.to - a.from - (b.to - b.from))
  for (const { from, to, room } of needs) {
    const span = gaps.slice(from, to).reduce((sum, gap) => sum + gap, 0)
    if (span < room) gaps[to - 1]! += room - span
  }
  const centers: number[] = []
  participants.forEach((_, place) => centers.push(place === 0 ? 0 : centers[place - 1]! + gaps[place - 1]!))
  const center = (key: string) => centers[at(key)] ?? 0

  // Vertically: the headers end on one line, then the rows go down one under another.
  const header = Math.max(HEADER_HEIGHT, ...participants.map(headerHeight))
  const lifelineTop = TOP + header
  const participantBoxes = new Map<string, ParticipantLayout>()
  participants.forEach((participant, place) => {
    const height = headerHeight(participant)
    const box = { x: centers[place]! - widths[place]! / 2, y: lifelineTop - height, width: widths[place]!, height }
    participantBoxes.set(participant.id, { box, center: centers[place]! })
  })

  // Activations: the open bars of each participant from the outermost, by key.
  const open = new Map<string, { top: number; depth: number }[]>()
  const bars: { key: string; depth: number; top: number; bottom: number }[] = []
  const openOf = (key: string) => open.get(key) ?? []
  /** Where an arrow meets the lifeline of `key` with `depth` bars on it, from the side `right` or the other. */
  const edge = (key: string, depth: number, right: boolean) =>
    depth === 0 ? center(key) : center(key) + (depth - 1) * BAR_SHIFT + (right ? BAR_WIDTH / 2 : -BAR_WIDTH / 2)

  const stepBoxes = new Map<string, StepLayout>()
  const messages = new Map<string, MessageLayout>()
  const frames = new Map<string, FrameLayout>()
  interface OpenFrame {
    id: string
    kind: FrameKind
    top: number
    /** What the frame holds, for its width. */
    contents: Box[]
    branches: { id: string; y: number; height: number }[]
    /** The width its tab and condition need. */
    minWidth: number
  }
  const stack: OpenFrame[] = []
  const hold = (box: Box) => stack.at(-1)?.contents.push(box)
  const extent = () => {
    const xs = participants.map((participant) => participantBoxes.get(participant.id)!.center)
    return xs.length > 0 ? { left: Math.min(...xs), right: Math.max(...xs) } : { left: 0, right: 0 }
  }
  const closeFrame = (frame: OpenFrame, bottom: number, end: string | null) => {
    let left: number
    let right: number
    if (frame.contents.length > 0) {
      left = Math.min(...frame.contents.map((box) => box.x)) - FRAME_PADDING
      right = Math.max(...frame.contents.map((box) => box.x + box.width)) + FRAME_PADDING
    } else {
      const { left: first, right: last } = extent()
      left = first - EMPTY_FRAME_OVERHANG
      right = last + EMPTY_FRAME_OVERHANG
    }
    right = Math.max(right, left + frame.minWidth)
    const box = { x: left, y: frame.top, width: right - left, height: bottom - frame.top }
    stepBoxes.set(frame.id, { box, hidden: false })
    for (const branch of frame.branches) {
      stepBoxes.set(branch.id, { box: { x: left, y: branch.y, width: box.width, height: branch.height }, hidden: false })
    }
    if (end) stepBoxes.set(end, { box: { x: left, y: bottom - FRAME_FOOTER, width: box.width, height: FRAME_FOOTER }, hidden: false })
    frames.get(frame.id)!.branches = frame.branches.map((branch) => branch.y - frame.top)
    hold(box)
  }

  let y = lifelineTop + FIRST_ROW_GAP
  for (const step of steps) {
    switch (step.type) {
      case 'message': {
        const text = label(step)
        const labelHeight = textHeight(text, step.font)
        const arrowY = y + labelHeight + ARROW_GAP
        const self = at(step.from) === at(step.to)
        const returnY = self ? arrowY + SELF_HEIGHT : arrowY
        const right = center(step.to) > center(step.from)
        const activated = (key: string) => step.activate.filter((other) => other === key).length
        const fromDepth = openOf(step.from).length + (self ? 0 : activated(step.from))
        const toDepth = openOf(step.to).length + activated(step.to)
        // Ends first, so that a message may end an activation and start another one.
        for (const key of step.deactivate) {
          const bar = openOf(key).pop()
          if (bar) bars.push({ key, depth: bar.depth, top: bar.top, bottom: arrowY })
        }
        for (const key of step.activate) {
          const bars = openOf(key)
          bars.push({ top: self && key === step.to ? returnY : arrowY, depth: bars.length })
          open.set(key, bars)
        }
        const from = edge(step.from, fromDepth, self || right)
        const to = edge(step.to, toDepth, self || !right)
        const width = Math.ceil(measure(text, step.font))
        const box = self
          ? { x: Math.min(from, to), y, width: Math.max(SELF_WIDTH, width + SELF_LABEL_X) + 4, height: returnY - y + ROW_GAP }
          : { x: Math.min(from, to), y, width: Math.max(1, Math.abs(to - from)), height: arrowY - y + ROW_GAP }
        stepBoxes.set(step.id, { box, hidden: false })
        messages.set(step.id, { from, to, y: arrowY, y2: returnY, self, number: diagram.numbered ? numbers.get(step.id)! : null })
        hold(box)
        y = box.y + box.height
        break
      }
      case 'note': {
        const width = noteWidth(step, measure)
        const height = textHeight(step.text, step.font) + 2 * NOTE_PADDING
        const [first, last] = [center(step.from), center(step.to)].sort((a, b) => a - b) as [number, number]
        let x: number
        let noteBoxWidth = width
        if (step.placement === 'right') x = first + NOTE_GAP
        else if (step.placement === 'left') x = first - NOTE_GAP - width
        else if (first === last) x = first - width / 2
        else {
          noteBoxWidth = Math.max(width, last - first + 2 * NOTE_OVERHANG)
          x = (first + last) / 2 - noteBoxWidth / 2
        }
        const box = { x, y: y + ROW_GAP / 2, width: noteBoxWidth, height }
        stepBoxes.set(step.id, { box, hidden: false })
        hold(box)
        y = box.y + box.height + ROW_GAP
        break
      }
      case 'frame': {
        const kindWidth = tabWidth(measure(step.kind, bold(step.font)))
        const condition = step.text.trim() ? Math.ceil(measure(`[${step.text}]`, step.font)) + 16 : 0
        frames.set(step.id, { kind: step.kind, tabWidth: kindWidth, branches: [] })
        stack.push({ id: step.id, kind: step.kind, top: y, contents: [], branches: [], minWidth: kindWidth + condition + 16 })
        y += FRAME_HEADER
        break
      }
      case 'else': {
        const frame = stack.at(-1)
        if (!frame) {
          stepBoxes.set(step.id, { box: { x: 0, y, width: 0, height: 0 }, hidden: true })
          break
        }
        const height = textHeight(step.text, step.font) + BRANCH_GAP
        frame.branches.push({ id: step.id, y, height })
        frame.minWidth = Math.max(frame.minWidth, Math.ceil(measure(`[${step.text}]`, step.font)) + 24)
        y += height
        break
      }
      case 'end': {
        const frame = stack.pop()
        if (!frame) {
          stepBoxes.set(step.id, { box: { x: 0, y, width: 0, height: 0 }, hidden: true })
          break
        }
        y += FRAME_FOOTER
        closeFrame(frame, y, step.id)
        y += ROW_GAP / 2
        break
      }
    }
  }
  // A frame without an end ends under the last row.
  while (stack.length > 0) closeFrame(stack.pop()!, y, null)
  const lifelineBottom = y + LIFELINE_TAIL
  for (const [key, list] of open) {
    for (const bar of list) bars.push({ key, depth: bar.depth, top: bar.top, bottom: Math.max(bar.top, lifelineBottom - OPEN_BAR_TAIL) })
  }

  // Everything moves right so that the leftmost part is the padding away from the frame of the diagram.
  const boxes = [...[...participantBoxes.values()].map((participant) => participant.box), ...[...stepBoxes.values()].filter((step) => !step.hidden).map((step) => step.box)]
  const keyOf = new Map(participants.map((participant) => [participant.key, participant.id]))
  const barBoxes = bars.map((bar) => ({ ...bar, x: center(bar.key) - BAR_WIDTH / 2 + bar.depth * BAR_SHIFT }))
  const left = Math.min(0, ...boxes.map((box) => box.x), ...barBoxes.map((bar) => bar.x))
  const dx = PADDING - left
  const right = Math.max(0, ...boxes.map((box) => box.x + box.width), ...barBoxes.map((bar) => bar.x + BAR_WIDTH)) + dx
  const titleWidth = tabWidth(measure(diagram.title.trim() ? `sd ${diagram.title}` : 'sd', diagram.font))
  const round = (box: Box): Box => {
    const x = Math.round(box.x + dx)
    const top = Math.round(box.y)
    return { x, y: top, width: Math.round(box.x + dx + box.width) - x, height: Math.round(box.y + box.height) - top }
  }
  const width = Math.max(MIN_WIDTH, Math.ceil(right + PADDING), titleWidth + 2 * PADDING)
  return {
    width,
    height: Math.round(lifelineBottom + PADDING),
    titleWidth,
    lifelineTop,
    lifelineBottom: Math.round(lifelineBottom),
    participants: new Map(
      [...participantBoxes].map(([id, participant]) => [id, { box: round(participant.box), center: Math.round(participant.center + dx) }]),
    ),
    steps: new Map([...stepBoxes].map(([id, step]) => [id, { box: step.hidden ? { ...step.box } : round(step.box), hidden: step.hidden }])),
    messages: new Map(
      [...messages].map(([id, message]) => [
        id,
        { ...message, from: Math.round(message.from + dx), to: Math.round(message.to + dx), y: Math.round(message.y), y2: Math.round(message.y2) },
      ]),
    ),
    frames,
    bars: barBoxes.map((bar) => ({
      participant: keyOf.get(bar.key) ?? '',
      x: Math.round(bar.x + dx),
      top: Math.round(bar.top),
      bottom: Math.round(bar.bottom),
    })),
  }
}
