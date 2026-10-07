import { clearDocument, IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'

/**
 * Local copies of boards: the document of every board a user opens is kept in an IndexedDB database of this browser,
 * one per user and board, so that the board shows at once next time and edits made without a connection survive the
 * tab. A registry in `localStorage` tells which copies there are, when they were opened and whether they hold edits
 * that collab has not taken yet.
 */

/** The most boards whose copies one user keeps in the browser; the least recently opened go first. */
export const LOCAL_COPY_LIMIT = 20

/** What the registry keeps about the local copy of a board. */
export interface LocalCopy {
  userId: string
  boardId: string
  /** The title of the board when it was last opened, which names a downloaded copy. */
  title: string
  /** When the board was last opened in this browser, in milliseconds since the epoch. */
  openedAt: number
  /** The copy holds edits that collab has not taken yet. */
  pending: boolean
}

const REGISTRY_KEY = 'codraw.local-copies'

/** Every database of a copy is named with this prefix, then the user, so the copies of a user are found by name. */
const NAME_PREFIX = 'codraw:'

/** Whether the browser can keep local copies; some private windows have no IndexedDB. */
export function localCopiesAvailable() {
  return typeof indexedDB !== 'undefined'
}

/** The name of the IndexedDB database that keeps the copy of the board for the user. */
export function localCopyName(userId: string, boardId: string) {
  return `${NAME_PREFIX}${userId}:${boardId}`
}

const isCopyOf = (copy: LocalCopy, userId: string, boardId: string) => copy.userId === userId && copy.boardId === boardId

function isLocalCopy(value: unknown): value is LocalCopy {
  const copy = value as Partial<LocalCopy> | null
  return (
    typeof copy?.userId === 'string' &&
    typeof copy.boardId === 'string' &&
    typeof copy.title === 'string' &&
    typeof copy.openedAt === 'number' &&
    typeof copy.pending === 'boolean'
  )
}

/** The registry; a browser that keeps no data for the site, e.g. by its settings, has none. */
function readRegistry(): LocalCopy[] {
  try {
    const copies: unknown = JSON.parse(localStorage.getItem(REGISTRY_KEY) ?? '[]')
    return Array.isArray(copies) ? copies.filter(isLocalCopy) : []
  } catch {
    return []
  }
}

function writeRegistry(copies: LocalCopy[]) {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(copies))
  } catch {
    // The browser keeps no data for the site: the copies are not tracked, and the board works as without them.
  }
}

/** Whether this browser keeps a copy of any board, i.e. CoDraw was used in it before. */
export function keepsLocalCopies(): boolean {
  return readRegistry().length > 0
}

/** The copy of the board for the user, if this browser keeps one. */
export function findLocalCopy(userId: string, boardId: string): LocalCopy | null {
  return readRegistry().find((copy) => isCopyOf(copy, userId, boardId)) ?? null
}

/** Whether the copy of the board for the user holds edits that collab has not taken yet. */
export function hasUnsentEdits(userId: string, boardId: string): boolean {
  return findLocalCopy(userId, boardId)?.pending ?? false
}

/** Records whether the copy of the board for the user holds edits that collab has not taken yet. */
export function setUnsentEdits(userId: string, boardId: string, pending: boolean) {
  const copies = readRegistry()
  const copy = copies.find((other) => isCopyOf(other, userId, boardId))
  if (!copy || copy.pending === pending) return
  copy.pending = pending
  writeRegistry(copies)
}

/**
 * Keeps the document of the board in its copy for the user: what the copy has is loaded into `document`, and every
 * change of `document` is stored. Opening a board counts as using its copy; the copies of the user beyond
 * {@link LOCAL_COPY_LIMIT} are removed, those opened least recently first, except the copies with unsent edits.
 *
 * Returns `null` when the browser cannot keep copies (see {@link localCopiesAvailable}): the board works without one.
 */
export function openLocalCopy(userId: string, boardId: string, title: string, document: Y.Doc): IndexeddbPersistence | null {
  if (!localCopiesAvailable()) return null
  const copies = readRegistry()
  const previous = copies.find((copy) => isCopyOf(copy, userId, boardId))
  const others = copies.filter((copy) => copy !== previous)
  const own = others.filter((copy) => copy.userId === userId).sort((a, b) => b.openedAt - a.openedAt)
  // The board being opened takes one place, copies with unsent edits keep theirs.
  const places = Math.max(0, LOCAL_COPY_LIMIT - 1 - own.filter((copy) => copy.pending).length)
  const surplus = new Set(own.filter((copy) => !copy.pending).slice(places))
  // Later than any other copy even within one millisecond, so that the order of opening is exact.
  const openedAt = Math.max(Date.now(), ...copies.map((copy) => copy.openedAt + 1))
  writeRegistry([
    { userId, boardId, title, openedAt, pending: previous?.pending ?? false },
    ...others.filter((copy) => !surplus.has(copy)),
  ])
  surplus.forEach((copy) => void deleteDatabase(localCopyName(copy.userId, copy.boardId)))
  return new IndexeddbPersistence(localCopyName(userId, boardId), document)
}

/** A detached document with the content of the copy of the board for the user, e.g. to download it. */
export async function loadLocalCopy(userId: string, boardId: string): Promise<Y.Doc> {
  const document = new Y.Doc()
  const persistence = new IndexeddbPersistence(localCopyName(userId, boardId), document)
  try {
    // Opening the database fails first when the browser keeps no data for the site; loading would never end then.
    await persistence._db
    await persistence.whenSynced
  } finally {
    await persistence.destroy().catch(() => {})
  }
  return document
}

/** Removes the copy of the board for the user from the browser. */
export function deleteLocalCopy(userId: string, boardId: string): Promise<void> {
  return deleteCopies((copy) => isCopyOf(copy, userId, boardId), (name) => name === localCopyName(userId, boardId))
}

/** Removes the copies of the board from the browser, e.g. once its owner deleted it. */
export function deleteLocalCopiesOfBoard(boardId: string): Promise<void> {
  return deleteCopies(
    (copy) => copy.boardId === boardId,
    (name) => name.startsWith(NAME_PREFIX) && name.endsWith(`:${boardId}`),
  )
}

/** Removes every copy of the user from the browser, e.g. when they sign out. */
export function deleteLocalCopiesOf(userId: string): Promise<void> {
  return deleteCopies(
    (copy) => copy.userId === userId,
    (name) => name.startsWith(`${NAME_PREFIX}${userId}:`),
  )
}

/** Removes the copies of every other user from the browser: another user signed in, or a guest signed in as a user. */
export function keepLocalCopiesOf(userId: string): Promise<void> {
  return deleteCopies(
    (copy) => copy.userId !== userId,
    (name) => name.startsWith(NAME_PREFIX) && !name.startsWith(`${NAME_PREFIX}${userId}:`),
  )
}

/**
 * Removes the copies that the registry lists and that `listed` matches, and the databases whose names `named`
 * matches: a database the registry lost, e.g. because the browser could not write it, goes as well.
 */
async function deleteCopies(listed: (copy: LocalCopy) => boolean, named: (name: string) => boolean): Promise<void> {
  const copies = readRegistry()
  const removed = copies.filter(listed)
  if (removed.length > 0) writeRegistry(copies.filter((copy) => !listed(copy)))
  const names = new Set(removed.map((copy) => localCopyName(copy.userId, copy.boardId)))
  for (const name of await databaseNames()) if (named(name)) names.add(name)
  await Promise.all(Array.from(names, deleteDatabase))
}

/** The names of the IndexedDB databases of the site, where the browser can list them. */
async function databaseNames(): Promise<string[]> {
  try {
    const databases = localCopiesAvailable() && indexedDB.databases ? await indexedDB.databases() : []
    return databases.flatMap((database) => (database.name ? [database.name] : []))
  } catch {
    return []
  }
}

/**
 * Deletes a database of a copy. A tab that has it open closes it on the request, so the deletion does not wait for
 * that tab; failures leave the copy for the next cleanup.
 */
async function deleteDatabase(name: string): Promise<void> {
  try {
    if (localCopiesAvailable()) await clearDocument(name)
  } catch {
    // Left for the next cleanup.
  }
}
