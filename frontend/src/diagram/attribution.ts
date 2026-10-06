import { relativeTime } from '../lib/relativeTime.ts'
import { LOCKED_BY_KEY, LOCKED_KEY } from './locks.ts'
import type { CellMap, CellWrite } from './model.ts'

/**
 * Keys of a cell in the board document with who changed it last and when: the id of the user, their name as it was
 * then, and the time in milliseconds since the epoch by the clock of their computer. They are not fields of the cell
 * that maxGraph gets, so files, the clipboard and copies do not carry them.
 */
export const MODIFIED_BY_KEY = 'modifiedBy'
export const MODIFIED_BY_NAME_KEY = 'modifiedByName'
export const MODIFIED_AT_KEY = 'modifiedAt'

/** The participant whose changes the cells keep as who changed them last. */
export interface Author {
  /** The id of the user. */
  id: string
  name: string
}

/** Who changed a cell last and when, as the cell keeps it. */
export interface Attribution {
  /** The id of the user, or `null` when the cell does not keep it. */
  by: string | null
  /** The name of the user at the time of the change. */
  name: string
  /** Milliseconds since the epoch, by the clock of the author. */
  at: number
}

/**
 * Keys of the style that locking and unlocking change. A lock is not a change of the cell: who changed it last stays,
 * and the lock shows who locked it.
 */
const UNATTRIBUTED_STYLE_KEYS: ReadonlySet<string> = new Set([LOCKED_KEY, LOCKED_BY_KEY])

/** A write of a cell that makes its author the one who changed it last: anything that changed it but a lock. */
export function isAttributedWrite(write: CellWrite): boolean {
  return write.created || write.fields.length > 0 || write.style.some((key) => !UNATTRIBUTED_STYLE_KEYS.has(key))
}

/**
 * Keeps in the cell that `author` changed it at `at`. Every write of a key leaves the replaced value in the document,
 * so the author is written only when it differs from the stored one; a cell not in a document yet gets all of it.
 */
export function writeAttribution(cell: CellMap, author: Author, at: number) {
  const detached = cell.doc === null
  if (detached || cell.get(MODIFIED_BY_KEY) !== author.id) cell.set(MODIFIED_BY_KEY, author.id)
  if (detached || cell.get(MODIFIED_BY_NAME_KEY) !== author.name) cell.set(MODIFIED_BY_NAME_KEY, author.name)
  cell.set(MODIFIED_AT_KEY, at)
}

/**
 * Who changed the cell last, or `null` for a cell that does not keep it, e.g. one last changed before CoDraw kept it.
 */
export function readAttribution(cell: CellMap | undefined): Attribution | null {
  const name = cell?.get(MODIFIED_BY_NAME_KEY)
  const at = cell?.get(MODIFIED_AT_KEY)
  if (typeof name !== 'string' || name.trim() === '' || typeof at !== 'number' || !Number.isFinite(at)) return null
  const by = cell!.get(MODIFIED_BY_KEY)
  return { by: typeof by === 'string' && by !== '' ? by : null, name, at }
}

/** «Изменено: Боб, 5 минут назад» at `now`; `mine` adds «(вы)» after the name, as the list of participants does. */
export function attributionLabel(attribution: Attribution, now: number, mine = false): string {
  return `Изменено: ${attribution.name}${mine ? ' (вы)' : ''}, ${relativeTime(attribution.at, now)}`
}
