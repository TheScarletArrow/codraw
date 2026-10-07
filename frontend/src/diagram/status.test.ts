import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { getCells } from './model.ts'
import {
  clearStatus,
  commonStatus,
  readStatus,
  STATUS_AT_KEY,
  STATUS_BY_KEY,
  STATUS_BY_NAME_KEY,
  STATUS_KEY,
  statusLabel,
  writeStatus,
} from './status.ts'
import { boardWith, shapeData } from './testing.ts'

const alice = { id: 'alice', name: 'Алиса' }
const bob = { id: 'bob', name: 'Боб' }
const at = new Date(2026, 9, 7, 14, 5).getTime()

/** A shape of a fresh board in the document. */
function shape() {
  const doc = boardWith(shapeData('api', 'a0'))
  return getCells(doc).get('api')!
}

describe('statuses of elements', () => {
  it('sets a status with who set it and when, and reads it back', () => {
    const cell = shape()

    expect(readStatus(cell)).toBeNull()
    expect(cell.doc!.transact(() => writeStatus(cell, 'review', alice, at))).toBe(true)

    expect(readStatus(cell)).toEqual({ status: 'review', by: 'alice', name: 'Алиса', at })
    expect(cell.toJSON()).toMatchObject({
      [STATUS_KEY]: 'review',
      [STATUS_BY_KEY]: 'alice',
      [STATUS_BY_NAME_KEY]: 'Алиса',
      [STATUS_AT_KEY]: at,
    })
  })

  it('keeps the status and its mark when the same status is set again', () => {
    const cell = shape()
    writeStatus(cell, 'review', alice, at)

    expect(writeStatus(cell, 'review', bob, at + 1000)).toBe(false)

    expect(readStatus(cell)).toEqual({ status: 'review', by: 'alice', name: 'Алиса', at })
  })

  it('names the participant who changes the status', () => {
    const cell = shape()
    writeStatus(cell, 'review', alice, at)

    writeStatus(cell, 'done', bob, at + 1000)

    expect(readStatus(cell)).toEqual({ status: 'done', by: 'bob', name: 'Боб', at: at + 1000 })
  })

  it('takes the status and its mark off, and sets one without a participant without a name', () => {
    const cell = shape()
    writeStatus(cell, 'draft', alice, at)

    expect(writeStatus(cell, null, bob, at)).toBe(true)
    expect(writeStatus(cell, null, bob, at)).toBe(false)
    expect([STATUS_KEY, STATUS_BY_KEY, STATUS_BY_NAME_KEY, STATUS_AT_KEY].filter((key) => cell.has(key))).toEqual([])
    expect(readStatus(cell)).toBeNull()

    writeStatus(cell, 'done', null, at)
    expect(readStatus(cell)).toEqual({ status: 'done', by: null, name: null, at })
  })

  it('reads a status that CoDraw does not know as none', () => {
    const cell = shape()
    cell.set(STATUS_KEY, 'approved')

    expect(readStatus(cell)).toBeNull()
  })

  it('takes the status off a copy that is not in a document yet', () => {
    const copy = new Y.Map<unknown>()
    copy.set('kind', 'vertex')
    copy.set(STATUS_KEY, 'done')
    copy.set(STATUS_BY_KEY, 'alice')
    copy.set(STATUS_BY_NAME_KEY, 'Алиса')
    copy.set(STATUS_AT_KEY, at)

    clearStatus(copy)
    const doc = new Y.Doc()
    doc.getMap('cells').set('copy', copy)

    expect(copy.toJSON()).toEqual({ kind: 'vertex' })
  })

  it('says the status, who set it and when on the badge', () => {
    expect(statusLabel({ status: 'review', by: 'bob', name: 'Боб', at })).toBe('Нужно ревью — Боб, 7 окт. 2026 г., 14:05')
    expect(statusLabel({ status: 'done', by: null, name: null, at })).toBe('Готово — 7 окт. 2026 г., 14:05')
    expect(statusLabel({ status: 'draft', by: null, name: null, at: null })).toBe('Черновик')
  })

  it('tells the common status of several elements', () => {
    expect(commonStatus([])).toBeNull()
    expect(commonStatus(['done', 'done'])).toEqual({ value: 'done', mixed: false })
    expect(commonStatus([null, null])).toEqual({ value: null, mixed: false })
    expect(commonStatus(['done', 'review'])).toEqual({ value: null, mixed: true })
    expect(commonStatus(['done', null])).toEqual({ value: null, mixed: true })
  })
})
