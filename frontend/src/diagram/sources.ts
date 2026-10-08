import type { CellData } from './model.ts'

/** Style key with the stable source identity of an imported cell, e.g. `sql:public.users`. */
export const SOURCE_KEY = 'codrawSource'

/** The stable source identity of a cell imported from code or a schema. */
export function sourceOf(cell: Pick<CellData, 'style'>): string | null {
  const source = cell.style[SOURCE_KEY]
  return typeof source === 'string' && source.trim() !== '' ? source : null
}

/** A copy of a cell with the source marker added to its style. */
export function withSource<T extends CellData>(cell: T, source: string): T {
  return { ...cell, style: { ...cell.style, [SOURCE_KEY]: source } }
}
