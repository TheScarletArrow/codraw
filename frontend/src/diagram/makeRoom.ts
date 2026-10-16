import { FRAME_PADDING, frameParents, type LayoutBox } from './layout.ts'

/**
 * A shape of the page itself (a shape, a table, a group or a frame), as a change of the participant left it, in page
 * coordinates.
 */
export interface RoomShape extends LayoutBox {
  id: string
  /** A frame holds the shapes whose centres lie inside it, and grows around them. */
  frame: boolean
  /** The change added the shape. */
  added?: boolean
  /**
   * The participant put the new shape at a place of their choice, e.g. dropped it there: it makes room around it. A
   * pasted copy, which lies over its original on purpose, does not.
   */
  placed?: boolean
  /** The box before the change, for a shape the change moved or resized. */
  before?: LayoutBox
  /** The frame the shape is in, when it is known rather than found from where the shapes are, e.g. for quick connect. */
  parent?: string | null
  /** A locked shape neither moves nor grows, nor does a frame with one inside move. */
  locked?: boolean
  /** A shape that neither makes nor takes room, e.g. a sticky: only its frame carries it. */
  floating?: boolean
}

/** The most space a shape that makes room leaves before the shape it moves away; a closer one keeps its own. */
export const ROOM_GAP = 40
const GRID = 10
/** Steps of a level after which a page that keeps pushing its shapes around is left as it is. */
const STEPS_PER_SHAPE = 20

type Side = 'left' | 'right' | 'up' | 'down'
const SIDES: readonly Side[] = ['right', 'down', 'left', 'up']
/** The room a frame leaves on each side around its shapes; the top leaves room for its caption. */
const PADDING: Readonly<Record<Side, number>> = {
  left: FRAME_PADDING.left,
  right: FRAME_PADDING.right,
  up: FRAME_PADDING.top,
  down: FRAME_PADDING.bottom,
}

const right = (box: LayoutBox) => box.x + box.width
const bottom = (box: LayoutBox) => box.y + box.height
const copy = ({ x, y, width, height }: LayoutBox): LayoutBox => ({ x, y, width, height })
const same = (a: LayoutBox, b: LayoutBox) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
const overlap = (a: LayoutBox, b: LayoutBox) =>
  a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a)
/** The shape changed its size where it was; one that also left its place altogether was moved. */
const resized = (shape: RoomShape) =>
  shape.before !== undefined &&
  (shape.before.width !== shape.width || shape.before.height !== shape.height) &&
  overlap(shape.before, shape)
/** Whole steps of the grid, so that shapes on the grid stay on it. */
const steps = (length: number) => Math.ceil(length / GRID - 1e-9) * GRID

/** The shape got wider or taller where it was: a field of a table, a longer label, a handle dragged out. */
const grew = (shape: RoomShape) =>
  resized(shape) && (shape.width > shape.before!.width || shape.height > shape.before!.height)

/**
 * Where `shape` is looked for in the frames, and where a frame looks for its shapes: a new or moved shape where it is
 * now, as dropped there; one that only changed its size where it was, so that a table that grew out of its frame stays
 * in it. A frame holds what lies in it now: one stretched over shapes takes them.
 */
const probe = (shape: RoomShape): LayoutBox => (!shape.frame && resized(shape) ? shape.before! : shape)

/** The space between `from` and `to` on `side` of `from`, `null` where `to` is not on that side. */
function spaceOn(side: Side, from: LayoutBox, to: LayoutBox): number | null {
  const space =
    side === 'right'
      ? to.x - right(from)
      : side === 'left'
        ? from.x - right(to)
        : side === 'down'
          ? to.y - bottom(from)
          : from.y - bottom(to)
  return space >= 0 ? space : null
}

/** How far `shape` moves on `side` to leave `gap` from `pusher`. */
function distance(side: Side, pusher: LayoutBox, shape: LayoutBox, gap: number): number {
  const length =
    side === 'right'
      ? right(pusher) + gap - shape.x
      : side === 'left'
        ? right(shape) + gap - pusher.x
        : side === 'down'
          ? bottom(pusher) + gap - shape.y
          : bottom(shape) + gap - pusher.y
  return length > 0 ? steps(length) : 0
}

/** `shape` lies across from `pusher` on `side`: their extents across that side overlap. */
const facing = (side: Side, pusher: LayoutBox, shape: LayoutBox) =>
  side === 'left' || side === 'right'
    ? pusher.y < bottom(shape) && shape.y < bottom(pusher)
    : pusher.x < right(shape) && shape.x < right(pusher)

/**
 * How `shape` moves away from a pusher that was at `pusherStart` when it stood at `shapeStart`: on a side where it
 * stood from the pusher and lies across from it now, back to the gap it had but at most {@link ROOM_GAP}; of several,
 * the one that moves it least. `null` when it is far enough already, or only diagonal to the pusher.
 */
function moveFrom(pusher: LayoutBox, shape: LayoutBox, pusherStart: LayoutBox, shapeStart: LayoutBox) {
  let best: { side: Side; length: number } | null = null
  for (const side of SIDES) {
    const space = spaceOn(side, pusherStart, shapeStart)
    if (space === null || !facing(side, pusher, shape)) continue
    const length = distance(side, pusher, shape, Math.min(space, ROOM_GAP))
    if (length > 0 && (!best || length < best.length)) best = { side, length }
  }
  return best
}

/**
 * Where `shape` lies from a new shape, as in a row or a column: on the axis of the larger distance between their centres,
 * after it (to the right or below) or before it.
 */
function placeFrom(added: LayoutBox, shape: LayoutBox): { side: 'right' | 'down'; after: boolean } {
  const dx = shape.x + shape.width / 2 - (added.x + added.width / 2)
  const dy = shape.y + shape.height / 2 - (added.y + added.height / 2)
  return Math.abs(dx) >= Math.abs(dy) ? { side: 'right', after: dx >= 0 } : { side: 'down', after: dy >= 0 }
}

/**
 * New boxes of the shapes a change of the participant makes room for, keyed by id; the shapes that keep their boxes are
 * left out.
 *
 * A frame holds the shapes whose centres lie inside it (see {@link frameParents}), and the page is the top level. Level
 * by level, the deepest frames first: a placed new shape goes on past the shapes before it that it covers and moves
 * those after it to the right or down (see {@link placeFrom}), and a shape that grew or a frame that grew around its shapes moves those across from it back to the gap they
 * had but at most {@link ROOM_GAP}; a moved shape moves the next ones, and a frame takes the shapes it holds along. A
 * frame then grows on the sides where its shapes stick out, or where a shape that came, grew or moved that way came
 * closer to its edge than {@link FRAME_PADDING}, and makes room on the level above. Shapes
 * that covered each other before the change stay so; locked shapes, floating ones and those the change moved or resized
 * stay where they are, and a frame the change placed, moved or resized keeps its size and takes what it covers.
 */
export function makeRoom(shapes: RoomShape[]): Map<string, LayoutBox> {
  const byId = new Map(shapes.map((shape) => [shape.id, shape]))
  const known = (parent: string | null | undefined) => parent === null || (parent !== undefined && byId.get(parent)?.frame === true)
  const parents = frameParents(
    shapes.map((shape) => {
      const { x, y, width, height } = probe(shape)
      return { id: shape.id, x, y, width, height, frame: shape.frame, ...(known(shape.parent) ? { parent: shape.parent } : {}) }
    }),
  )
  const members = new Map<string | null, RoomShape[]>()
  for (const shape of shapes) {
    const parent = parents.get(shape.id) ?? null
    const level = members.get(parent)
    if (level) level.push(shape)
    else members.set(parent, [shape])
  }
  const depth = (id: string | null): number => (id === null ? 0 : 1 + depth(parents.get(id) ?? null))

  const boxes = new Map(shapes.map((shape) => [shape.id, copy(shape)]))
  const box = (id: string) => boxes.get(id)!
  /** The box when the participant started the change; a new shape has none. */
  const start = (shape: RoomShape): LayoutBox | null => (shape.added ? null : (shape.before ?? shape))
  const grown = new Set<string>()
  const changedByParticipant = (shape: RoomShape) => shape.added === true || (shape.before !== undefined && !same(shape.before, shape))
  /**
   * The sides each shape came out to in the change or in the pass, where its frame keeps its padding: every side of a
   * shape that came or was moved there, the sides a shape grew to, the way a shape was pushed.
   */
  const outward = new Map<string, Set<Side>>()
  const goesOut = (id: string, ...sides: Side[]) => {
    const set = outward.get(id) ?? new Set<Side>()
    for (const side of sides) set.add(side)
    outward.set(id, set)
  }
  for (const shape of shapes) {
    if (!changedByParticipant(shape)) continue
    if (!resized(shape)) goesOut(shape.id, ...SIDES)
    else {
      const before = shape.before!
      if (right(shape) > right(before)) goesOut(shape.id, 'right')
      if (shape.x < before.x) goesOut(shape.id, 'left')
      if (bottom(shape) > bottom(before)) goesOut(shape.id, 'down')
      if (shape.y < before.y) goesOut(shape.id, 'up')
    }
  }

  const descendants = (id: string): string[] => (members.get(id) ?? []).flatMap((shape) => [shape.id, ...descendants(shape.id)])
  const holdsLocked = new Map<string, boolean>()
  const holdsLockedShape = (id: string) => {
    let holds = holdsLocked.get(id)
    if (holds === undefined) holdsLocked.set(id, (holds = descendants(id).some((each) => byId.get(each)!.locked)))
    return holds
  }
  const movable = (shape: RoomShape) =>
    !shape.locked && !shape.floating && !changedByParticipant(shape) && !(shape.frame && holdsLockedShape(shape.id))
  const carry = (id: string, dx: number, dy: number) => {
    const ways: Side[] = [dx > 0 ? 'right' : dx < 0 ? 'left' : null, dy > 0 ? 'down' : dy < 0 ? 'up' : null].filter(
      (side): side is Side => side !== null,
    )
    for (const each of [id, ...descendants(id)]) {
      const moving = box(each)
      boxes.set(each, { ...moving, x: moving.x + dx, y: moving.y + dy })
      goesOut(each, ...ways)
    }
  }

  // A frame the participant placed or stretched frames what it covers rather than pushing it away.
  const makesRoom = (shape: RoomShape) =>
    !shape.floating && (grown.has(shape.id) || (!shape.frame && ((shape.added === true && shape.placed === true) || grew(shape))))

  /**
   * A new shape dropped over shapes before it goes on past them, as one inserted after them in a row or a column, so that
   * only what comes after it makes room: the diagram grows to the right and down, as it is read.
   */
  /** Where each new shape was dropped, before it went on past the shapes before it: what comes after it is seen from there. */
  const dropped = new Map<string, LayoutBox>()
  const insert = (added: RoomShape, level: RoomShape[]) => {
    const now = box(added.id)
    dropped.set(added.id, now)
    let dx = 0
    let dy = 0
    for (const shape of level) {
      if (shape === added || shape.floating || !overlap(now, box(shape.id))) continue
      const { side, after } = placeFrom(now, box(shape.id))
      if (after) continue
      if (side === 'right') dx = Math.max(dx, distance('right', box(shape.id), now, ROOM_GAP))
      else dy = Math.max(dy, distance('down', box(shape.id), now, ROOM_GAP))
    }
    if (dx > 0 || dy > 0) carry(added.id, dx, dy)
  }

  const resolve = (level: RoomShape[]) => {
    for (const shape of level) if (shape.added && shape.placed && !shape.frame && !shape.floating) insert(shape, level)
    const queue = level.filter(makesRoom)
    const queued = new Set(queue.map((shape) => shape.id))
    for (let step = 0; queue.length > 0 && step < level.length * STEPS_PER_SHAPE; step++) {
      const pusher = queue.shift()!
      queued.delete(pusher.id)
      const pusherBox = box(pusher.id)
      const pusherStart = start(pusher)
      for (const shape of level) {
        if (shape === pusher || !movable(shape)) continue
        const shapeBox = box(shape.id)
        const shapeStart = start(shape)!
        // A shape that grew keeps the gaps of the shapes across from it; a new one moves only those it covers.
        let move: { side: Side; length: number } | null
        if (pusherStart) {
          if (overlap(pusherStart, shapeStart)) continue
          move = moveFrom(pusherBox, shapeBox, pusherStart, shapeStart)
        } else {
          if (!overlap(pusherBox, shapeBox)) continue
          const { side, after } = placeFrom(dropped.get(pusher.id) ?? pusherBox, shapeStart)
          if (!after) continue
          move = { side, length: distance(side, pusherBox, shapeBox, ROOM_GAP) }
        }
        if (!move || move.length === 0) continue
        const { side, length } = move
        const dx = side === 'right' ? length : side === 'left' ? -length : 0
        const dy = side === 'down' ? length : side === 'up' ? -length : 0
        carry(shape.id, dx, dy)
        if (!queued.has(shape.id)) {
          queue.push(shape)
          queued.add(shape.id)
        }
      }
    }
  }

  const fit = (frame: RoomShape, level: RoomShape[]) => {
    if (frame.locked || changedByParticipant(frame)) return
    const held = level.filter((shape) => !shape.floating)
    if (!held.some((shape) => outward.has(shape.id))) return
    const outer = box(frame.id)
    const grow: Record<Side, number> = { left: 0, right: 0, up: 0, down: 0 }
    for (const shape of held) {
      const inner = box(shape.id)
      for (const side of SIDES) {
        // How far the shape reaches past the edge of the frame on that side; less than nothing while it is inside.
        const past =
          side === 'right'
            ? right(inner) - right(outer)
            : side === 'left'
              ? outer.x - inner.x
              : side === 'down'
                ? bottom(inner) - bottom(outer)
                : outer.y - inner.y
        if (past > 0 || outward.get(shape.id)?.has(side)) grow[side] = Math.max(grow[side], steps(past + PADDING[side]))
      }
    }
    if (SIDES.every((side) => grow[side] === 0)) return
    boxes.set(frame.id, {
      x: outer.x - grow.left,
      y: outer.y - grow.up,
      width: outer.width + grow.left + grow.right,
      height: outer.height + grow.up + grow.down,
    })
    grown.add(frame.id)
    goesOut(frame.id, ...SIDES.filter((side) => grow[side] > 0))
  }

  const levels = [...members.keys()].sort((a, b) => depth(b) - depth(a))
  for (const id of levels) {
    const level = members.get(id)!
    resolve(level)
    const frame = id === null ? undefined : byId.get(id)
    if (frame) fit(frame, level)
  }

  const result = new Map<string, LayoutBox>()
  for (const shape of shapes) {
    const now = box(shape.id)
    if (!same(now, shape)) result.set(shape.id, now)
  }
  return result
}
