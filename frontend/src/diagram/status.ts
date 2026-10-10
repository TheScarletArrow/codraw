import { perLocale } from '../i18n/i18n.ts'
import type { Author } from './attribution.ts'
import { statusLabels } from './model.messages.ts'
import type { CellMap } from './model.ts'

/** Statuses of an element of a board, from the first draft to an agreed part of the diagram. */
export const ELEMENT_STATUSES = ['draft', 'review', 'done'] as const

export type ElementStatus = (typeof ELEMENT_STATUSES)[number]

/** What a status is called in the interface. */
export const STATUS_LABELS: Readonly<Record<ElementStatus, string>> = statusLabels

/**
 * Keys of a cell in the board document with its status and who set it when: the status, the id of the user, their name
 * as it was then, and the time in milliseconds since the epoch by the clock of their computer. Like the keys of who
 * changed a cell last, they are not fields of the cell that maxGraph gets, so files, the clipboard and copies do not
 * carry them; versions and proposals, which are documents of the board, do.
 */
export const STATUS_KEY = 'status'
export const STATUS_BY_KEY = 'statusBy'
export const STATUS_BY_NAME_KEY = 'statusByName'
export const STATUS_AT_KEY = 'statusAt'

export const STATUS_KEYS: readonly string[] = [STATUS_KEY, STATUS_BY_KEY, STATUS_BY_NAME_KEY, STATUS_AT_KEY]

/** The status of an element as its cell keeps it. */
export interface StatusMark {
  status: ElementStatus
  /** The id of the user who set it, `null` when the cell does not keep it. */
  by: string | null
  /** The name of that user at the time, `null` when the cell does not keep it. */
  name: string | null
  /** Milliseconds since the epoch by the clock of that user, `null` when the cell does not keep it. */
  at: number | null
}

/** The status of the selected elements that may have one (see `DiagramEditor.setStatus`). */
export interface SelectionStatus {
  /** The status all of them have, `null` when none of them has one or when they differ. */
  value: ElementStatus | null
  /** They have different statuses, or some of them have none. */
  mixed: boolean
}

export const isElementStatus = (value: unknown): value is ElementStatus =>
  (ELEMENT_STATUSES as readonly unknown[]).includes(value)

/**
 * The status of a cell, or `null` for one without a status. A value CoDraw does not know, e.g. of a later version, is no
 * status here; it stays in the document until the status is set.
 */
export function readStatus(cell: CellMap | undefined): StatusMark | null {
  const status = cell?.get(STATUS_KEY)
  if (!isElementStatus(status)) return null
  const by = cell!.get(STATUS_BY_KEY)
  const name = cell!.get(STATUS_BY_NAME_KEY)
  const at = cell!.get(STATUS_AT_KEY)
  return {
    status,
    by: typeof by === 'string' && by !== '' ? by : null,
    name: typeof name === 'string' && name.trim() !== '' ? name : null,
    at: typeof at === 'number' && Number.isFinite(at) ? at : null,
  }
}

/**
 * Sets the status of a cell in the name of `author` at `at`, or with `null` takes the status and its mark off; returns
 * whether it changed anything. A cell that has the status already keeps it with its mark. Every write of a key leaves the
 * replaced value in the document, so keys that hold the value already are not written again.
 */
export function writeStatus(cell: CellMap, status: ElementStatus | null, author: Author | null, at: number): boolean {
  if (status === null) {
    const present = STATUS_KEYS.filter((key) => cell.has(key))
    present.forEach((key) => cell.delete(key))
    return present.length > 0
  }
  if (cell.get(STATUS_KEY) === status) return false
  cell.set(STATUS_KEY, status)
  if (author) {
    if (cell.get(STATUS_BY_KEY) !== author.id) cell.set(STATUS_BY_KEY, author.id)
    if (cell.get(STATUS_BY_NAME_KEY) !== author.name) cell.set(STATUS_BY_NAME_KEY, author.name)
  } else {
    cell.delete(STATUS_BY_KEY)
    cell.delete(STATUS_BY_NAME_KEY)
  }
  cell.set(STATUS_AT_KEY, at)
  return true
}

/** Takes the status off a copy of a cell that is not in a document yet: a copy is a new element. */
export function clearStatus(cell: CellMap) {
  STATUS_KEYS.forEach((key) => cell.delete(key))
}

const exactTime = perLocale((tag) => new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' }))

/** When a status was set, as its badge says it: «7 окт. 2026 г., 14:05». */
export const statusTime = (at: number) => exactTime().format(at)

/** What the badge of a status says: «Нужно ревью — Алиса, 7 окт. 2026 г., 14:05», or less when the cell keeps less. */
export function statusLabel({ status, name, at }: StatusMark): string {
  const who = [name, at === null ? null : statusTime(at)].filter((part) => part !== null).join(', ')
  return who ? `${STATUS_LABELS[status]} — ${who}` : STATUS_LABELS[status]
}

/** The common status of the statuses of several elements, see {@link SelectionStatus}; `null` without elements. */
export function commonStatus(statuses: readonly (ElementStatus | null)[]): SelectionStatus | null {
  if (statuses.length === 0) return null
  const first = statuses[0]!
  const mixed = statuses.some((status) => status !== first)
  return { value: mixed ? null : first, mixed }
}
