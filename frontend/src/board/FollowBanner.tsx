import { Eye, Presentation } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Following } from './following.ts'
import { Avatar } from './Participants.tsx'
import type { RemotePresence } from './presence.ts'
import { boardMessages as m } from './board.messages.ts'

/** Finds the banners over the canvas: pressing on a banner is not moving the canvas. */
export const BANNER_SELECTOR = '[data-following-banner]'

/** A banner over the canvas in the colour of a participant, with one action. */
function Banner({
  label,
  color,
  action,
  onAction,
  children,
}: {
  label: string
  color: string
  action: string
  onAction: () => void
  children: ReactNode
}) {
  return (
    <div
      role="region"
      aria-label={label}
      aria-live="polite"
      data-following-banner=""
      className="absolute top-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full py-1 pr-1 pl-3 text-sm text-white shadow-md"
      style={{ backgroundColor: color }}
    >
      {children}
      <button
        type="button"
        className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap hover:bg-white/30"
        onClick={onAction}
      >
        {action}
      </button>
    </div>
  )
}

/** «Вы следуете за …» over the canvas, in the colour of the participant followed, with a way out. */
export function FollowBanner({ leader, onStop }: { leader: RemotePresence; onStop: () => void }) {
  return (
    <Banner label={m.following} color={leader.color} action={m.stop} onAction={onStop}>
      <Eye aria-hidden className="size-4" />
      <Avatar url={leader.avatarUrl} className="size-5" />
      <span className="whitespace-nowrap">{m.youFollow(leader.name)}</span>
    </Banner>
  )
}

/** «… показывает всем» in the colour of the presenter: the viewer follows them, or has moved away and may come back. */
export function PresenterBanner({
  presenter,
  following,
  onFollow,
  onStop,
}: {
  presenter: RemotePresence
  following: boolean
  onFollow: () => void
  onStop: () => void
}) {
  return (
    <Banner
      label={m.presenting}
      color={presenter.color}
      action={following ? m.unfollow : m.follow}
      onAction={following ? onStop : onFollow}
    >
      <Presentation aria-hidden className="size-4" />
      <Avatar url={presenter.avatarUrl} className="size-5" />
      <span className="whitespace-nowrap">{m.presents(presenter.name)}</span>
    </Banner>
  )
}

/** «Вы показываете всем» in the participant's own colour, with how many participants follow them. */
export function PresentingBanner({ color, followers, onEnd }: { color: string; followers: number; onEnd: () => void }) {
  return (
    <Banner label={m.presenting} color={color} action={m.endPresenting} onAction={onEnd}>
      <Presentation aria-hidden className="size-4" />
      <span className="whitespace-nowrap">{m.youPresent(followers)}</span>
    </Banner>
  )
}

/**
 * The banner over the canvas: one's own presentation, following a participant who does not present, or the
 * presentation of another participant.
 */
export function FollowingBanner({ following, color }: { following: Following; color: string }) {
  const { leader, presenter } = following
  if (following.presenting) {
    return <PresentingBanner color={color} followers={following.followers} onEnd={following.stopPresenting} />
  }
  if (leader && leader.clientId !== presenter?.clientId) return <FollowBanner leader={leader} onStop={following.stop} />
  if (!presenter) return null
  return (
    <PresenterBanner
      presenter={presenter}
      following={leader !== null}
      onFollow={() => following.follow(presenter.clientId)}
      onStop={following.stop}
    />
  )
}
