import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import {
  moveBoard,
  OWN_BOARDS_QUERY_KEY,
  setBoardTags,
  SHARED_BOARDS_QUERY_KEY,
  type ListedBoard,
} from '../api/boards.ts'
import { createFolder, deleteFolder, FOLDERS_QUERY_KEY, renameFolder, type BoardFolder } from '../api/folders.ts'

/** The query of the list that a board is in: the boards of the user, or those shared with them. */
export type BoardListKey = typeof OWN_BOARDS_QUERY_KEY | typeof SHARED_BOARDS_QUERY_KEY

const LIST_KEYS: BoardListKey[] = [OWN_BOARDS_QUERY_KEY, SHARED_BOARDS_QUERY_KEY]

/** Changes the board `boardId` in the list `key` in place; the list catches up with the server later anyway. */
function patchBoard(queryClient: QueryClient, key: BoardListKey, boardId: string, change: Partial<ListedBoard>) {
  queryClient.setQueryData<ListedBoard[]>(key, (boards) =>
    boards?.map((board) => (board.id === boardId ? { ...board, ...change } : board)),
  )
}

/** A fetch of the list that started before a change would bring back what was there before. */
const settle = (queryClient: QueryClient, key: BoardListKey) => queryClient.cancelQueries({ queryKey: key, exact: true })

/**
 * Sets the personal tags of a board of the list `key`: the list shows them at once, takes them as the backend keeps
 * them, and goes back to the previous ones when the backend refuses them. Only the latest change has a say: an answer
 * to an earlier one that comes later does not undo it.
 */
export function useBoardTags(key: BoardListKey, board: ListedBoard) {
  const queryClient = useQueryClient()
  const latest = useRef(0)
  return useMutation({
    mutationFn: (tags: string[]) => setBoardTags(board.id, tags),
    onMutate: async (tags) => {
      const change = ++latest.current
      await settle(queryClient, key)
      const previous = board.tags
      patchBoard(queryClient, key, board.id, { tags })
      return { change, previous }
    },
    onSuccess: ({ tags }, _tags, context) => {
      if (context.change === latest.current) patchBoard(queryClient, key, board.id, { tags })
    },
    onError: (_error, _tags, context) => {
      if (context?.change === latest.current) patchBoard(queryClient, key, board.id, { tags: context.previous })
    },
  })
}

/** Puts a board of the list `key` into a folder of the user, or out of any, at once and back on failure. */
export function useMoveBoard(key: BoardListKey, board: ListedBoard) {
  const queryClient = useQueryClient()
  const latest = useRef(0)
  return useMutation({
    mutationFn: (folderId: string | null) => moveBoard(board.id, folderId),
    onMutate: async (folderId) => {
      const change = ++latest.current
      await settle(queryClient, key)
      const previous = board.folderId
      patchBoard(queryClient, key, board.id, { folderId })
      return { change, previous }
    },
    onError: (_error, _folderId, context) => {
      if (context?.change === latest.current) patchBoard(queryClient, key, board.id, { folderId: context.previous })
    },
  })
}

/** Creates a folder of the user; it shows once the backend has given it its id. */
export function useCreateFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createFolder(name),
    onSuccess: (folder) =>
      queryClient.setQueryData<BoardFolder[]>(FOLDERS_QUERY_KEY, (folders) => [...(folders ?? []), folder]),
  })
}

/** Renames a folder of the user at once, and back when the backend refuses the name. */
export function useRenameFolder() {
  const queryClient = useQueryClient()
  const rename = (id: string, name: string) =>
    queryClient.setQueryData<BoardFolder[]>(FOLDERS_QUERY_KEY, (folders) =>
      folders?.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
    )
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFolder(id, name),
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: FOLDERS_QUERY_KEY, exact: true })
      const previous = queryClient.getQueryData<BoardFolder[]>(FOLDERS_QUERY_KEY)?.find((folder) => folder.id === id)
      rename(id, name)
      return { previous }
    },
    onSuccess: (folder) => rename(folder.id, folder.name),
    onError: (_error, _variables, context) => {
      if (context?.previous) rename(context.previous.id, context.previous.name)
    },
  })
}

/**
 * Deletes a folder of the user at once: its boards in both lists are in no folder. When the backend refuses, the
 * folder and its boards come back.
 */
export function useDeleteFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteFolder(id),
    onMutate: async (id) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: FOLDERS_QUERY_KEY, exact: true }),
        ...LIST_KEYS.map((key) => settle(queryClient, key)),
      ])
      const folders = queryClient.getQueryData<BoardFolder[]>(FOLDERS_QUERY_KEY)
      const boards = LIST_KEYS.map(
        (key) =>
          [key, (queryClient.getQueryData<ListedBoard[]>(key) ?? []).filter((board) => board.folderId === id)] as const,
      )
      queryClient.setQueryData<BoardFolder[]>(FOLDERS_QUERY_KEY, folders?.filter((folder) => folder.id !== id))
      boards.forEach(([key, inFolder]) => inFolder.forEach((board) => patchBoard(queryClient, key, board.id, { folderId: null })))
      return { folders, boards }
    },
    onError: (_error, id, context) => {
      if (!context) return
      queryClient.setQueryData(FOLDERS_QUERY_KEY, context.folders)
      context.boards.forEach(([key, inFolder]) =>
        inFolder.forEach((board) => patchBoard(queryClient, key, board.id, { folderId: id })),
      )
    },
  })
}
