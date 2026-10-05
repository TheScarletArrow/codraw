import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import { fetchPeople, fetchThreads } from '../api/comments.ts'
import { getCells, type CellKind } from '../diagram/model.ts'
import { cellLabel, peopleKey, threadsKey, type CellInfo } from './threads.ts'

/** All threads of the board; other participants' changes come with the message `comments-changed`. */
export function useThreads(boardId: string) {
  return useQuery({ queryKey: threadsKey(boardId), queryFn: () => fetchThreads(boardId) })
}

/** Who may be mentioned on the board, fetched once the field of a comment is shown. */
export function usePeople(boardId: string) {
  return useQuery({ queryKey: peopleKey(boardId), queryFn: () => fetchPeople(boardId), staleTime: 60_000 })
}

/**
 * A change of the comments: once it is done, the threads are fetched again and the other participants are told, so that
 * they fetch them too.
 */
export function useCommentChange<T, R>(boardId: string, onChanged: () => void, change: (variables: T) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: change,
    onSuccess: async () => {
      onChanged()
      await queryClient.invalidateQueries({ queryKey: threadsKey(boardId) })
    },
  })
}

/**
 * Reads the elements of the pages from the board document for the threads about them; re-renders whenever the document
 * changes, e.g. when another participant deletes an element.
 */
export function useCellInfo(document: Y.Doc | null): (pageId: string, cellId: string) => CellInfo | null {
  const version = useRef(0)
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!document) return () => {}
      const update = () => {
        version.current++
        onChange()
      }
      document.on('update', update)
      return () => document.off('update', update)
    },
    [document],
  )
  const current = useSyncExternalStore(subscribe, () => version.current)
  return useCallback(
    (pageId: string, cellId: string) => {
      // The version ties the function to the state of the document it reads.
      void current
      const cell = document && getCells(document, pageId).get(cellId)
      if (!cell) return null
      return { kind: cell.get('kind') as CellKind, label: cellLabel(String(cell.get('value') ?? '')) }
    },
    [document, current],
  )
}
