import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  cancelAccessRequest,
  fetchOwnAccessRequest,
  requestAccess,
  roleGivenOf,
  type AccessRequest,
} from '../api/accessRequests.ts'
import { fetchBoard, type BoardRole } from '../api/boards.ts'
import type { MemberRole } from '../api/members.ts'

/** Query key of the request of the current user for access to a board. */
export const ownAccessRequestKey = (boardId: string) => ['boards', boardId, 'access-request'] as const

/** Query key of the requests for access to a board, which its owner answers. */
export const accessRequestsKey = (boardId: string) => ['boards', boardId, 'access-requests'] as const

/**
 * How often a page that waits for access to a board asks whether it has it, in milliseconds: the board without access,
 * and the request of the user while it waits for an answer.
 */
export const ACCESS_POLL_INTERVAL = 10_000

/** How often the page of the owner asks for new requests for access, in milliseconds. */
export const REQUESTS_POLL_INTERVAL = 30_000

/** The roles from the least to the most allowed. */
const ROLE_ORDER: (BoardRole | null)[] = [null, 'viewer', 'editor', 'owner']

/** What the user asks the owner for. */
export interface AccessWish {
  role: MemberRole
  message: string
}

/**
 * The request of the current user for access to the board, which the page asks for again while it waits for an
 * answer. The owner answers by deleting it: a request that is gone without the user cancelling it was answered, and
 * the board fetched again tells how. When it gives no more than [role], the role of the user now (`null` without
 * access), the request was declined.
 */
export function useOwnAccessRequest(boardId: string, role: BoardRole | null) {
  const queryClient = useQueryClient()
  const key = ownAccessRequestKey(boardId)
  const request = useQuery({
    queryKey: key,
    queryFn: () => fetchOwnAccessRequest(boardId),
    refetchInterval: (query) => (query.state.data ? ACCESS_POLL_INTERVAL : false),
  })
  const [declined, setDeclined] = useState(false)
  // The id of the request seen waiting for an answer: its disappearance is the answer.
  const waiting = useRef<string | null>(null)

  useEffect(() => {
    if (request.data === undefined) return
    if (request.data) {
      waiting.current = request.data.id
      return
    }
    if (waiting.current === null) return
    waiting.current = null
    let current = true
    void queryClient
      .fetchQuery({ queryKey: ['boards', boardId], queryFn: () => fetchBoard(boardId) })
      .then(
        (board) => ROLE_ORDER.indexOf(board.role) > ROLE_ORDER.indexOf(role),
        () => false,
      )
      .then((granted) => {
        if (current && !granted) setDeclined(true)
      })
    return () => {
      current = false
    }
  }, [request.data, queryClient, boardId, role])

  // A fetch of the request that started before a change of it would bring back what was there before.
  const settle = async (changed: AccessRequest | null) => {
    await queryClient.cancelQueries({ queryKey: key, exact: true })
    waiting.current = changed?.id ?? null
    queryClient.setQueryData(key, changed)
  }
  const send = useMutation({
    mutationFn: ({ role, message }: AccessWish) => requestAccess(boardId, role, message),
    onSuccess: async (sent) => {
      setDeclined(false)
      await settle(sent)
    },
    // The board gives what the user asked for already, e.g. its owner has just opened its link: the page takes it.
    onError: (error) => {
      if (roleGivenOf(error)) void queryClient.invalidateQueries({ queryKey: ['boards', boardId], exact: true })
    },
  })
  const cancel = useMutation({
    mutationFn: () => cancelAccessRequest(boardId),
    onSuccess: () => settle(null),
  })

  return {
    /** `null` without a request, `undefined` until it is known. */
    request: request.data,
    failed: request.isError,
    declined,
    send,
    cancel,
  }
}
