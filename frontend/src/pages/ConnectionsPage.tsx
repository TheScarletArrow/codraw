import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { isForbidden } from '../api/http.ts'
import { connectTracker, disconnectTracker, type TrackerSettings } from '../api/issues.ts'
import { useCurrentUser } from '../auth/session.ts'
import { ISSUE_LINKS_KEY, issueErrorMessage, TRACKER_REPOSITORIES_KEY, TRACKER_SETTINGS_KEY } from '../issues/issues.ts'
import { useTrackerSettings } from '../issues/useIssues.ts'

const inputClass =
  'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

const dateFormat = new Intl.DateTimeFormat('ru', { dateStyle: 'long' })

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
        <h1 className="text-xl font-semibold">Подключения</h1>
        <p className="text-sm text-muted-foreground">
          Привязывайте задачи GitHub к элементам схемы и веткам обсуждений, создавайте задачи прямо из CoDraw и видьте
          их номер, название и статус на доске.
        </p>
      </div>
      {user.data?.guest ? (
        <p className="text-sm">
          Подключения доступны после входа через GitHub или Google.{' '}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Войти
          </Link>
        </p>
      ) : (
        <>
          {settings.isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {settings.isError && (
            <p role="alert" className="text-sm text-destructive">
              {isForbidden(settings.error) ? 'Подключения доступны после входа' : 'Не удалось загрузить подключения'}
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
        <p className="text-sm text-muted-foreground">На этом сервере задачи GitHub не подключены.</p>
      ) : (
        <form aria-label="GitHub" className="flex flex-col gap-3" onSubmit={submit}>
          {connection && (
            <p className="text-sm">
              {connection.working ? 'Подключено' : 'GitHub больше не принимает токен'}: <b>{connection.login}</b>, с{' '}
              {dateFormat.format(new Date(connection.connectedAt))}.
              {!connection.working && ' Введите новый токен: до тех пор ваши задачи на досках не обновляются.'}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-token`} className="text-sm font-medium">
              {connection ? 'Новый токен' : 'Токен доступа'}
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
              Создайте{' '}
              {settings.webUrl ? (
                <a
                  href={`${settings.webUrl}/settings/personal-access-tokens/new`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  fine-grained токен
                </a>
              ) : (
                'fine-grained токен'
              )}{' '}
              с доступом только к нужным репозиториям и правом «Issues: Read and write» и сроком действия. Токен — секрет:
              CoDraw хранит его на сервере, больше не покажет и использует только по вашим действиям. Задачи, которые вы
              привяжете, увидят все, кто может открыть доску.
            </span>
          </div>
          {connect.isError && (
            <p role="alert" className="text-sm text-destructive">
              {issueErrorMessage(connect.error, 'Не удалось подключить GitHub')}
            </p>
          )}
          {disconnect.isError && (
            <p role="alert" className="text-sm text-destructive">
              Не удалось отключить GitHub
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending || !token.trim()}>
              {connection ? 'Заменить токен' : 'Подключить'}
            </Button>
            {connection && (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => disconnect.mutate()}>
                Отключить
              </Button>
            )}
          </div>
          {connection && (
            <p className="text-xs text-muted-foreground">
              После отключения привязанные вами задачи остаются на досках, но их статус перестаёт обновляться, пока кто-то
              не возьмёт их на себя.
            </p>
          )}
        </form>
      )}
    </section>
  )
}
