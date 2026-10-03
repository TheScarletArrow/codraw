import { QueryClient } from '@tanstack/react-query'
import { isNotFound } from './api/boards.ts'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A missing board will not appear on retry.
        retry: (failureCount, error) => !isNotFound(error) && failureCount < 2,
      },
    },
  })
}
