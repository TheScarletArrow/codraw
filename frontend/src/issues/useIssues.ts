import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import { fetchIssueLinks, fetchRepositories, fetchTrackerSettings, type IssueLink } from '../api/issues.ts'
import { issueLinksKey, TRACKER_REPOSITORIES_KEY, TRACKER_SETTINGS_KEY } from './issues.ts'

/** All issues linked to the board; other participants' changes come with the message `issues-changed`. */
export function useIssueLinks(boardId: string) {
  return useQuery({ queryKey: issueLinksKey(boardId), queryFn: () => fetchIssueLinks(boardId) })
}

/** The connection of the user to the tracker; a guest has none to ask for. */
export function useTrackerSettings(enabled = true) {
  return useQuery({ queryKey: TRACKER_SETTINGS_KEY, queryFn: fetchTrackerSettings, enabled, staleTime: 60_000 })
}

/** The repositories that the token of the user reaches, for choosing one. */
export function useTrackerRepositories(enabled: boolean) {
  return useQuery({ queryKey: TRACKER_REPOSITORIES_KEY, queryFn: fetchRepositories, enabled, staleTime: 5 * 60_000 })
}

/**
 * A change of the issues of the board: once it is done, the other participants are told and the links are fetched
 * again; a change that the tracker refused because of the token fetches the connection again too.
 */
export function useIssueLinkChange<T, R>(boardId: string, onChanged: () => void, change: (variables: T) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: change,
    onSuccess: async () => {
      onChanged()
      await queryClient.invalidateQueries({ queryKey: issueLinksKey(boardId) })
    },
    onError: () => queryClient.invalidateQueries({ queryKey: TRACKER_SETTINGS_KEY }),
  })
}

/** What the threads of comments of a board need to show their issues and link more. */
export interface BoardIssues {
  boardId: string
  links: readonly IssueLink[]
  userId: string
  /** The user is a guest: they see issues but connect no tracker. */
  guest: boolean
  /** The user edits the board: they unlink any issue of a thread. */
  canEdit: boolean
  /** Tells the other participants that the issues changed. */
  onChanged: () => void
}

/** The issues of the board for its threads; outside of a board, e.g. in tests of comments alone, threads show none. */
export const BoardIssuesContext = createContext<BoardIssues | null>(null)

export const useBoardIssues = () => useContext(BoardIssuesContext)
