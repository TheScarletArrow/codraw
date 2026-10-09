import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { DiagramEditor } from '../diagram/editor.ts'
import { filterFromParams, filterQuery, isFilterActive, writeFilterParams, type PageFilter } from '../diagram/pageFilter.ts'

/** The parameters of the filter alone that an address with `filter` has; see `filterQuery`. */
function queryOf(filter: PageFilter): string {
  const params = new URLSearchParams()
  writeFilterParams(params, filter)
  return filterQuery(params)
}

/**
 * The filter of the page (see `pageFilter.ts`), kept in the address of the board as the page is: a link opens the same
 * slice, and so does a reload. The editor of every page that opens shows the page through it.
 */
export function usePageFilter(editor: DiagramEditor | null) {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = filterQuery(searchParams)
  // The router changes the address in a transition, after the choice: until it does, the page shows the choice, so that
  // a checkbox of the filter is checked at once. Any change of the address ends it.
  const [chosen, setChosen] = useState<{ query: string; at: string } | null>(null)
  if (chosen && chosen.at !== query) setChosen(null)
  const shown = chosen && chosen.at === query ? chosen.query : query
  // The same object while the filter stays, whatever else of the address changes, and once the address has the choice.
  const filter = useMemo(() => filterFromParams(new URLSearchParams(shown)), [shown])
  useEffect(() => {
    editor?.setFilter(isFilterActive(filter) ? filter : null)
  }, [editor, filter])
  const changeFilter = useCallback(
    (next: PageFilter) => {
      setChosen({ query: queryOf(next), at: query })
      setSearchParams(
        (params) => {
          const changed = new URLSearchParams(params)
          writeFilterParams(changed, next)
          return changed
        },
        { replace: true },
      )
    },
    [setSearchParams, query],
  )
  return { filter, changeFilter }
}
