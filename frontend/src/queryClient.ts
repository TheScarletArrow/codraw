import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isNotFound, isUnauthorized } from './api/http.ts'
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
        // A missing board will not appear and an ended session will not come back on retry.
        retry: (failureCount, error) => !isNotFound(error) && !isUnauthorized(error) && failureCount < 2,
      },
    },
  })
  return queryClient
}
