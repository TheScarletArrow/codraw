import { Cell, Geometry, type CellStyle } from '@maxgraph/core'
import { describe, expect, it } from 'vitest'
import {
  hasLockedDescendant,
  isLockedStyle,
  LOCKED_BY_KEY,
  LOCKED_KEY,
  lockedByOf,
  lockHolder,
  lockHolders,
  lockLabel,
  unlockCopy,
} from './locks.ts'

function vertex(style: Record<string, unknown> = {}, parent?: Cell): Cell {
  const cell = new Cell('', new Geometry(0, 0, 100, 60), style as CellStyle)
  cell.setVertex(true)
  parent?.insert(cell)
  return cell
}

const locked = (name?: string) => ({ [LOCKED_KEY]: true, ...(name && { [LOCKED_BY_KEY]: name }) })

describe('locks', () => {
  it('reads the lock of CoDraw and of draw.io from the style', () => {
    expect(isLockedStyle({ locked: true })).toBe(true)
    expect(isLockedStyle({ locked: 1 })).toBe(true)
    expect(isLockedStyle({ locked: '1' })).toBe(true)
    expect(isLockedStyle({ locked: false })).toBe(false)
    expect(isLockedStyle({ locked: 0 })).toBe(false)
    expect(isLockedStyle({})).toBe(false)
    expect(isLockedStyle(null)).toBe(false)
  })

  it('finds the lock that holds a cell: its own, or that of the nearest locked group above it', () => {
    const outer = vertex(locked('Алиса'))
    const inner = vertex(locked('Боб'), outer)
    const shape = vertex({}, inner)
    const free = vertex()

    expect(lockHolder(shape)).toBe(inner)
    expect(lockHolder(outer)).toBe(outer)
    expect(lockHolder(free)).toBeNull()
    expect(lockHolders(shape)).toEqual([inner, outer])
    expect(lockedByOf(inner)).toBe('Боб')
    expect(lockedByOf(free)).toBeNull()
  })

  it('tells a group that holds a locked shape', () => {
    const group = vertex()
    const nested = vertex({}, group)
    const shape = vertex(locked(), nested)

    expect(hasLockedDescendant(group)).toBe(true)
    expect(hasLockedDescendant(shape)).toBe(false)
    expect(hasLockedDescendant(vertex())).toBe(false)
  })

  it('names who locked, once each, or says just that it is locked', () => {
    expect(lockLabel(['Алиса'])).toBe('Закреплено: Алиса')
    expect(lockLabel(['Алиса', null, 'Боб', 'Алиса'])).toBe('Закреплено: Алиса, Боб')
    expect(lockLabel([null])).toBe('Закреплено')
    expect(lockLabel([])).toBe('Закреплено')
  })

  it('takes the lock off a copy and the cells inside it, keeping the rest of the style', () => {
    const copy = vertex({ ...locked('Алиса'), fillColor: '#ff0000' })
    const child = vertex(locked(), copy)

    unlockCopy(copy)

    expect(copy.getStyle()).toEqual({ fillColor: '#ff0000' })
    expect(child.getStyle()).toEqual({})
  })
})
