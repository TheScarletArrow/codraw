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
  /** Brings the viewer to another participant: to their page and their cursor. */
  onFollow?: (clientId: number) => void
  className?: string
}

export function Participants({ participants, pages = [], currentPageId = null, onFollow, className }: ParticipantsProps) {
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
                title={`Перейти к участнику ${participant.name}`}
                className="-mx-1 flex items-center gap-1.5 rounded px-1 hover:bg-accent"
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
