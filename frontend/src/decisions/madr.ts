import type { Decision, DecisionContent, DecisionStatus } from '../api/decisions.ts'
import { decisionCode } from './decisions.ts'

/** Letters of Russian in Latin, for names of files that every system and repository takes. */
const LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

/** The title as a part of a name of a file: Latin letters and digits between hyphens, «Kafka для событий» → `kafka-dlya-sobytiy`. */
export function slug(title: string, maxLength = 60): string {
  const latin = [...title.toLowerCase()].map((letter) => LATIN[letter] ?? letter).join('')
  const words = latin
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (words.length <= maxLength) return words || 'decision'
  // A long title is cut between words, a single long word where it has to be.
  const cut = words.slice(0, maxLength)
  const wordEnd = words[maxLength] === '-' ? cut.length : cut.lastIndexOf('-')
  return wordEnd > 0 ? cut.slice(0, wordEnd) : cut
}

/** The name of the file of a decision as MADR names them: `0008-kafka-for-events.md`. */
export const madrFileName = (decision: Pick<Decision, 'number' | 'title'>) =>
  `${String(decision.number).padStart(4, '0')}-${slug(decision.title)}.md`

/** A string of YAML in double quotes. */
const yamlString = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/**
 * The decision as a file of MADR 4: the status, the day and the author in the front matter, the title, then the
 * sections under the headings of the template; empty sections are left out. A superseded decision links the file of
 * the decision that superseded it, while the board has it.
 */
export function toMadr(decision: Decision, decisions: readonly Decision[]): string {
  const successor = decision.supersededBy ? decisions.find((other) => other.id === decision.supersededBy) : undefined
  const status = successor
    ? `superseded by [${decisionCode(successor.number)}](${madrFileName(successor)})`
    : decision.status
  const lines = ['---', `status: ${yamlString(status)}`, `date: ${decision.decidedOn}`]
  if (decision.author) lines.push(`decision-makers: ${yamlString(decision.author.name)}`)
  lines.push('---', '', `# ${decision.title}`)
  const section = (heading: string, text: string) => {
    if (text !== '') lines.push('', heading, '', text)
  }
  section('## Context and Problem Statement', decision.context)
  section('## Considered Options', decision.options)
  if (decision.outcome !== '' || decision.consequences !== '') lines.push('', '## Decision Outcome')
  if (decision.outcome !== '') lines.push('', decision.outcome)
  section('### Consequences', decision.consequences)
  return `${lines.join('\n')}\n`
}

/** A decision read from a file of MADR, before it is written down on the board. */
export interface ParsedDecision {
  /** The number from the name of the file, or from the title: `0008-….md`, `# 8. …`, `# ADR-0008: …`. */
  number: number | null
  /** What it says; without a day in the file, `decidedOn` is `null` and the board dates it today. */
  content: Omit<DecisionContent, 'decidedOn' | 'supersededBy'> & { decidedOn: string | null }
  /** The number of the decision that superseded it, as its status names it: `superseded by ADR-0005`. */
  supersededByNumber: number | null
}

type Section = 'context' | 'options' | 'outcome' | 'consequences'

/** A heading of a section and where its text goes; `keep` keeps the heading, a part of a section rather than all of it. */
interface Heading {
  section: Section | 'status'
  keep: boolean
}

const HEADINGS: [RegExp, Heading][] = [
  [/^(context( and problem statement)?|problem statement|контекст( и (проблема|постановка задачи))?|постановка задачи)$/, { section: 'context', keep: false }],
  [/^(decision drivers|факторы( решения)?|движущие силы)$/, { section: 'context', keep: true }],
  [/^(considered options|options|рассмотренные варианты|варианты( решения)?|альтернативы)$/, { section: 'options', keep: false }],
  [/^(pros and cons of the options|плюсы и минусы( вариантов)?|отклон[её]нные альтернативы)$/, { section: 'options', keep: true }],
  [/^(decision outcome|decision|outcome|решение|принятое решение|итог)$/, { section: 'outcome', keep: false }],
  [/^(обоснование|rationale)$/, { section: 'outcome', keep: true }],
  [/^(consequences|последствия)$/, { section: 'consequences', keep: false }],
  [/^((positive|negative|good|bad) consequences|(положительные|отрицательные) последствия|confirmation|подтверждение)$/, { section: 'consequences', keep: true }],
  [/^(status|статус)$/, { section: 'status', keep: false }],
]

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/\(optional\)|\(необязательно\)/g, '')
    .replace(/[*_`:.]/g, '')
    .trim()

function headingOf(text: string): Heading | null {
  const name = normalize(text)
  return HEADINGS.find(([pattern]) => pattern.test(name))?.[1] ?? null
}

/** The status that the file names, and the number of the decision that superseded it, if it names one. */
function statusOf(text: string): { status: DecisionStatus; by: number | null } {
  const value = normalize(text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'))
  if (/^(superseded|deprecated|заменено|заменен|заменена|устарело|устарел)/.test(value)) {
    const by = /(\d{1,5})/.exec(value)
    return { status: 'superseded', by: by ? Number(by[1]) : null }
  }
  if (/^(accepted|approved|принято|принят|принята|утверждено)/.test(value)) return { status: 'accepted', by: null }
  if (/^(rejected|declined|отклонено|отклонен|отклонена)/.test(value)) return { status: 'rejected', by: null }
  return { status: 'proposed', by: null }
}

const dayOf = (text: string) => /\b(\d{4}-\d{2}-\d{2})\b/.exec(text)?.[1] ?? null

/** `key: value` of a list of the preamble, also `- **Статус:** принято` and `* Status: accepted`. */
function metadataOf(line: string): [string, string] | null {
  const match = /^\s*(?:[-*+]\s+)?([\p{L}][\p{L} -]*?)\s*:\s*(.+)$/u.exec(line.replace(/\*\*|__/g, ''))
  return match ? [normalize(match[1]!), match[2]!.trim()] : null
}

const STATUS_KEYS = new Set(['status', 'статус'])
const DATE_KEYS = new Set(['date', 'дата'])
/** Keys of the preamble that the board keeps otherwise, or not at all: who decided, who was asked. */
const IGNORED_KEYS = new Set(['deciders', 'decision-makers', 'consulted', 'informed', 'автор', 'авторы', 'участники'])

const unquote = (value: string) => value.trim().replace(/^(["'])(.*)\1$/, '$2')

/** The number and the title of a heading of MADR: `8. Kafka`, `ADR-0008: Kafka`, `[ADR-8] Kafka`. */
function titleOf(heading: string): { number: number | null; title: string } {
  // Without `ADR`, a number is a number of the record only with a mark after it: «2026 roadmap» is a title.
  const match = /^(?:\[?adr[-\s]?(\d{1,5})\]?\s*[.:)–—-]?\s*|(\d{1,5})\s*[.:)–—-]\s*)(.+)$/i.exec(heading)
  return match ? { number: Number(match[1] ?? match[2]), title: match[3]!.trim() } : { number: null, title: heading }
}

/** The name of the file without its folders. */
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** The number that starts the name of a file: `0008-kafka.md` → 8. */
export function fileNumber(path: string): number | null {
  const match = /^(\d{1,5})(?:[-_. ]|$)/.exec(baseName(path))
  return match ? Number(match[1]) : null
}

/**
 * Reads a decision from a file of MADR, of versions 2 to 4, or of a record in Russian like those of CoDraw itself:
 * the status and the day from the front matter or from the list under the title, the sections by their headings. A
 * section the board has no field for goes, with its heading, into the field it is closest to; nothing of the text is
 * lost. `null` for a file without a title.
 */
export function parseMadr(path: string, text: string): ParsedDecision | null {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  const meta = new Map<string, string>()
  let start = 0
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, index) => index > 0 && (line.trim() === '---' || line.trim() === '...'))
    if (end > 0) {
      for (const line of lines.slice(1, end)) {
        const match = /^([\w-]+)\s*:\s*(.*)$/.exec(line)
        if (match) meta.set(match[1]!.toLowerCase(), unquote(match[2]!))
      }
      start = end + 1
    }
  }

  let heading: { number: number | null; title: string } | null = null
  const sections: Record<Section | 'status' | 'preamble', string[]> = {
    preamble: [],
    context: [],
    options: [],
    outcome: [],
    consequences: [],
    status: [],
  }
  let current: Section | 'status' | 'preamble' = 'preamble'
  let fence: string | null = null
  for (const line of lines.slice(start)) {
    const fenceMatch = /^\s*(```|~~~)/.exec(line)
    if (fenceMatch) fence = fence === null ? fenceMatch[1]! : fence === fenceMatch[1] ? null : fence
    const match = fence === null && !fenceMatch ? /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line) : null
    if (match && match[1] === '#' && !heading) {
      heading = titleOf(match[2]!)
      continue
    }
    if (!heading) continue
    if (match && match[1] === '##') {
      const known = headingOf(match[2]!)
      // An unknown section goes on in the one before it, or in the context.
      if (known) current = known.section
      else if (current === 'preamble' || current === 'status') current = 'context'
      if (!known || known.keep) sections[current].push(`### ${match[2]!}`)
      continue
    }
    if (match && match[1] === '###') {
      const known = headingOf(match[2]!)
      if (known?.section === 'consequences') {
        current = 'consequences'
        if (known.keep) sections.consequences.push(line)
        continue
      }
    }
    if (current === 'preamble') {
      const entry = metadataOf(line)
      if (entry && STATUS_KEYS.has(entry[0])) meta.set('status', entry[1])
      else if (entry && DATE_KEYS.has(entry[0])) meta.set('date', entry[1])
      else if (!entry || !IGNORED_KEYS.has(entry[0])) sections.preamble.push(line)
      continue
    }
    sections[current].push(line)
  }
  if (!heading || heading.title === '') return null

  const join = (parts: string[]) => parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const statusLine = meta.get('status') ?? sections.status.find((line) => line.trim() !== '') ?? ''
  const { status, by } = statusOf(statusLine)
  const preamble = join(sections.preamble)
  const context = join(sections.context)
  return {
    number: fileNumber(path) ?? heading.number,
    content: {
      title: heading.title.slice(0, 200),
      status,
      decidedOn: dayOf(meta.get('date') ?? ''),
      context: [preamble, context].filter((part) => part !== '').join('\n\n'),
      options: join(sections.options),
      outcome: join(sections.outcome),
      consequences: join(sections.consequences),
    },
    supersededByNumber: by,
  }
}

/** Names of files of a folder of records that are no records: its index and its template. */
const NOT_RECORDS = /^(readme|index|template|adr-template|_template)\.(md|markdown)$/i

/**
 * The files of Markdown to read decisions from: of a folder, only those whose names start with a number, like
 * `0008-kafka.md`; of the files chosen one by one, all but an index or a template.
 */
export function recordFiles<T extends { name: string }>(files: readonly T[], fromFolder: boolean): T[] {
  return files.filter(
    (file) =>
      /\.(md|markdown)$/i.test(file.name) &&
      !NOT_RECORDS.test(file.name) &&
      (!fromFolder || fileNumber(file.name) !== null),
  )
}
