import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { fetchAccessRequests } from '../api/accessRequests.ts'
import { changeLinkAccess, type Board, type LinkAccess } from '../api/boards.ts'
import type { Embed } from '../api/embed.ts'
import { EmbedSection } from '../embed/EmbedSection.tsx'
import { WorkspaceAccessSection } from '../workspaces/WorkspaceAccessSection.tsx'
import type * as Y from 'yjs'
import { accessRequestsKey, REQUESTS_POLL_INTERVAL } from './accessRequests.ts'
import { AccessRequestsSection } from './AccessRequestsSection.tsx'
import { InvitesSection } from './InvitesSection.tsx'
import { MembersSection } from './MembersSection.tsx'
import { PublicViewSection } from './PublicViewSection.tsx'
import { shareMessages as m } from './share.messages.ts'

/** How long «Скопировано» replaces «Копировать», in milliseconds. */
const COPIED_DURATION = 2_000

/** The modes of the link in the order the owner chooses from. */
const LINK_ACCESS_OPTIONS: readonly LinkAccess[] = ['none', 'view', 'public', 'edit']

const linkAccessOptions = () =>
  LINK_ACCESS_OPTIONS.map((value) => ({
    value,
    label: m.linkAccess[value],
    description: m.linkAccess[`${value}Hint`],
  }))

/** Address of the board open on the page, as the address bar shows it. */
function boardLink(boardId: string, pageId: string | null, origin = window.location.origin) {
  const url = new URL(`/boards/${encodeURIComponent(boardId)}`, origin)
  if (pageId) url.searchParams.set('page', pageId)
  return url.toString()
}

interface ShareButtonProps {
  board: Board
  /** The page the participant is on: the link opens the board on it. */
  pageId: string | null
  /** Tells the other participants that the access to the board, its members or its live image changed. */
  onChanged: () => void
  /** The live image of the board, `null` when it is off, `undefined` until it is known. */
  embed?: Embed | null
  pages?: { id: string; name: string }[]
  document?: Y.Doc | null
  /** Whether the window is open, when the page opens it itself, e.g. from a notification; uncontrolled without it. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * «Поделиться»: the link to the board with a copy button, for the owner what the link gives to others and the requests
 * for access, which the button counts, the code that embeds a board shown to anybody, the participants of the board,
 * invitation links for the owner, and the live image of a page.
 */
export function ShareButton({
  board,
  pageId,
  onChanged,
  embed,
  pages = [],
  document = null,
  open,
  onOpenChange,
}: ShareButtonProps) {
  const queryClient = useQueryClient()
  const isOwner = board.role === 'owner'
  // Requests for access come from users without the board open, so the page of the owner asks for them from time to
  // time, when the tab is shown again and when the window opens.
  const requests = useQuery({
    queryKey: accessRequestsKey(board.id),
    queryFn: () => fetchAccessRequests(board.id),
    enabled: isOwner,
    refetchInterval: REQUESTS_POLL_INTERVAL,
  })
  const waiting = isOwner ? (requests.data?.length ?? 0) : 0
  const input = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  // The choice shows at once, before the request starts, so that the radio button does not jump back.
  const [chosen, setChosen] = useState<LinkAccess | null>(null)
  const link = boardLink(board.id, pageId)
  const change = useMutation({
    mutationFn: (linkAccess: LinkAccess) => changeLinkAccess(board.id, linkAccess),
    onSuccess: (changed) => {
      queryClient.setQueryData(['boards', board.id], changed)
      onChanged()
    },
    onSettled: () => setChosen(null),
  })

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), COPIED_DURATION)
    return () => clearTimeout(timeout)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // No clipboard, e.g. outside a secure context: the selected text is ready to be copied by hand.
      input.current?.select()
    }
  }

  const linkAccess = chosen ?? board.linkAccess
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setCopied(false)
        else if (isOwner) void requests.refetch()
        onOpenChange?.(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          aria-label={
            waiting > 0
              ? m.shareWaiting(waiting)
              : undefined
          }
        >
          <Link2 />
          {/* A phone keeps the icon only, and the line of the board its room. */}
          <span className="max-sm:sr-only">{m.share}</span>
          {waiting > 0 && (
            <span
              aria-hidden
              className="min-w-4 rounded-full bg-amber-400 px-1 text-xs leading-4 font-semibold text-amber-950"
            >
              {waiting}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-[80vh] w-96 flex-col gap-3 overflow-y-auto" aria-label={m.shareBoard}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="board-link" className="text-sm font-medium">
            {m.boardLink}
          </label>
          <div className="flex gap-2">
            <input
              ref={input}
              id="board-link"
              readOnly
              value={link}
              className="h-8 min-w-0 flex-1 rounded-md border bg-muted/50 px-2 text-sm"
              onFocus={(event) => event.target.select()}
            />
            <Button type="button" size="sm" className="w-28" onClick={() => void copy()}>
              {copied ? m.copied : m.copy}
            </Button>
          </div>
        </div>
        {board.sharingBlocked && (
          <p role="note" className="rounded-md bg-amber-100 px-2 py-1.5 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            {m.sharingBlocked}
          </p>
        )}
        {isOwner ? (
          <fieldset className="flex flex-col gap-1" disabled={change.isPending}>
            <legend className="mb-1 text-sm font-medium">{m.linkAccessTitle}</legend>
            {linkAccessOptions().map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent',
                  linkAccess === option.value && 'bg-accent',
                )}
              >
                <input
                  type="radio"
                  name="link-access"
                  value={option.value}
                  checked={linkAccess === option.value}
                  // Only the members keep the board while the sharing is blocked.
                  disabled={board.sharingBlocked && option.value !== 'none'}
                  aria-describedby={`link-access-${option.value}`}
                  className="mt-1"
                  onChange={() => {
                    setChosen(option.value)
                    change.mutate(option.value)
                  }}
                />
                <span className="flex flex-col">
                  <span className="text-sm">{option.label}</span>
                  <span id={`link-access-${option.value}`} className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
            {change.isError && (
              <p role="alert" className="text-sm text-destructive">
                {m.linkAccessFailed}
              </p>
            )}
          </fieldset>
        ) : (
          <p className="text-sm text-muted-foreground">{m.accessOfOthers[board.linkAccess]}</p>
        )}
        {board.linkAccess === 'public' && <PublicViewSection boardId={board.id} pageId={pageId} />}
        {board.workspace && <WorkspaceAccessSection board={board} onChanged={onChanged} />}
        {isOwner && <AccessRequestsSection board={board} requests={requests.data} onChanged={onChanged} />}
        <MembersSection board={board} onChanged={onChanged} />
        {isOwner && <InvitesSection board={board} />}
        {/* Nobody turns the live image on while the sharing is blocked. */}
        {!(board.sharingBlocked && !embed) && (
          <EmbedSection board={board} embed={embed} pages={pages} pageId={pageId} document={document} onChanged={onChanged} />
        )}
      </PopoverContent>
    </Popover>
  )
}
