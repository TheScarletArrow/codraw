import { useQuery, type QueryClient } from '@tanstack/react-query'
import { fetchMe } from '../api/auth.ts'

export const ME_QUERY_KEY = ['me'] as const

/** The signed-in user; the query fails with 401 when there is no session. */
export function useCurrentUser() {
  // Loaded once; requests that get 401 make it load again through `recheckSession`.
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe, staleTime: Infinity })
}

/** Checks the session again, e.g. after a request got 401: once it has ended, the layout opens the login page. */
export function recheckSession(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
}
