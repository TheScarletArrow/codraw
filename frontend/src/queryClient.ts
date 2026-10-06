import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isForbidden, isNotFound, isUnauthorized } from './api/http.ts'
import { ME_QUERY_KEY, recheckSession } from './auth/session.ts'

export function createQueryClient() {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isUnauthorized(error) && query.queryKey[0] !== ME_QUERY_KEY[0]) void recheckSession(queryClient)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isUnauthorized(error)) void recheckSession(queryClient)
      },
    }),
    defaultOptions: {
      queries: {
        // A missing board will not appear, an ended session will not come back and a closed board will not open on
        // retry; a page without access to a board asks again from time to time instead.
        retry: (failureCount, error) =>
          !isNotFound(error) && !isUnauthorized(error) && !isForbidden(error) && failureCount < 2,
      },
    },
  })
  return queryClient
}
