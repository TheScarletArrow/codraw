import { useQuery } from '@tanstack/react-query'
import { fetchBoards, fetchSharedBoards, SHARED_BOARDS_QUERY_KEY } from '../api/boards.ts'

/** A board that a link may lead to: one of the user or one shared with them. */
export interface LinkableBoard {
  id: string
  title: string
  /** The name of the owner of a board of another user; `null` for a board of the user. */
  owner: string | null
}

export interface LinkableBoards {
  /** The boards of the user, then those shared with them, each once; `undefined` while they load. */
  boards: LinkableBoard[] | undefined
  /** The boards could not be loaded. */
  failed: boolean
}

/**
 * The boards that the user may link to: their own and those of others that they are a member of or opened, as the list
 * of boards shows them. Loaded only while `enabled`.
 */
export function useLinkableBoards(enabled: boolean): LinkableBoards {
  const own = useQuery({ queryKey: ['boards'], queryFn: fetchBoards, enabled })
  const shared = useQuery({ queryKey: SHARED_BOARDS_QUERY_KEY, queryFn: fetchSharedBoards, enabled })
  if (own.isError || shared.isError) return { boards: undefined, failed: true }
  if (!own.data || !shared.data) return { boards: undefined, failed: false }
  const ids = new Set(own.data.map((board) => board.id))
  return {
    boards: [
      ...own.data.map((board) => ({ id: board.id, title: board.title, owner: null })),
      ...shared.data.filter((board) => !ids.has(board.id)).map((board) => ({ id: board.id, title: board.title, owner: board.owner.name })),
    ],
    failed: false,
  }
}
