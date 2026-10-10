import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { copyBoard, OWN_BOARDS_QUERY_KEY, type Board } from '../api/boards.ts'
import { HttpError } from '../api/http.ts'
import { boardMessages as m } from './board.messages.ts'

/** Why a copy of a board failed, in words for the user. */
export function copyErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 409 && error.problem?.title === 'Image quota reached') {
      return m.copyQuota
    }
    if (error.status === 409 && error.problem?.limit !== undefined) {
      return m.copyLimit(error.problem.limit)
    }
    if (error.status === 503) return m.imagesUnavailable
  }
  return m.copyFailed
}

/**
 * «Создать копию» of a board: makes the copy, which the lists of boards then show, and opens it. Copying needs any role
 * on the board, viewing too.
 */
export function useCopyBoard(boardId: string) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const copy = useMutation({
    mutationFn: () => copyBoard(boardId),
    onSuccess: async (board: Board) => {
      queryClient.setQueryData(['boards', board.id], board)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: OWN_BOARDS_QUERY_KEY, exact: true }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
      ])
      await navigate(`/boards/${board.id}`)
    },
  })
  return { copy: () => copy.mutate(), pending: copy.isPending, error: copy.isError ? copyErrorMessage(copy.error) : null }
}
