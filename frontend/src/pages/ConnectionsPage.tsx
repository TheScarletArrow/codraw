import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { isForbidden } from '../api/http.ts'
import { connectTracker, disconnectTracker, type TrackerSettings } from '../api/issues.ts'
import { useCurrentUser } from '../auth/session.ts'
import { ISSUE_LINKS_KEY, issueErrorMessage, TRACKER_REPOSITORIES_KEY, TRACKER_SETTINGS_KEY } from '../issues/issues.ts'
import { perLocale } from '../i18n/i18n.ts'
import { useTrackerSettings } from '../issues/useIssues.ts'
import { connectionsMessages as m } from './ConnectionsPage.messages.tsx'

const inputClass =
  'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

const dateFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { dateStyle: 'long' }))

/**
 * «Подключения»: the connection of the user to GitHub, through which they link issues to elements and threads of
 * boards and create issues from them. The token is the user's own: CoDraw keeps it on the server, never shows it again,
 * and uses it only when the user acts.
 */
export function ConnectionsPage() {
  const user = useCurrentUser()
  const settings = useTrackerSettings(user.data !== undefined && !user.data.guest)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 overflow-y-auto p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{m.title}</h1>
        <p className="text-sm text-muted-foreground">
          {m.intro}
        </p>
      </div>
      {user.data?.guest ? (
        <p className="text-sm">
          {m.guest}{' '}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            {m.signIn}
          </Link>
        </p>
      ) : (
        <>
          {settings.isPending && <p className="text-sm text-muted-foreground">{m.loading}</p>}
          {settings.isError && (
            <p role="alert" className="text-sm text-destructive">
              {isForbidden(settings.error) ? m.forbidden : m.loadFailed}
            </p>
          )}
          {settings.data && <GitHubSection settings={settings.data} />}
        </>
      )}
    </div>
  )
}

function GitHubSection({ settings }: { settings: TrackerSettings }) {
  const id = useId()
  const queryClient = useQueryClient()
  const [token, setToken] = useState('')
  const refetch = async () => {
    // Another token reaches other repositories, and links of the user are kept up to date, or not, by it.
    queryClient.removeQueries({ queryKey: TRACKER_REPOSITORIES_KEY })
    await queryClient.invalidateQueries({ queryKey: TRACKER_SETTINGS_KEY })
    await queryClient.invalidateQueries({ queryKey: ISSUE_LINKS_KEY })
  }
  const connect = useMutation({
    mutationFn: () => connectTracker(token),
    onSuccess: () => {
      setToken('')
      return refetch()
    },
  })
  const disconnect = useMutation({ mutationFn: disconnectTracker, onSuccess: refetch })
  const pending = connect.isPending || disconnect.isPending
  const connection = settings.connection
  const submit = (event: FormEvent) => {
    event.preventDefault()
    connect.mutate()
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 id={`${id}-title`} className="font-semibold">
        GitHub
      </h2>
      {!settings.available ? (
        <p className="text-sm text-muted-foreground">{m.unavailable}</p>
      ) : (
        <form aria-label="GitHub" className="flex flex-col gap-3" onSubmit={submit}>
          {connection && (
            <p className="text-sm">
              {connection.working ? m.connected : m.tokenRejected}: <b>{connection.login}</b>, {m.since}{' '}
              {dateFormat().format(new Date(connection.connectedAt))}.
              {!connection.working && m.enterNewToken}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-token`} className="text-sm font-medium">
              {connection ? m.newToken : m.accessToken}
            </label>
            <input
              id={`${id}-token`}
              type="password"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="github_pat_…"
              className={inputClass}
              value={token}
              disabled={pending}
              onChange={(event) => setToken(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              {m.tokenHint(
                settings.webUrl ? (
                  <a
                    href={`${settings.webUrl}/settings/personal-access-tokens/new`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {m.fineGrainedToken}
                  </a>
                ) : (
                  m.fineGrainedToken
                ),
              )}
            </span>
          </div>
          {connect.isError && (
            <p role="alert" className="text-sm text-destructive">
              {issueErrorMessage(connect.error, m.connectFailed)}
            </p>
          )}
          {disconnect.isError && (
            <p role="alert" className="text-sm text-destructive">
              {m.disconnectFailed}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending || !token.trim()}>
              {connection ? m.replaceToken : m.connect}
            </Button>
            {connection && (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => disconnect.mutate()}>
                {m.disconnect}
              </Button>
            )}
          </div>
          {connection && (
            <p className="text-xs text-muted-foreground">
              {m.afterDisconnect}
            </p>
          )}
        </form>
      )}
    </section>
  )
}
