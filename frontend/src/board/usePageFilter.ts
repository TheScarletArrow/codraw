import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { DiagramEditor } from '../diagram/editor.ts'
import { filterFromParams, filterQuery, isFilterActive, writeFilterParams, type PageFilter } from '../diagram/pageFilter.ts'

/**
 * The filter of the page (see `pageFilter.ts`), kept in the address of the board as the page is: a link opens the same
 * slice, and so does a reload. The editor of every page that opens shows the page through it.
 */
export function usePageFilter(editor: DiagramEditor | null) {
  const [searchParams, setSearchParams] = useSearchParams()
  // The same object while the filter stays, whatever else of the address changes.
  const query = filterQuery(searchParams)
  const filter = useMemo(() => filterFromParams(new URLSearchParams(query)), [query])
  useEffect(() => {
    editor?.setFilter(isFilterActive(filter) ? filter : null)
  }, [editor, filter])
  const changeFilter = useCallback(
    (next: PageFilter) =>
      setSearchParams(
        (params) => {
          const changed = new URLSearchParams(params)
          writeFilterParams(changed, next)
          return changed
        },
        { replace: true },
      ),
    [setSearchParams],
  )
  return { filter, changeFilter }
}
