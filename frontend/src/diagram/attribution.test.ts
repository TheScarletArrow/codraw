import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  attributionLabel,
  isAttributedWrite,
  MODIFIED_AT_KEY,
  MODIFIED_BY_KEY,
  MODIFIED_BY_NAME_KEY,
  readAttribution,
  writeAttribution,
} from './attribution.ts'
import { LOCKED_BY_KEY, LOCKED_KEY } from './locks.ts'

const BOB = { id: '0199a000-0000-7000-8000-00000000000b', name: 'Боб' }
const ALICE = { id: '0199a000-0000-7000-8000-00000000000a', name: 'Алиса' }
const NOW = Date.UTC(2026, 9, 6, 12, 0, 0)

/** A cell of a page in a document, and the keys each transaction changed in it. */
function storedCell() {
  const doc = new Y.Doc()
  const cell = new Y.Map<unknown>()
  doc.getMap('cells:page-1').set('box', cell)
  const changed: string[][] = []
  cell.observe((event) => changed.push([...event.keysChanged].sort()))
  return { doc, cell, changed }
}

describe('who changed a cell', () => {
  it('writes who and when, and who again only when another participant changes the cell', () => {
    const { doc, cell, changed } = storedCell()

    doc.transact(() => writeAttribution(cell, BOB, NOW))
    doc.transact(() => writeAttribution(cell, BOB, NOW + 1000))
    doc.transact(() => writeAttribution(cell, ALICE, NOW + 2000))

    expect(changed).toEqual([
      [MODIFIED_AT_KEY, MODIFIED_BY_KEY, MODIFIED_BY_NAME_KEY],
      [MODIFIED_AT_KEY],
      [MODIFIED_AT_KEY, MODIFIED_BY_KEY, MODIFIED_BY_NAME_KEY],
    ])
    expect(readAttribution(cell)).toEqual({ by: ALICE.id, name: 'Алиса', at: NOW + 2000 })
  })

  it('writes all of it into a cell that is not in a document yet', () => {
    const copy = new Y.Map<unknown>()
    copy.set(MODIFIED_BY_KEY, ALICE.id)
    copy.set(MODIFIED_BY_NAME_KEY, ALICE.name)
    copy.set(MODIFIED_AT_KEY, NOW - 1000)

    writeAttribution(copy, BOB, NOW)
    new Y.Doc().getMap('cells:page-1').set('copy', copy)

    expect(readAttribution(copy)).toEqual({ by: BOB.id, name: 'Боб', at: NOW })
  })

  it('reads nothing from a cell without a name or a time, as cells changed before CoDraw kept them', () => {
    const { doc, cell } = storedCell()
    expect(readAttribution(cell)).toBeNull()
    expect(readAttribution(undefined)).toBeNull()

    doc.transact(() => cell.set(MODIFIED_BY_NAME_KEY, 'Боб'))
    expect(readAttribution(cell)).toBeNull()
    doc.transact(() => cell.set(MODIFIED_AT_KEY, 'вчера'))
    expect(readAttribution(cell)).toBeNull()

    doc.transact(() => cell.set(MODIFIED_AT_KEY, NOW))
    expect(readAttribution(cell)).toEqual({ by: null, name: 'Боб', at: NOW })
  })

  it('counts any change of a cell but a lock as a change that names its author', () => {
    const none = { created: false, fields: [], style: [] }
    expect(isAttributedWrite(none)).toBe(false)
    expect(isAttributedWrite({ ...none, created: true })).toBe(true)
    expect(isAttributedWrite({ ...none, fields: ['value'] })).toBe(true)
    expect(isAttributedWrite({ ...none, style: ['fillColor'] })).toBe(true)
    expect(isAttributedWrite({ ...none, style: [LOCKED_KEY, LOCKED_BY_KEY] })).toBe(false)
    expect(isAttributedWrite({ ...none, style: [LOCKED_KEY, 'fillColor'] })).toBe(true)
  })

  it('says who changed it and how long ago, with «(вы)» after the name of the participant', () => {
    const attribution = { by: BOB.id, name: 'Боб', at: NOW - 5 * 60_000 }

    expect(attributionLabel(attribution, NOW)).toBe('Изменено: Боб, 5 минут назад')
    expect(attributionLabel(attribution, NOW, true)).toBe('Изменено: Боб (вы), 5 минут назад')
    expect(attributionLabel({ ...attribution, at: NOW }, NOW)).toBe('Изменено: Боб, только что')
  })
})
