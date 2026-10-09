import type { Cell } from '@maxgraph/core'
import type { StyleValue } from './model.ts'
import { isTableStyle, type ShapeStyle } from './shapes.ts'
import { MATERIALIZED_VIEW_BADGE, VIEW_BADGE } from './tableRows.ts'

/**
 * Style keys of views: a view is a table of the page whose fields are the columns of a query. draw.io keeps keys it does
 * not know, so files keep the first two; the query is an attribute of the `<object>` around the cell, since its `;` and
 * `=` would break the style (see `drawio/style.ts`).
 */
export const VIEW_KEY = 'codrawView'
/** A materialized view: the database keeps its rows, and it may have indexes. */
export const MATERIALIZED_KEY = 'codrawViewMaterialized'
/** The query of a view: the text after `AS`, without the final `;`. */
export const VIEW_QUERY_KEY = 'codrawViewQuery'

/** A query longer than this is not kept: a view is not a program. */
export const MAX_VIEW_QUERY = 64 * 1024

const flag = (value: unknown) => value === true || value === 1 || value === '1'

/** The style of a view; for the cells of a page, e.g. those of an export. */
export function isViewStyle(style: Record<string, unknown>): boolean {
  return flag(style[VIEW_KEY])
}

/** The style of a materialized view: a view that is materialized. */
export function isMaterializedStyle(style: Record<string, unknown>): boolean {
  return isViewStyle(style) && flag(style[MATERIALIZED_KEY])
}

/** The query of a view, or an empty one when it has none or one too long to keep. */
export function viewQueryOf(style: Record<string, unknown>): string {
  const query = style[VIEW_QUERY_KEY]
  return typeof query === 'string' && query.length <= MAX_VIEW_QUERY ? query : ''
}

/** A table of the page that is a view. */
export function isViewTable(cell: Cell | null | undefined): boolean {
  return cell?.isVertex() === true && isTableStyle(cell.getStyle() as ShapeStyle) && isViewStyle(cell.getStyle() as Record<string, unknown>)
}

/** The badge at the right of the header of a view or a materialized view; `null` for a table. */
export function viewBadge(style: Record<string, unknown>): string | null {
  if (!isViewStyle(style)) return null
  return isMaterializedStyle(style) ? MATERIALIZED_VIEW_BADGE : VIEW_BADGE
}

/** A query as a view keeps it: without spaces at its ends and without the `;` that ends a statement. */
export function normalizeViewQuery(query: string): string {
  return query.trim().replace(/[\s;]+$/, '')
}

/** The keys of the style of a view with its query, for a table built from a schema. */
export function viewStyle({ materialized, query }: { materialized: boolean; query: string }): Record<string, StyleValue> {
  const normalized = normalizeViewQuery(query)
  return {
    [VIEW_KEY]: true,
    ...(materialized && { [MATERIALIZED_KEY]: true }),
    ...(normalized && normalized.length <= MAX_VIEW_QUERY && { [VIEW_QUERY_KEY]: normalized }),
  }
}
