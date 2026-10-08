import {
  BRANCH_WORDS,
  SequenceBuilder,
  type FrameKind,
  type MessageArrow,
  type ParticipantKind,
  type SequenceDiagram,
  type SequenceMessage,
} from '../diagram/sequence.ts'

/**
 * Sequence diagrams of Mermaid (`sequenceDiagram`): reading their statements into a diagram of CoDraw and writing a
 * diagram back. Mermaid has more than CoDraw draws: groups of participants (`box`), highlighted parts (`rect`), creation
 * and destruction of participants and links are left out, without breaking the nesting of frames.
 */

/** The arrows of messages of Mermaid, longer ones first, with the kind of message each gives. */
const ARROWS: readonly [string, MessageArrow][] = [
  ['<<-->>', 'reply'],
  ['<<->>', 'sync'],
  ['-->>', 'reply'],
  ['->>', 'sync'],
  ['--)', 'reply'],
  ['-)', 'async'],
  ['--x', 'reply'],
  ['-x', 'sync'],
  ['-->', 'reply'],
  ['->', 'sync'],
]

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A name of a participant in a message: no arrows, colons, pluses, commas or semicolons. */
const NAME = String.raw`[^\-<>:+,;]+?`
const MESSAGE = new RegExp(
  String.raw`^\s*(${NAME})\s*(${ARROWS.map(([arrow]) => escapeRegExp(arrow)).join('|')})\s*([+-]?)\s*(${NAME})\s*:(.*)$`,
  'u',
)

/** A message of Mermaid as a line has it. */
export interface MessageLine {
  from: string
  to: string
  arrow: MessageArrow
  /** `+` before the receiver activates it, `-` ends the activation of the sender. */
  activation: '+' | '-' | null
  text: string
}

/** The message a line of Mermaid writes, e.g. `Клиент->>+API: POST /login`; `null` for any other line. */
export function parseMessageLine(line: string): MessageLine | null {
  const match = MESSAGE.exec(line)
  if (!match) return null
  const arrow = ARROWS.find(([text]) => text === match[2])![1]
  const sign = match[3]
  return {
    from: match[1]!.trim(),
    to: match[4]!.trim(),
    arrow,
    activation: sign === '+' || sign === '-' ? sign : null,
    text: match[5]!.trim(),
  }
}

/** Text of Mermaid: quotes away, `<br>` as a new line, codes of characters as the characters. */
export function mermaidText(raw: string): string {
  let text = raw.trim()
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) text = text.slice(1, -1)
  return text
    .replace(/\s*<br\s*\/?>\s*/gi, '\n')
    .replace(/#quot;/g, '"')
    .replace(/#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .trim()
}

/** The kinds of participants of Mermaid `@{ "type": … }` that CoDraw draws; the others are plain participants. */
const MERMAID_KINDS: Readonly<Record<string, ParticipantKind>> = { database: 'database', queue: 'queue' }

const FRAME_WORDS = new Set<FrameKind>(['alt', 'opt', 'loop', 'par', 'critical', 'break'])
const BRANCH_STATEMENTS = new Set(['else', 'and', 'option'])
/** Statements of Mermaid that draw nothing in CoDraw; `box` and `rect` have an `end` of their own. */
const SKIPPED = /^(destroy|links?|properties|details|accTitle|accDescr)\b/i

export interface SequenceMermaid {
  kind: 'sequence'
  diagram: SequenceDiagram
  /** Lines that draw nothing CoDraw has, and lines not understood. */
  skipped: number
}

/** Reads the statements of a `sequenceDiagram` after its header: lines without comments, trimmed. */
export function parseSequence(lines: string[]): SequenceMermaid {
  const builder = new SequenceBuilder()
  const diagram = builder.diagram
  let skipped = 0
  const keys = new Map<string, string>()
  const participant = (id: string) => {
    let key = keys.get(id)
    if (!key) {
      key = builder.participant(id)
      keys.set(id, key)
    }
    return key
  }
  // What `end` closes: a frame, or a group or a highlight that CoDraw does not draw.
  const blocks: ('frame' | 'other')[] = []
  let last: SequenceMessage | null = null
  // Activations before the first message start at its arrow.
  const pending: string[] = []

  for (const line of lines) {
    const word = /^(\S+)/.exec(line)?.[1] ?? ''
    const lower = word.toLowerCase()
    const declaration = /^(?:create\s+)?(participant|actor)\s+(.+)$/i.exec(line)
    if (declaration) {
      const spec = /^(.+?)(?:\s*@\{(.*)\})?(?:\s+as\s+(.+))?$/.exec(declaration[2]!.trim())
      if (!spec) {
        skipped++
        continue
      }
      const id = spec[1]!.trim()
      const key = participant(id)
      const entry = diagram.participants.find((candidate) => candidate.key === key)!
      const type = /"type"\s*:\s*"([^"]*)"/.exec(spec[2] ?? '')?.[1]?.toLowerCase()
      entry.kind = declaration[1]!.toLowerCase() === 'actor' ? 'actor' : (MERMAID_KINDS[type ?? ''] ?? 'participant')
      const alias = /"alias"\s*:\s*"([^"]*)"/.exec(spec[2] ?? '')?.[1] ?? spec[3]
      entry.name = mermaidText(alias ?? id)
      continue
    }
    if (lower === 'autonumber') {
      diagram.numbered = !/^autonumber\s+off\b/i.test(line)
      continue
    }
    if (lower === 'title' || lower === 'title:') {
      diagram.title = mermaidText(line.replace(/^title:?\s*/i, ''))
      continue
    }
    if (lower === 'activate' || lower === 'deactivate') {
      const key = participant(line.slice(word.length).trim())
      if (lower === 'activate') (last ? last.activate : pending).push(key)
      else if (last) last.deactivate.push(key)
      continue
    }
    const note = /^note\s+(left of|right of|over)\s+([^:]+?)\s*:(.*)$/i.exec(line)
    if (note) {
      const names = note[2]!.split(',').map((name) => participant(name.trim()))
      const placement = note[1]!.toLowerCase() === 'over' ? 'over' : note[1]!.toLowerCase().startsWith('left') ? 'left' : 'right'
      builder.note(names[0]!, names.at(-1)!, mermaidText(note[3]!), placement)
      continue
    }
    if (FRAME_WORDS.has(lower as FrameKind)) {
      builder.frame(lower as FrameKind, mermaidText(line.slice(word.length)))
      blocks.push('frame')
      continue
    }
    if (BRANCH_STATEMENTS.has(lower)) {
      if (blocks.at(-1) === 'frame') builder.branch(mermaidText(line.slice(word.length)))
      else skipped++
      continue
    }
    if (lower === 'box' || lower === 'rect') {
      blocks.push('other')
      skipped++
      continue
    }
    if (lower === 'end') {
      if (blocks.pop() === 'frame') builder.end()
      continue
    }
    if (SKIPPED.test(line)) {
      skipped++
      continue
    }
    const message = parseMessageLine(line)
    if (!message) {
      skipped++
      continue
    }
    const from = participant(message.from)
    const to = participant(message.to)
    last = builder.message(from, to, mermaidText(message.text), message.arrow, {
      activate: [...pending.splice(0), ...(message.activation === '+' ? [to] : [])],
      deactivate: message.activation === '-' ? [from] : [],
    })
  }
  // A frame without its `end` ends with the diagram.
  for (const block of blocks.reverse()) if (block === 'frame') builder.end()
  return { kind: 'sequence', diagram, skipped }
}

/** Words of Mermaid that cannot be ids of participants. */
const RESERVED = new Set([
  'participant',
  'actor',
  'as',
  'end',
  'alt',
  'else',
  'opt',
  'loop',
  'par',
  'and',
  'critical',
  'option',
  'break',
  'rect',
  'box',
  'note',
  'over',
  'activate',
  'deactivate',
  'autonumber',
  'title',
  'create',
  'destroy',
  'link',
  'links',
])

/** Text as Mermaid writes it in a message, a note or a condition: `<br>` for a new line, codes for `#` and `;`. */
const escapeText = (text: string) =>
  text
    .replace(/[#;]/g, (char) => (char === '#' ? '#35;' : '#59;'))
    .replace(/\r?\n/g, '<br>')
    .trim()

const ARROW_TEXT: Record<MessageArrow, string> = { sync: '->>', async: '-)', reply: '-->>' }

/**
 * The diagram as a `sequenceDiagram` of Mermaid. A participant's id is its name when the name is one word, else `P1`,
 * `P2`, … with the name after `as`. Services, databases and queues are plain participants: the `@{ "type" }` of
 * Mermaid is not in all of its versions. An activation that `+` before the receiver or `-` before it says is written so,
 * others as `activate` and `deactivate` after the message.
 */
export function sequenceMermaid(diagram: SequenceDiagram): string {
  const lines = ['sequenceDiagram']
  const indent = (depth: number) => '    ' + '  '.repeat(depth)
  if (diagram.title.trim()) lines.push(`${indent(0)}title ${escapeText(diagram.title)}`)
  if (diagram.numbered) lines.push(`${indent(0)}autonumber`)
  const ids = new Map<string, string>()
  const used = new Set<string>()
  diagram.participants.forEach((participant, index) => {
    const name = participant.name.trim()
    const word = /^[\p{L}\p{N}_]+$/u.test(name) && !RESERVED.has(name.toLowerCase()) && !used.has(name)
    let id = word ? name : `P${index + 1}`
    while (used.has(id)) id = `${id}_`
    used.add(id)
    ids.set(participant.key, id)
    const keyword = participant.kind === 'actor' ? 'actor' : 'participant'
    lines.push(`${indent(0)}${keyword} ${id}${word ? '' : ` as ${escapeText(name) || id}`}`)
  })
  const idOf = (key: string) => ids.get(key) ?? [...ids.values()][0] ?? 'P1'
  const frames: FrameKind[] = []
  for (const step of diagram.steps) {
    const depth = frames.length
    switch (step.type) {
      case 'message': {
        const activate = [...step.activate]
        const deactivate = [...step.deactivate]
        let sign = ''
        if (activate.includes(step.to)) {
          sign = '+'
          activate.splice(activate.indexOf(step.to), 1)
        } else if (deactivate.includes(step.from)) {
          sign = '-'
          deactivate.splice(deactivate.indexOf(step.from), 1)
        }
        lines.push(`${indent(depth)}${idOf(step.from)}${ARROW_TEXT[step.arrow]}${sign}${idOf(step.to)}: ${escapeText(step.text)}`)
        for (const key of deactivate) lines.push(`${indent(depth)}deactivate ${idOf(key)}`)
        for (const key of activate) lines.push(`${indent(depth)}activate ${idOf(key)}`)
        break
      }
      case 'note': {
        const where =
          step.placement === 'over'
            ? `over ${step.from === step.to ? idOf(step.from) : `${idOf(step.from)},${idOf(step.to)}`}`
            : `${step.placement} of ${idOf(step.from)}`
        lines.push(`${indent(depth)}Note ${where}: ${escapeText(step.text)}`)
        break
      }
      case 'frame':
        lines.push(`${indent(depth)}${step.kind}${step.text.trim() ? ` ${escapeText(step.text)}` : ''}`)
        frames.push(step.kind)
        break
      case 'else': {
        // A branch outside any frame draws nothing.
        const frame = frames.at(-1)
        if (frame) lines.push(`${indent(depth - 1)}${BRANCH_WORDS[frame] ?? 'else'}${step.text.trim() ? ` ${escapeText(step.text)}` : ''}`)
        break
      }
      case 'end':
        if (frames.pop()) lines.push(`${indent(depth - 1)}end`)
        break
    }
  }
  while (frames.pop()) lines.push(`${indent(frames.length)}end`)
  return lines.join('\n') + '\n'
}
