import { Cell, Geometry } from '@maxgraph/core'
import { describe, expect, it } from 'vitest'
import { clipboard } from './clipboard.ts'

describe('clipboard', () => {
  it('is empty until something is copied', () => {
    expect(clipboard.read()).toBeNull()
    expect(clipboard.nextPaste()).toBe(0)
  })

  it('keeps the copied cells under a holder, so that maxGraph does not take copied edges for edge labels', () => {
    const shape = new Cell('Сервис', new Geometry(0, 0, 120, 60))
    const edge = new Cell('', new Geometry())
    edge.setEdge(true)
    edge.getGeometry()!.relative = true

    clipboard.put([shape, edge])

    expect(clipboard.read()).toEqual([shape, edge])
    expect(shape.getParent()).not.toBeNull()
    expect(edge.getParent()).toBe(shape.getParent())
    expect(edge.getParent()!.isEdge()).toBe(false)
  })

  it('counts the pastes of the same content and starts over with a new copy', () => {
    clipboard.put([new Cell('Сервис')])
    expect([clipboard.nextPaste(), clipboard.nextPaste()]).toEqual([1, 2])

    clipboard.put([new Cell('База данных')])

    expect(clipboard.nextPaste()).toBe(1)
  })
})
