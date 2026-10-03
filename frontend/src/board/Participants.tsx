import { cn } from '@/lib/utils'
import type { Participant } from './useBoardConnection.ts'

export function Participants({ participants, className }: { participants: Participant[]; className?: string }) {
  return (
    <ul aria-label="Участники" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm', className)}>
      {participants.map((participant) => (
        <li key={participant.clientId} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="participant-color size-2.5 rounded-full"
            style={{ backgroundColor: participant.color }}
          />
          {participant.name}
          {participant.isSelf && <span className="text-muted-foreground"> (вы)</span>}
        </li>
      ))}
    </ul>
  )
}
