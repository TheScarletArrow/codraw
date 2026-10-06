import type { Cell, CellStyle } from '@maxgraph/core'

/**
 * Style key of draw.io that locks a cell against changes, `locked=1` in a file: it cannot be moved, resized, edited,
 * connected or deleted until it is unlocked.
 */
export const LOCKED_KEY = 'locked'

/**
 * Style key with the name of the participant who locked the cell, as it was then. It stays on the board: files and the
 * clipboard do not carry it.
 */
export const LOCKED_BY_KEY = 'codrawLockedBy'

/** The style locks its cell: CoDraw keeps `true`, a file of draw.io may have `1`. */
export function isLockedStyle(style: Record<string, unknown> | null | undefined): boolean {
  const value = style?.[LOCKED_KEY]
  return value === true || value === 1 || value === '1'
}

/**
 * The cell whose lock holds `cell`: the cell itself, or the nearest group or table above it that is locked, as draw.io
 * locks what a locked container holds; `null` when none is.
 */
export function lockHolder(cell: Cell | null): Cell | null {
  for (let current = cell; current; current = current.getParent()) {
    if (isLockedStyle(current.getStyle())) return current
  }
  return null
}

/** All locked cells among `cell` and the cells above it, which unlocking it unlocks. */
export function lockHolders(cell: Cell): Cell[] {
  const holders: Cell[] = []
  for (let current: Cell | null = cell; current; current = current.getParent()) {
    if (isLockedStyle(current.getStyle())) holders.push(current)
  }
  return holders
}

/** A cell inside `cell`, e.g. a shape of a group, is locked of its own. */
export function hasLockedDescendant(cell: Cell): boolean {
  return cell.getChildren().some((child) => isLockedStyle(child.getStyle()) || hasLockedDescendant(child))
}

/** The name of the participant who locked the cell, or `null`, e.g. for a cell locked in draw.io. */
export function lockedByOf(cell: Cell): string | null {
  const name = (cell.getStyle() as Record<string, unknown>)[LOCKED_BY_KEY]
  return typeof name === 'string' && name.trim() !== '' ? name : null
}

/** What a lock shows: «Закреплено: Алиса», the names of several participants, or «Закреплено» without them. */
export function lockLabel(names: readonly (string | null)[]): string {
  const known = [...new Set(names.filter((name): name is string => name !== null))]
  return known.length > 0 ? `Закреплено: ${known.join(', ')}` : 'Закреплено'
}

/** Takes the lock off a copy and its descendants, which are not in a model yet: a copy is a new element. */
export function unlockCopy(cell: Cell) {
  const style = cell.getStyle() as Record<string, unknown>
  if (LOCKED_KEY in style || LOCKED_BY_KEY in style) {
    const { [LOCKED_KEY]: _locked, [LOCKED_BY_KEY]: _lockedBy, ...rest } = style
    cell.setStyle(rest as CellStyle)
  }
  cell.getChildren().forEach(unlockCopy)
}
