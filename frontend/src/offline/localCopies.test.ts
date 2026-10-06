import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  deleteLocalCopiesOf,
  deleteLocalCopiesOfBoard,
  deleteLocalCopy,
  findLocalCopy,
  hasUnsentEdits,
  keepLocalCopiesOf,
  LOCAL_COPY_LIMIT,
  loadLocalCopy,
  localCopyName,
  openLocalCopy,
  setUnsentEdits,
} from './localCopies.ts'

const alice = '0199a000-0000-7000-8000-0000000000a1'
const bob = '0199a000-0000-7000-8000-0000000000b0'
const board = (n: number) => `0199a000-0000-7000-8000-${String(n).padStart(12, '0')}`

/** Opens the copy of the board for the user, lets `edit` change its document and waits until the change is stored. */
async function keep(userId: string, boardId: string, edit: (document: Y.Doc) => void = () => {}, title = 'Доска') {
  const document = new Y.Doc()
  const persistence = openLocalCopy(userId, boardId, title, document)!
  await persistence.whenSynced
  edit(document)
  await persistence.destroy()
  document.destroy()
}

async function databases(): Promise<string[]> {
  return (await indexedDB.databases()).map((database) => database.name!).sort()
}

describe('local copies', () => {
  it('keeps the document of a board for its user and loads it again', async () => {
    await keep(alice, board(1), (document) => document.getMap('meta').set('title', 'Схема'))

    const document = new Y.Doc()
    const persistence = openLocalCopy(alice, board(1), 'Доска', document)!
    await persistence.whenSynced

    expect(document.getMap('meta').get('title')).toBe('Схема')
    await persistence.destroy()
  })

  it('keeps the copies of different users of one board apart', async () => {
    await keep(alice, board(1), (document) => document.getMap('meta').set('title', 'Схема Алисы'))

    const document = new Y.Doc()
    const persistence = openLocalCopy(bob, board(1), 'Доска', document)!
    await persistence.whenSynced

    expect(document.getMap('meta').get('title')).toBeUndefined()
    expect(await databases()).toEqual([localCopyName(alice, board(1)), localCopyName(bob, board(1))].sort())
    await persistence.destroy()
  })

  it('records the title, the time of opening and whether the copy holds unsent edits', async () => {
    await keep(alice, board(1), () => {}, 'Архитектура')
    expect(findLocalCopy(alice, board(1))).toMatchObject({ title: 'Архитектура', pending: false })
    expect(findLocalCopy(bob, board(1))).toBeNull()

    setUnsentEdits(alice, board(1), true)
    expect(hasUnsentEdits(alice, board(1))).toBe(true)
    expect(hasUnsentEdits(bob, board(1))).toBe(false)

    // Opening the board again keeps the mark: the edits are still in the copy.
    await keep(alice, board(1), () => {}, 'Новое название')
    expect(findLocalCopy(alice, board(1))).toMatchObject({ title: 'Новое название', pending: true })

    setUnsentEdits(alice, board(1), false)
    expect(hasUnsentEdits(alice, board(1))).toBe(false)
  })

  it(`keeps ${LOCAL_COPY_LIMIT} copies of a user, removing those opened least recently first`, async () => {
    for (let n = 1; n <= LOCAL_COPY_LIMIT; n++) await keep(alice, board(n))
    await keep(bob, board(100))
    // Opening the first board again makes the second one the least recently opened.
    await keep(alice, board(1))

    await keep(alice, board(LOCAL_COPY_LIMIT + 1))

    expect(findLocalCopy(alice, board(2))).toBeNull()
    expect(findLocalCopy(alice, board(1))).not.toBeNull()
    expect(findLocalCopy(bob, board(100))).not.toBeNull()
    const names = await databases()
    expect(names).not.toContain(localCopyName(alice, board(2)))
    expect(names.filter((name) => name.includes(alice))).toHaveLength(LOCAL_COPY_LIMIT)
  })

  it('keeps the copies with unsent edits beyond the limit and removes others in their place', async () => {
    for (let n = 1; n <= LOCAL_COPY_LIMIT; n++) await keep(alice, board(n))
    setUnsentEdits(alice, board(1), true)
    setUnsentEdits(alice, board(2), true)

    await keep(alice, board(LOCAL_COPY_LIMIT + 1))

    expect(findLocalCopy(alice, board(1))).not.toBeNull()
    expect(findLocalCopy(alice, board(2))).not.toBeNull()
    expect(findLocalCopy(alice, board(3))).toBeNull()
    expect(findLocalCopy(alice, board(4))).not.toBeNull()
  })

  it('loads a copy into a detached document, e.g. to download it', async () => {
    await keep(alice, board(1), (document) => document.getMap('meta').set('title', 'Схема'))

    const copy = await loadLocalCopy(alice, board(1))

    expect(copy.getMap('meta').get('title')).toBe('Схема')
  })

  it('removes one copy, the copies of a board and the copies of a user', async () => {
    await keep(alice, board(1))
    await keep(alice, board(2))
    await keep(alice, board(3))
    await keep(bob, board(2))
    await keep(bob, board(3))

    await deleteLocalCopy(alice, board(1))
    expect(findLocalCopy(alice, board(1))).toBeNull()
    expect(await databases()).not.toContain(localCopyName(alice, board(1)))

    await deleteLocalCopiesOfBoard(board(2))
    expect(findLocalCopy(alice, board(2))).toBeNull()
    expect(findLocalCopy(bob, board(2))).toBeNull()

    await deleteLocalCopiesOf(bob)
    expect(findLocalCopy(bob, board(3))).toBeNull()
    expect(await databases()).toEqual([localCopyName(alice, board(3))])
  })

  it('removes the copies of every other user, also databases that the registry lost', async () => {
    await keep(alice, board(1))
    await keep(bob, board(2))
    localStorage.clear()
    await keep(bob, board(3))

    await keepLocalCopiesOf(bob)

    expect(await databases()).toEqual([localCopyName(bob, board(2)), localCopyName(bob, board(3))].sort())
    expect(findLocalCopy(bob, board(3))).not.toBeNull()
  })

  it('removes a copy that a document still has open', async () => {
    const document = new Y.Doc()
    const persistence = openLocalCopy(alice, board(1), 'Доска', document)!
    await persistence.whenSynced

    await deleteLocalCopy(alice, board(1))

    expect(await databases()).toEqual([])
  })
})
