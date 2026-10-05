import { Eye } from 'lucide-react'
import { Avatar } from './Participants.tsx'
import type { RemotePresence } from './presence.ts'

/** «Вы следуете за …» over the canvas, in the colour of the participant followed, with a way out. */
export function FollowBanner({ leader, onStop }: { leader: RemotePresence; onStop: () => void }) {
  return (
    <div
      role="region"
      aria-label="Следование"
      aria-live="polite"
      className="absolute top-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full py-1 pr-1 pl-3 text-sm text-white shadow-md"
      style={{ backgroundColor: leader.color }}
    >
      <Eye aria-hidden className="size-4" />
      <Avatar url={leader.avatarUrl} className="size-5" />
      <span className="whitespace-nowrap">Вы следуете за {leader.name}</span>
      <button
        type="button"
        className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium hover:bg-white/30"
        onClick={onStop}
      >
        Остановить
      </button>
    </div>
  )
}
