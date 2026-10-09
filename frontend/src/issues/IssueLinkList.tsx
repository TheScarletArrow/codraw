import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleDot, CircleSlash, Lock, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { refreshIssueLinks, takeOverIssueLink, unlinkIssue, type IssueLink } from '../api/issues.ts'
import { issueErrorMessage, issueLinksKey, issueReference, isWebUrl, stateLabel, staleLinks, syncProblem } from './issues.ts'
import { useIssueLinkChange } from './useIssues.ts'

/**
 * Issues linked to one element or thread: the state, the number and the title of each, which opens the issue in the
 * tracker, and why a link may be out of date. Links not brought up to date for a while are asked about as they are
 * shown, with the connection of whoever linked them.
 */
export function IssueLinkList({
  boardId,
  links,
  canUnlink,
  canTakeOver,
  onChanged,
}: {
  boardId: string
  links: readonly IssueLink[]
  /** Whether the user may unlink the link. */
  canUnlink: (link: IssueLink) => boolean
  /** Whether the user may keep links that are out of date up to date with their own connection. */
  canTakeOver: boolean
  /** Tells the other participants that the issues changed. */
  onChanged: () => void
}) {
  const refresh = useRefresh(boardId, links, onChanged)
  const unlink = useIssueLinkChange(boardId, onChanged, (link: IssueLink) => unlinkIssue(boardId, link.id))
  const takeOver = useIssueLinkChange(boardId, onChanged, (link: IssueLink) => takeOverIssueLink(boardId, link.id))
  const error = unlink.error ?? takeOver.error

  if (links.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <ul aria-label="Задачи" className="flex flex-col gap-1.5">
        {links.map((link) => {
          const problem = syncProblem(link)
          return (
            <li
              key={link.id}
              data-issue={issueReference(link)}
              className={cn('flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-sm', link.sync !== 'ok' && 'border-dashed')}
            >
              <StateIcon link={link} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {isWebUrl(link.url) ? (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    title="Открыть в GitHub"
                    className="break-words font-medium hover:underline"
                  >
                    {link.title}
                  </a>
                ) : (
                  <span className="break-words font-medium">{link.title}</span>
                )}
                <span className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                  <span>{issueReference(link)}</span>
                  <span aria-hidden>·</span>
                  <span>{stateLabel(link)}</span>
                  {link.private && (
                    <span title="Закрытый репозиторий: задачу показал участник, который её привязал" className="inline-flex">
                      <Lock aria-label="Закрытый репозиторий" className="size-3" />
                    </span>
                  )}
                </span>
                {problem && (
                  <span className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                    <TriangleAlert aria-hidden className="mt-px size-3 shrink-0" />
                    {problem}
                  </span>
                )}
                {problem && canTakeOver && (
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto self-start p-0 text-xs"
                    disabled={takeOver.isPending}
                    onClick={() => takeOver.mutate(link)}
                  >
                    Обновлять через моё подключение
                  </Button>
                )}
              </div>
              {canUnlink(link) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Отвязать ${issueReference(link)}`}
                  title="Отвязать (задача останется в GitHub)"
                  disabled={unlink.isPending}
                  onClick={() => unlink.mutate(link)}
                >
                  <X />
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {issueErrorMessage(error, unlink.error ? 'Не удалось отвязать задачу' : 'Не удалось обновить задачу')}
        </p>
      )}
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        Статус приходит из GitHub, CoDraw его не меняет.
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Обновить из GitHub"
          title="Обновить из GitHub"
          disabled={refresh.pending}
          onClick={refresh.now}
        >
          <RefreshCw className={cn(refresh.pending && 'animate-spin')} />
        </Button>
      </p>
    </div>
  )
}

function StateIcon({ link }: { link: IssueLink }) {
  const label = stateLabel(link)
  if (link.state === 'open') return <CircleDot aria-label={label} className="mt-0.5 size-4 shrink-0 text-emerald-600" />
  if (link.stateReason === 'not-planned' || link.stateReason === 'duplicate') {
    return <CircleSlash aria-label={label} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
  }
  return <CircleCheck aria-label={label} className="mt-0.5 size-4 shrink-0 text-violet-600" />
}

/**
 * Asks the tracker about the links that were not brought up to date for a while, once each while they are shown, and
 * about all of them on demand; the other participants are told when anything changed.
 */
function useRefresh(boardId: string, links: readonly IssueLink[], onChanged: () => void) {
  const queryClient = useQueryClient()
  const asked = useRef(new Set<string>())
  const refresh = useMutation({
    mutationFn: (ids: string[]) => refreshIssueLinks(boardId, ids),
    onSuccess: (fresh) => {
      const before = queryClient.getQueryData<IssueLink[]>(issueLinksKey(boardId)) ?? []
      const changed = fresh.some((link) => {
        const old = before.find((candidate) => candidate.id === link.id)
        return !old || old.title !== link.title || old.state !== link.state || old.sync !== link.sync || old.number !== link.number
      })
      queryClient.setQueryData<IssueLink[]>(issueLinksKey(boardId), (current) =>
        current?.map((link) => fresh.find((candidate) => candidate.id === link.id) ?? link),
      )
      if (changed) onChanged()
    },
  })
  const { mutate } = refresh
  useEffect(() => {
    const ids = staleLinks(links, Date.now())
      .map((link) => link.id)
      .filter((id) => !asked.current.has(id))
      .slice(0, MAX_REFRESH)
    if (ids.length === 0) return
    ids.forEach((id) => asked.current.add(id))
    mutate(ids)
  }, [links, mutate])

  return {
    pending: refresh.isPending,
    now: () => mutate(links.slice(0, MAX_REFRESH).map((link) => link.id)),
  }
}

/** The most links that one request brings up to date. */
const MAX_REFRESH = 20
