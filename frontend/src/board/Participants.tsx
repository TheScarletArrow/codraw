import { Presentation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PageInfo } from '../diagram/pages.ts'
import type { Participant } from './useBoardConnection.ts'

export function Avatar({ url, className }: { url?: string | null; className?: string }) {
  return url ? <img src={url} alt="" className={cn('participant-avatar rounded-full', className)} /> : null
}

/**
 * The color and the avatar, then the name. The column of the name has no minimum: it is what shortens, and the
 * participant keeps at least the color and the avatar.
 */
const NAME_LAYOUT = 'grid grid-cols-[auto_minmax(0,max-content)] items-center gap-1.5'

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
    // One line however many participants come: when the room is short, the names shorten, down to the color and the
    // avatar, and show in full on hover.
    <ul aria-label="Участники" className={cn('flex items-center gap-x-3 text-sm', className)}>
      {participants.map((participant) => {
        const elsewhere =
          !participant.isSelf && currentPageId !== null && participant.page !== currentPageId
            ? pages.find((page) => page.id === participant.page)
            : undefined
        const fullName = `${participant.name}${participant.isSelf ? ' (вы)' : ''}${elsewhere ? ` · ${elsewhere.name}` : ''}`
        const content = (
          <>
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="participant-color size-2.5 rounded-full"
                style={{ backgroundColor: participant.color }}
              />
              <Avatar url={participant.avatarUrl} className="size-5" />
            </span>
            <span className="truncate">
              {participant.name}
              {participant.isSelf && <span className="text-muted-foreground"> (вы)</span>}
              {elsewhere && (
                <>
                  {' '}
                  <span className="inline-block max-w-32 truncate align-bottom text-muted-foreground">
                    · {elsewhere.name}
                  </span>
                </>
              )}
            </span>
          </>
        )
        return (
          <li key={participant.clientId} className="flex items-center">
            {participant.isSelf || !onFollow ? (
              <span title={fullName} className={NAME_LAYOUT}>
                {content}
              </span>
            ) : (
              <button
                type="button"
                title={
                  participant.clientId === followingClientId
                    ? `Вы следуете за участником ${participant.name}`
                    : `Следовать за участником ${participant.name}`
                }
                aria-pressed={participant.clientId === followingClientId}
                className={cn('-mx-1 rounded px-1 hover:bg-accent aria-pressed:bg-accent', NAME_LAYOUT)}
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

/** Starts presenting to everybody: the other participants follow. Pressed while presenting; pressing it ends that. */
export function PresentButton({
  presenting,
  disabled = false,
  onToggle,
}: {
  presenting: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Показать всем"
      aria-pressed={presenting}
      title={presenting ? 'Закончить показ' : 'Показать всем: участники будут следовать за вами'}
      disabled={disabled}
      className="aria-pressed:bg-accent"
      onClick={onToggle}
    >
      <Presentation />
    </Button>
  )
}
