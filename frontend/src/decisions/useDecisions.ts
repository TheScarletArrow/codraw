import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchDecisions } from '../api/decisions.ts'
import { threadsKey } from '../comments/threads.ts'
import { decisionsKey } from './decisions.ts'

/** All decisions of the board; other participants' changes come with the message `decisions-changed`. */
export function useDecisions(boardId: string) {
  return useQuery({ queryKey: decisionsKey(boardId), queryFn: () => fetchDecisions(boardId) })
}

/**
 * A change of the decisions: once it is done, the decisions are fetched again, and the threads, which go away with a
 * deleted decision, and the other participants are told, so that they fetch them too.
 */
export function useDecisionChange<T, R>(boardId: string, onChanged: () => void, change: (variables: T) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: change,
    onSuccess: async () => {
      onChanged()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: decisionsKey(boardId) }),
        queryClient.invalidateQueries({ queryKey: threadsKey(boardId) }),
      ])
    },
  })
}
