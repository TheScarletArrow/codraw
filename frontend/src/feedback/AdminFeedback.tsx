import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { adminKey } from '../api/admin.ts'
import { fetchFeedback, resolveFeedback, type Feedback } from '../api/feedback.ts'
import { isForbidden } from '../api/http.ts'
import { perLocale } from '../i18n/i18n.ts'
import { adminMessages } from '../pages/AdminPage.messages.ts'
import { feedbackMessages as m } from './messages.ts'

type Status = 'open' | 'resolved'

const STATUSES: Status[] = ['open', 'resolved']

const time = perLocale((tag) => new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' }))
const at = (value: string) => time().format(new Date(value))

/** Where the feedback came from: the page, the version of the app and the browser, those that it has. */
function origin(item: Feedback): string {
  return [
    item.page && m.page(item.page),
    item.appVersion && m.version(item.appVersion),
    item.userAgent && m.browser(item.userAgent),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * «Отзывы» of «Администрирование»: what users told the administrators, the newest first, open or closed. The name of
 * the author opens them in «Пользователи»; feedback of a deleted account has no author.
 */
export function AdminFeedback({ onOpenUser }: { onOpenUser: (userId: string) => void }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<Status>('open')
  const feedback = useQuery({ queryKey: adminKey('feedback', status), queryFn: () => fetchFeedback(status) })
  const resolve = useMutation({
    mutationFn: resolveFeedback,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKey() }),
  })

  let list: ReactNode
  if (feedback.isError) {
    list = (
      <p role="alert" className="text-sm text-destructive">
        {isForbidden(feedback.error) ? adminMessages.noAccess : adminMessages.loadFailed}
      </p>
    )
  } else if (!feedback.data) {
    list = <p className="text-sm text-muted-foreground">{adminMessages.loading}</p>
  } else if (feedback.data.length === 0) {
    list = <p className="text-sm text-muted-foreground">{status === 'open' ? m.noOpen : m.noResolved}</p>
  } else {
    list = (
      <ul className="flex flex-col gap-2" aria-label={status === 'open' ? m.openList : m.resolvedList}>
        {feedback.data.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{m.kinds[item.kind]}</Badge>
              {item.author ? (
                <button
                  type="button"
                  className="font-medium hover:underline"
                  title={m.authorHint}
                  onClick={() => onOpenUser(item.author!.id)}
                >
                  {item.author.name}
                </button>
              ) : (
                <span className="text-muted-foreground">{m.deletedUser}</span>
              )}
              {item.author?.guest && <Badge>{m.guest}</Badge>}
              <span className="ml-auto text-muted-foreground">{at(item.createdAt)}</span>
            </div>
            <p className="break-words whitespace-pre-wrap">{item.text}</p>
            <p className="text-xs break-all text-muted-foreground">{origin(item)}</p>
            {item.resolvedAt ? (
              <p className="text-xs text-muted-foreground">{m.resolvedBy(at(item.resolvedAt), item.resolvedBy ?? '')}</p>
            ) : (
              <div>
                <Button type="button" size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate(item.id)}>
                  {m.resolve}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <fieldset className="flex gap-4 text-sm">
        <legend className="sr-only">{m.show}</legend>
        {STATUSES.map((option) => (
          <label key={option} className="flex items-center gap-1.5">
            <input type="radio" name="feedback-status" value={option} checked={status === option} onChange={() => setStatus(option)} />
            {option === 'open' ? m.open : m.resolved}
          </label>
        ))}
      </fieldset>
      {resolve.isError && (
        <p role="alert" className="text-sm text-destructive">
          {m.resolveFailed}
        </p>
      )}
      {list}
    </>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs whitespace-nowrap text-muted-foreground">{children}</span>
}
