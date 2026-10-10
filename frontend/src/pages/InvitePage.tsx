import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { SHARED_BOARDS_QUERY_KEY } from '../api/boards.ts'
import { isNotFound } from '../api/http.ts'
import { acceptInvite, limitOf } from '../api/members.ts'
import { inviteMessages as m } from './InvitePage.messages.ts'

/**
 * An invitation link: the signed-in user, a guest too, accepts it and lands on the board with its role. A visitor
 * without a session gets here again after continuing as a guest.
 */
export function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const accept = useMutation({
    mutationFn: acceptInvite,
    onSuccess: async (board) => {
      queryClient.setQueryData(['boards', board.id], board)
      await queryClient.invalidateQueries({ queryKey: SHARED_BOARDS_QUERY_KEY })
      await navigate(`/boards/${board.id}`, { replace: true })
    },
  })
  const { mutate } = accept
  // Accepting twice changes nothing, but React runs the effect twice in development.
  const accepted = useRef<string | null>(null)
  useEffect(() => {
    if (accepted.current === token) return
    accepted.current = token
    mutate(token)
  }, [token, mutate])

  if (!accept.isError) return <p className="p-6 text-muted-foreground">{m.accepting}</p>
  const limit = limitOf(accept.error)
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-6">
      {isNotFound(accept.error) ? (
        <>
          <h2 className="text-2xl font-semibold">{m.invalid}</h2>
          <p className="text-muted-foreground">
            {m.invalidHint}
          </p>
        </>
      ) : (
        <p role="alert" className="text-destructive">
          {limit === null
            ? m.failed
            : m.membersLimit(limit)}
        </p>
      )}
      <Link to="/" className="underline">
        {m.toBoards}
      </Link>
    </section>
  )
}
