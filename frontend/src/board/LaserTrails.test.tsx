import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { FakeAwareness } from '../test/fakeProvider.ts'
import { LASER_FADE_MS } from './laser.ts'
import { PresenceLayer } from './PresenceLayer.tsx'
import type { Awareness } from './presence.ts'

const alice = { name: 'Алиса', color: '#2563eb', avatarUrl: null }
const bob = { name: 'Боб', color: '#dc2626', avatarUrl: null }
/** The interval of animation frames of the fake timers. */
const FRAME_MS = 16

describe('trails of the laser pointer', () => {
  let editor: FakeEditor
  let awareness: FakeAwareness

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    editor = createFakeEditor()
    awareness = new FakeAwareness(1)
    awareness.setLocalStateField('user', alice)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const renderLayer = () =>
    render(<PresenceLayer editor={editor} awareness={awareness as unknown as Awareness} identity={alice} />)
  const trailOf = (name: string) =>
    screen.queryAllByTestId('laser-trail').find((trail) => trail.dataset.participant === name) ?? null
  /** The pieces of the trail of a participant: `[x1, y1, x2, y2, opacity]`. */
  const segmentsOf = (name: string) =>
    [...(trailOf(name)?.querySelectorAll('line') ?? [])].map((line) => [
      ...['x1', 'y1', 'x2', 'y2'].map((attribute) => Number(line.getAttribute(attribute))),
      Number(Number(line.getAttribute('stroke-opacity')).toFixed(2)),
    ])
  /** Lets `ms` pass frame by frame: each frame of the layer is drawn by React before the next one is asked for. */
  const frames = (ms: number) => {
    for (let passed = 0; passed < ms; passed += FRAME_MS)
      act(() => vi.advanceTimersByTime(Math.min(FRAME_MS, ms - passed)))
  }

  it('draws the trail of another participant on the same page in their color, where it was drawn', () => {
    awareness.setState(7, {
      user: bob,
      laser: {
        strokes: [
          [
            [100, 50, 0],
            [200, 80, 0],
          ],
        ],
        at: 1,
      },
    })

    renderLayer()

    expect(trailOf('Боб')).toHaveAttribute('stroke', bob.color)
    // A stroke starts with a dot.
    expect(segmentsOf('Боб')).toEqual([
      [100, 50, 100, 50, 1],
      [100, 50, 200, 80, 1],
    ])

    act(() => editor.scrollTo({ x: 50, y: 30 }))
    expect(segmentsOf('Боб')).toEqual([
      [50, 20, 50, 20, 1],
      [50, 20, 150, 50, 1],
    ])
  })

  it('fades a trail out over a second after it was drawn and then draws no more frames', () => {
    awareness.setState(7, { user: bob, laser: { strokes: [[[100, 50, 0]]], at: 1 } })
    renderLayer()

    frames(LASER_FADE_MS / 2)
    expect(segmentsOf('Боб')[0]![4]).toBeCloseTo(0.5, 1)

    // The frame after the last point has faded.
    frames(LASER_FADE_MS / 2 + FRAME_MS)
    expect(screen.queryByTestId('laser-trails')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('places the points by their ages, and keeps the time of a trail sent again with another field', () => {
    awareness.setState(7, { user: bob, laser: { strokes: [[[100, 50, 600]]], at: 1 } })
    renderLayer()
    expect(segmentsOf('Боб')[0]![4]).toBeCloseTo(0.4, 1)

    frames(200)
    act(() =>
      awareness.setState(7, { user: bob, cursor: { x: 1, y: 1 }, laser: { strokes: [[[100, 50, 600]]], at: 1 } }),
    )
    expect(segmentsOf('Боб')[0]![4]).toBeCloseTo(0.2, 1)

    // A new trail arrives with its points as old as they are in it.
    act(() => awareness.setState(7, { user: bob, laser: { strokes: [[[100, 50, 600]]], at: 2 } }))
    frames(16)
    expect(segmentsOf('Боб')[0]![4]).toBeCloseTo(0.4, 1)
  })

  it('draws no trails of participants on other pages and of clients that publish none', () => {
    editor = createFakeEditor({ pageId: 'p2' })
    awareness.setState(7, { user: bob, page: 'p2', laser: { strokes: [[[100, 50, 0]]], at: 1 } })
    awareness.setState(8, { user: { ...bob, name: 'Вера' }, page: 'p3', laser: { strokes: [[[100, 50, 0]]], at: 1 } })
    awareness.setState(9, { user: { ...bob, name: 'Старый' }, cursor: { x: 1, y: 1 } })

    renderLayer()

    expect(screen.getAllByTestId('laser-trail').map((trail) => trail.dataset.participant)).toEqual(['Боб'])
  })

  it('draws the participant’s own trail as they draw it, without joining two strokes', () => {
    renderLayer()
    expect(screen.queryByTestId('laser-trails')).toBeNull()

    act(() => {
      editor.drawLaser({ x: 10, y: 10 })
      editor.drawLaser({ x: 40, y: 20 })
      editor.drawLaser(null)
      editor.drawLaser({ x: 300, y: 200 })
    })

    expect(trailOf('Алиса')).toHaveAttribute('stroke', alice.color)
    expect(segmentsOf('Алиса')).toEqual([
      [10, 10, 10, 10, 1],
      [10, 10, 40, 20, 1],
      [300, 200, 300, 200, 1],
    ])

    frames(LASER_FADE_MS + FRAME_MS)
    expect(screen.queryByTestId('laser-trails')).toBeNull()
  })
})
