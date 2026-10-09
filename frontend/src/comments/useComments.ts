import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import {
  addReaction,
  assignThread,
  deleteComment,
  editComment,
  fetchPeople,
  fetchThreads,
  removeReaction,
  replyToThread,
  resolveThread,
  unassignThread,
  type Comment,
  type CommentText,
  type CommentThread,
  type Person,
  type Reaction,
} from '../api/comments.ts'
import { getCells, type CellKind } from '../diagram/model.ts'
import type { ThreadActions } from './ThreadCard.tsx'
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

/** What may be done with a thread that is there: answer it, change and delete its comments, resolve and assign it. */
export function useThreadActions(boardId: string, onChanged: () => void): ThreadActions {
  const reply = useCommentChange(boardId, onChanged, ({ thread, text }: { thread: CommentThread; text: CommentText }) =>
    replyToThread(boardId, thread.id, text),
  )
  const edit = useCommentChange(
    boardId,
    onChanged,
    ({ thread, comment, text }: { thread: CommentThread; comment: Comment; text: CommentText }) =>
      editComment(boardId, thread.id, comment.id, text),
  )
  const remove = useCommentChange(boardId, onChanged, ({ thread, comment }: { thread: CommentThread; comment: Comment }) =>
    deleteComment(boardId, thread.id, comment.id),
  )
  const resolve = useCommentChange(boardId, onChanged, ({ thread, resolved }: { thread: CommentThread; resolved: boolean }) =>
    resolveThread(boardId, thread.id, resolved),
  )
  const react = useCommentChange(
    boardId,
    onChanged,
    ({ thread, comment, reaction, on }: { thread: CommentThread; comment: Comment; reaction: Reaction; on: boolean }) =>
      (on ? addReaction : removeReaction)(boardId, thread.id, comment.id, reaction),
  )
  const assign = useCommentChange(boardId, onChanged, ({ thread, assignee }: { thread: CommentThread; assignee: Person | null }) =>
    assignee ? assignThread(boardId, thread.id, assignee.id) : unassignThread(boardId, thread.id),
  )
  return {
    reply: (thread, text) => reply.mutateAsync({ thread, text }),
    edit: (thread, comment, text) => edit.mutateAsync({ thread, comment, text }),
    remove: (thread, comment) => remove.mutateAsync({ thread, comment }),
    resolve: (thread, resolved) => resolve.mutateAsync({ thread, resolved }),
    react: (thread, comment, reaction, on) => react.mutateAsync({ thread, comment, reaction, on }),
    assign: (thread, assignee) => assign.mutateAsync({ thread, assignee }),
  }
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
