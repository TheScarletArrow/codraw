import { describe, expect, it } from 'vitest'
import type { LayoutBox } from './layout.ts'
import { makeRoom, type RoomShape } from './makeRoom.ts'

const box = (x: number, y: number, width: number, height: number): LayoutBox => ({ x, y, width, height })
const shape = (id: string, at: LayoutBox, extra: Partial<RoomShape> = {}): RoomShape => ({ id, ...at, frame: false, ...extra })
const frame = (id: string, at: LayoutBox, extra: Partial<RoomShape> = {}): RoomShape => shape(id, at, { frame: true, ...extra })

describe('making room', () => {
  it('grows a boundary around a new table of it, and moves the service it covers then to the right', () => {
    const boxes = makeRoom([
      frame('boundary', box(0, 0, 400, 200)),
      shape('t1', box(20, 40, 120, 100)),
      shape('t2', box(200, 40, 120, 100)),
      shape('service', box(440, 40, 120, 60)),
      // Right of t2, its centre out of the boundary: quick connect tells the frame.
      shape('t3', box(400, 40, 120, 100), { added: true, placed: true, parent: 'boundary' }),
    ])

    expect(boxes.get('boundary')).toEqual(box(0, 0, 540, 200))
    // The gap of 40 it had from the boundary stays, at the same height.
    expect(boxes.get('service')).toEqual(box(580, 40, 120, 60))
    expect([...boxes.keys()].sort()).toEqual(['boundary', 'service'])
  })

  it('takes a new shape into the frame its centre is in', () => {
    const boxes = makeRoom([frame('boundary', box(0, 0, 400, 200)), shape('new', box(300, 120, 120, 100), { added: true, placed: true })])

    expect(boxes.get('boundary')).toEqual(box(0, 0, 440, 240))
  })

  it('moves a chain of shapes, each keeping the gap it had', () => {
    const boxes = makeRoom([
      shape('a', box(0, 0, 200, 50), { before: box(0, 0, 100, 50) }),
      shape('b', box(120, 0, 100, 50)),
      shape('c', box(230, 0, 100, 50)),
      shape('far', box(600, 0, 100, 50)),
    ])

    expect(boxes.get('b')).toEqual(box(220, 0, 100, 50))
    expect(boxes.get('c')).toEqual(box(330, 0, 100, 50))
    expect(boxes.has('far')).toBe(false)
  })

  it('keeps the gap of a shape that a grown one came close to, up to 40, and leaves the far ones', () => {
    const boxes = makeRoom([
      shape('a', box(0, 0, 130, 50), { before: box(0, 0, 100, 50) }),
      shape('close', box(130, 0, 100, 50)),
      shape('aside', box(130, 60, 100, 50)),
    ])
    const far = makeRoom([shape('a', box(0, 0, 200, 50), { before: box(0, 0, 100, 50) }), shape('far', box(300, 0, 100, 50))])
    const near = makeRoom([shape('a', box(0, 0, 280, 50), { before: box(0, 0, 100, 50) }), shape('far', box(300, 0, 100, 50))])

    expect(boxes.get('close')).toEqual(box(160, 0, 100, 50))
    expect(boxes.has('aside')).toBe(false)
    expect(far.size).toBe(0)
    expect(near.get('far')).toEqual(box(320, 0, 100, 50))
  })

  it('moves the table under a table that grew down, not aside, and grows their frame', () => {
    const boxes = makeRoom([
      frame('frame', box(0, 0, 300, 300)),
      shape('top', box(20, 40, 120, 200), { before: box(20, 40, 120, 100) }),
      shape('under', box(20, 160, 120, 100)),
    ])

    expect(boxes.get('under')).toEqual(box(20, 260, 120, 100))
    expect(boxes.get('frame')).toEqual(box(0, 0, 300, 380))
  })

  it('keeps the padding of a frame on the side a table grew to, and only there', () => {
    const boxes = makeRoom([
      frame('frame', box(0, 0, 200, 200)),
      // Close under the caption before the change, and 2 short of the bottom after it.
      shape('table', box(20, 10, 120, 188), { before: box(20, 10, 120, 160) }),
    ])

    expect(boxes.get('frame')).toEqual(box(0, 0, 200, 220))
  })

  it('keeps a table that grew out of its frame in it', () => {
    const boxes = makeRoom([
      frame('frame', box(0, 0, 200, 160)),
      shape('table', box(20, 40, 120, 300), { before: box(20, 40, 120, 100) }),
    ])

    expect(boxes.get('frame')).toEqual(box(0, 0, 200, 360))
  })

  it('grows nested frames from the inside out', () => {
    const boxes = makeRoom([
      frame('outer', box(0, 0, 400, 400)),
      frame('inner', box(20, 40, 300, 200)),
      shape('table', box(40, 80, 120, 100)),
      shape('new', box(300, 80, 120, 100), { added: true, placed: true, parent: 'inner' }),
    ])

    expect(boxes.get('inner')).toEqual(box(20, 40, 420, 200))
    expect(boxes.get('outer')).toEqual(box(0, 0, 460, 400))
  })

  it('takes the shapes of a frame along when it moves away', () => {
    const boxes = makeRoom([
      shape('wide', box(0, 0, 300, 100), { before: box(0, 0, 100, 100) }),
      frame('frame', box(200, 0, 200, 200)),
      shape('inside', box(220, 40, 100, 60)),
    ])

    expect(boxes.get('frame')).toEqual(box(340, 0, 200, 200))
    expect(boxes.get('inside')).toEqual(box(360, 40, 100, 60))
  })

  it('puts a table dropped over a row after the one before it, and moves the ones after it to the right', () => {
    const boxes = makeRoom([
      shape('orders', box(60, 90, 160, 56)),
      shape('users', box(260, 90, 160, 56)),
      shape('table', box(500, 90, 160, 56)),
      shape('new', box(180, 120, 160, 56), { added: true, placed: true }),
    ])

    // Past orders with a gap of 40, on its own height; users and the table after it make room, 40 apart at most.
    expect(boxes.get('new')).toEqual(box(260, 120, 160, 56))
    expect(boxes.get('users')).toEqual(box(460, 90, 160, 56))
    expect(boxes.get('table')).toEqual(box(660, 90, 160, 56))
    expect(boxes.has('orders')).toBe(false)
  })

  it('moves the shape under a new one down', () => {
    const boxes = makeRoom([shape('below', box(60, 200, 100, 100)), shape('new', box(60, 0, 100, 220), { added: true, placed: true })])

    expect(boxes.get('below')).toEqual(box(60, 260, 100, 100))
  })

  it('moves no original for a copy pasted over it, but grows the frame of the copy', () => {
    const boxes = makeRoom([
      frame('frame', box(0, 0, 200, 200)),
      shape('original', box(60, 60, 120, 100)),
      shape('copy', box(100, 120, 120, 100), { added: true }),
    ])

    expect([...boxes.keys()]).toEqual(['frame'])
    expect(boxes.get('frame')).toEqual(box(0, 0, 240, 240))
  })

  it('leaves shapes that covered each other before the change, stickies and locked shapes', () => {
    const boxes = makeRoom([
      shape('a', box(0, 0, 300, 100), { before: box(0, 0, 100, 100) }),
      shape('covered', box(50, 50, 100, 100)),
      shape('sticky', box(150, 0, 100, 100), { floating: true }),
      shape('locked', box(250, 0, 100, 100), { locked: true }),
    ])

    expect(boxes.size).toBe(0)
  })

  it('moves a frame with a locked shape inside no more', () => {
    const boxes = makeRoom([
      shape('wide', box(0, 0, 300, 100), { before: box(0, 0, 100, 100) }),
      frame('frame', box(200, 0, 200, 200)),
      shape('inside', box(220, 40, 100, 60), { locked: true }),
    ])

    expect(boxes.size).toBe(0)
  })

  it('moves no neighbour for a moved shape, but grows the frame it was moved into', () => {
    const boxes = makeRoom([
      frame('frame', box(0, 0, 300, 200)),
      shape('other', box(20, 40, 120, 100)),
      shape('moved', box(240, 60, 120, 100), { before: box(600, 600, 120, 100) }),
      shape('covered', box(500, 0, 100, 100)),
      shape('dragged', box(450, 20, 100, 100), { before: box(800, 20, 100, 100) }),
    ])

    expect(boxes.get('frame')).toEqual(box(0, 0, 380, 200))
    expect(boxes.has('other')).toBe(false)
    expect(boxes.has('covered')).toBe(false)
  })

  it('moves no neighbour for a shape moved and resized at once', () => {
    const boxes = makeRoom([
      shape('moved', box(200, 0, 100, 60), { before: box(-60, -30, 120, 80) }),
      shape('neighbour', box(150, 0, 100, 60)),
    ])

    expect(boxes.size).toBe(0)
  })

  it('keeps the size of a frame the participant changed, which takes what it covers', () => {
    const boxes = makeRoom([
      frame('frame', box(0, 0, 600, 200), { before: box(0, 0, 300, 200) }),
      shape('table', box(250, 40, 120, 100)),
      shape('taken', box(400, 40, 120, 100)),
      shape('aside', box(560, 40, 120, 100)),
    ])

    expect(boxes.size).toBe(0)
  })

  it('takes the shapes a new frame covers without pushing anything', () => {
    const boxes = makeRoom([frame('frame', box(0, 0, 300, 200), { added: true }), shape('edge', box(250, 40, 120, 100))])

    expect(boxes.size).toBe(0)
  })

  it('carries a sticky with its frame, and fits no frame around a sticky', () => {
    const boxes = makeRoom([
      shape('wide', box(0, 0, 300, 100), { before: box(0, 0, 100, 100) }),
      frame('frame', box(200, 0, 200, 200)),
      shape('note', box(320, 120, 120, 120), { floating: true }),
    ])

    expect(boxes.get('frame')).toEqual(box(340, 0, 200, 200))
    expect(boxes.get('note')).toEqual(box(460, 120, 120, 120))
  })
})
