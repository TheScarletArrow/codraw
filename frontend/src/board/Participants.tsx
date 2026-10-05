import { cn } from '@/lib/utils'
import type { PageInfo } from '../diagram/pages.ts'
import type { Participant } from './useBoardConnection.ts'

export function Avatar({ url, className }: { url?: string | null; className?: string }) {
  return url ? <img src={url} alt="" className={cn('participant-avatar rounded-full', className)} /> : null
}

interface ParticipantsProps {
  participants: Participant[]
  /** Pages of the board, to name the page of a participant who is on another page. */
  pages?: PageInfo[]
  currentPageId?: string | null
  /** Follows another participant: their page, the middle of their view and their scale. */
  onFollow?: (clientId: number) => void
  /** The participant being followed. */
  followingClientId?: number | null
  className?: string
}

export function Participants({
  participants,
  pages = [],
  currentPageId = null,
  onFollow,
  followingClientId = null,
  className,
}: ParticipantsProps) {
  return (
    <ul aria-label="Участники" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm', className)}>
      {participants.map((participant) => {
        const elsewhere =
          !participant.isSelf && currentPageId !== null && participant.page !== currentPageId
            ? pages.find((page) => page.id === participant.page)
            : undefined
        const content = (
          <>
            <span
              aria-hidden
              className="participant-color size-2.5 rounded-full"
              style={{ backgroundColor: participant.color }}
            />
            <Avatar url={participant.avatarUrl} className="size-5" />
            {participant.name}
            {participant.isSelf && <span className="text-muted-foreground"> (вы)</span>}
            {elsewhere && <span className="max-w-32 truncate text-muted-foreground"> · {elsewhere.name}</span>}
          </>
        )
        return (
          <li key={participant.clientId} className="flex items-center">
            {participant.isSelf || !onFollow ? (
              <span className="flex items-center gap-1.5">{content}</span>
            ) : (
              <button
                type="button"
                title={
                  participant.clientId === followingClientId
                    ? `Вы следуете за участником ${participant.name}`
                    : `Следовать за участником ${participant.name}`
                }
                aria-pressed={participant.clientId === followingClientId}
                className="-mx-1 flex items-center gap-1.5 rounded px-1 hover:bg-accent aria-pressed:bg-accent"
                onClick={() => onFollow(participant.clientId)}
              >
                {content}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
