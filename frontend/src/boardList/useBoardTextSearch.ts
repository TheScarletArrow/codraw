import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { searchBoards } from '../api/boards.ts'
import { textQueryOf } from './boardList.ts'

/** How long typing pauses before the texts of boards are searched. */
export const TEXT_SEARCH_DELAY_MS = 300

/** What the search in the texts of boards found for the query in the field. */
export interface TextSearch {
  /** The fragments of the text of each board found, by board id; `null` until the answer for the query is there. */
  matches: ReadonlyMap<string, string> | null
  /** The answer for the query is on its way: the query is still typed or the backend searches. */
  searching: boolean
  failed: boolean
}

const NOTHING: TextSearch = { matches: null, searching: false, failed: false }

/**
 * Searches the texts of the boards the user can open for the query in the field, from two letters on, once typing pauses
 * for {@link TEXT_SEARCH_DELAY_MS}. A request for a query that changed meanwhile is cancelled, and an answer counts only
 * for the query it is for: fragments of an earlier word do not show under a new one.
 */
export function useBoardTextSearch(query: string): TextSearch {
  const wanted = textQueryOf(query)
  const [asked, setAsked] = useState(wanted)
  useEffect(() => {
    const timeout = setTimeout(() => setAsked(wanted), TEXT_SEARCH_DELAY_MS)
    return () => clearTimeout(timeout)
  }, [wanted])
  const search = useQuery({
    queryKey: ['board-search', asked],
    // TanStack Query aborts the request through the signal once its query is no longer wanted.
    queryFn: ({ signal }) => searchBoards(asked, signal),
    enabled: asked !== '',
    staleTime: 30_000,
    retry: false,
  })
  const matches = useMemo(
    () => search.data && new Map(search.data.map((match) => [match.boardId, match.fragment])),
    [search.data],
  )
  if (wanted === '') return NOTHING
  if (asked !== wanted || search.isPending) return { ...NOTHING, searching: true }
  if (search.isError || !matches) return { ...NOTHING, failed: true }
  return { ...NOTHING, matches }
}
