import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { isForbidden } from '../api/http.ts'
import {
  confirmEmail,
  deleteChannel,
  fetchNotificationSettings,
  NOTIFICATION_EVENTS,
  NOTIFICATION_SETTINGS_QUERY_KEY,
  resendConfirmation,
  saveEmailChannel,
  saveWebhookChannel,
  testWebhook,
  unmuteBoard,
  type EmailChannel,
  type MutedBoard,
  type NotificationEvent,
  type WebhookChannel,
} from '../api/notificationSettings.ts'
import { useCurrentUser } from '../auth/session.ts'
import { ago, deliveryErrorText, EVENT_LABELS, settingsErrorMessage, type ChannelKind } from '../notifications/channelSettings.ts'

const inputClass =
  'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

/**
 * «Уведомления вне CoDraw»: the email address and the chat where the notifications of the user go, what goes there,
 * and the boards whose notifications do not. The link of the letter that confirms an address opens this page with
 * `?confirm=`, which the page sends once and takes out of the address.
 */
export function NotificationSettingsPage() {
  const user = useCurrentUser()
  const confirmation = useConfirmation()
  const settings = useQuery({
    queryKey: NOTIFICATION_SETTINGS_QUERY_KEY,
    queryFn: fetchNotificationSettings,
    // After the confirmation, which changes them: a request that went meanwhile would show the address unconfirmed.
    enabled: user.data !== undefined && !user.data.guest && !confirmation.waiting,
  })

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 overflow-y-auto p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Уведомления вне CoDraw</h1>
        <p className="text-sm text-muted-foreground">
          Упоминания, ответы, назначенные ветки, доступ к доскам и ревью — на почту и в рабочий чат. Колокольчик CoDraw
          показывает уведомления как прежде; то, что вы прочитали в нём, не приходит.
        </p>
      </div>
      {user.data?.guest ? (
        <p className="text-sm">
          Уведомления вне CoDraw доступны после входа через GitHub или Google.{' '}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Войти
          </Link>
        </p>
      ) : (
        <>
          <Confirmation mutation={confirmation.mutation} />
          {settings.isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {settings.isError && (
            <p role="alert" className="text-sm text-destructive">
              {isForbidden(settings.error) ? 'Настройки доступны после входа' : 'Не удалось загрузить настройки'}
            </p>
          )}
          {settings.data && (
            <>
              <EmailSection available={settings.data.email.available} channel={settings.data.email.channel} />
              <WebhookSection
                available={settings.data.webhook.available}
                hosts={settings.data.webhook.hosts}
                channel={settings.data.webhook.channel}
              />
              <MutedBoardsSection boards={settings.data.mutedBoards} />
            </>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Confirms the address with the token of the link of the letter, once; `waiting` while the page has a token that is not
 * confirmed or refused yet.
 */
function useConfirmation() {
  const [params, setParams] = useSearchParams()
  const [hasToken] = useState(() => params.has('confirm'))
  const token = useRef(params.get('confirm'))
  const mutation = useMutation({ mutationFn: confirmEmail })
  const { mutate } = mutation

  useEffect(() => {
    const value = token.current
    if (!value) return
    token.current = null
    mutate(value)
    // The token works once: it does not stay in the history of the browser.
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('confirm')
        return next
      },
      { replace: true },
    )
  }, [mutate, setParams])

  return { mutation, waiting: hasToken && (mutation.isIdle || mutation.isPending) }
}

/** How the confirmation of the address went. */
function Confirmation({ mutation: confirm }: { mutation: ReturnType<typeof useConfirmation>['mutation'] }) {
  if (confirm.isSuccess) {
    return (
      <p role="status" className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
        Адрес подтверждён: уведомления будут приходить на почту
      </p>
    )
  }
  if (confirm.isError) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {settingsErrorMessage(confirm.error)}
      </p>
    )
  }
  return null
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** «Присылать» and the events of a channel, which the form of the channel keeps until it is saved. */
function useChannelForm(channel: { enabled: boolean; events: NotificationEvent[] } | null) {
  const [enabled, setEnabled] = useState(channel?.enabled ?? true)
  const [events, setEvents] = useState<NotificationEvent[]>(channel?.events ?? NOTIFICATION_EVENTS)
  const toggle = (event: NotificationEvent, on: boolean) =>
    setEvents((current) => NOTIFICATION_EVENTS.filter((item) => (item === event ? on : current.includes(item))))
  return { enabled, setEnabled, events, toggle }
}

function ChannelOptions({
  sendLabel,
  form,
  disabled,
}: {
  sendLabel: string
  form: ReturnType<typeof useChannelForm>
  disabled: boolean
}) {
  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.enabled} disabled={disabled} onChange={(event) => form.setEnabled(event.target.checked)} />
        {sendLabel}
      </label>
      <fieldset className="flex flex-col gap-1" disabled={disabled || !form.enabled}>
        <legend className="mb-1 text-sm font-medium">О чём</legend>
        {NOTIFICATION_EVENTS.map((event) => (
          <label key={event} className="flex items-baseline gap-2 text-sm has-disabled:text-muted-foreground">
            <input
              type="checkbox"
              checked={form.events.includes(event)}
              onChange={(change) => form.toggle(event, change.target.checked)}
            />
            <span>
              {EVENT_LABELS[event].label}
              {EVENT_LABELS[event].hint && <span className="text-muted-foreground"> — {EVENT_LABELS[event].hint}</span>}
            </span>
          </label>
        ))}
      </fieldset>
    </>
  )
}

/** When the last message went and why the last one did not. */
function DeliveryState({ kind, channel }: { kind: ChannelKind; channel: EmailChannel | WebhookChannel }) {
  return (
    <>
      {channel.lastDeliveredAt && (
        <p className="text-sm text-muted-foreground">
          {kind === 'email' ? 'Последнее письмо' : 'Последнее сообщение'} — {ago(channel.lastDeliveredAt)}
        </p>
      )}
      {channel.lastError && channel.lastErrorAt && (
        <p role="alert" className="text-sm text-destructive">
          {deliveryErrorText(kind, channel.lastError)} ({ago(channel.lastErrorAt)})
        </p>
      )}
    </>
  )
}

function useRefetchSettings() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: NOTIFICATION_SETTINGS_QUERY_KEY })
}

function EmailSection({ available, channel }: { available: boolean; channel: EmailChannel | null }) {
  return (
    <Section title="Почта">
      {available ? (
        // A new state of the channel from the server starts the form anew.
        <EmailForm key={channel ? `${channel.address}|${channel.enabled}|${channel.events.join()}` : 'none'} channel={channel} />
      ) : (
        <p className="text-sm text-muted-foreground">Почта на этом сервере не настроена</p>
      )}
    </Section>
  )
}

function EmailForm({ channel }: { channel: EmailChannel | null }) {
  const id = useId()
  const refetch = useRefetchSettings()
  const [address, setAddress] = useState(channel?.address ?? '')
  const form = useChannelForm(channel)
  const save = useMutation({
    mutationFn: () => saveEmailChannel(address, { enabled: form.enabled, events: form.events }),
    onSuccess: refetch,
  })
  const resend = useMutation({ mutationFn: resendConfirmation, onSuccess: refetch })
  const remove = useMutation({ mutationFn: () => deleteChannel('email'), onSuccess: refetch })
  const pending = save.isPending || resend.isPending || remove.isPending
  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <form aria-label="Почта" className="flex flex-col gap-3" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-address`} className="text-sm font-medium">
          Адрес
        </label>
        <input
          id={`${id}-address`}
          type="email"
          required
          autoComplete="email"
          className={inputClass}
          value={address}
          disabled={pending}
          onChange={(event) => setAddress(event.target.value)}
        />
        {channel && address.trim().toLowerCase() !== channel.address.toLowerCase() && (
          <span className="text-xs text-muted-foreground">На новый адрес придёт письмо со ссылкой для подтверждения</span>
        )}
      </div>
      <ChannelOptions sendLabel="Присылать письма" form={form} disabled={pending} />
      {channel && <EmailState channel={channel} onResend={() => resend.mutate()} resending={resend.isPending} />}
      {(save.isError || resend.isError || remove.isError) && (
        <p role="alert" className="text-sm text-destructive">
          {settingsErrorMessage(save.error ?? resend.error ?? remove.error)}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Сохранить
        </Button>
        {channel && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => remove.mutate()}>
            Удалить
          </Button>
        )}
      </div>
    </form>
  )
}

function EmailState({ channel, onResend, resending }: { channel: EmailChannel; onResend: () => void; resending: boolean }) {
  if (channel.verified) {
    return (
      <>
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Адрес подтверждён</p>
        <DeliveryState kind="email" channel={channel} />
      </>
    )
  }
  return (
    <div className="flex flex-col items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm">
      <p>
        {channel.verificationSentAt
          ? `Адрес не подтверждён — откройте ссылку из письма, отправленного на ${channel.address} ${ago(channel.verificationSentAt)}`
          : 'Адрес не подтверждён: письмо со ссылкой не отправилось'}
      </p>
      {channel.lastError && <p className="text-destructive">{deliveryErrorText('email', channel.lastError)}</p>}
      <Button type="button" variant="outline" size="xs" disabled={resending} onClick={onResend}>
        Отправить письмо ещё раз
      </Button>
    </div>
  )
}

function WebhookSection({ available, hosts, channel }: { available: boolean; hosts: string[]; channel: WebhookChannel | null }) {
  return (
    <Section title="Чат">
      {available ? (
        <WebhookForm
          key={channel ? `${channel.addressHint}|${channel.enabled}|${channel.events.join()}` : 'none'}
          hosts={hosts}
          channel={channel}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Чаты на этом сервере не настроены</p>
      )}
    </Section>
  )
}

function WebhookForm({ hosts, channel }: { hosts: string[]; channel: WebhookChannel | null }) {
  const id = useId()
  const refetch = useRefetchSettings()
  const [url, setUrl] = useState('')
  const form = useChannelForm(channel)
  const save = useMutation({
    mutationFn: () => saveWebhookChannel(url.trim() || null, { enabled: form.enabled, events: form.events }),
    onSuccess: () => {
      setUrl('')
      return refetch()
    },
  })
  const test = useMutation({ mutationFn: testWebhook, onSettled: refetch })
  const remove = useMutation({ mutationFn: () => deleteChannel('webhook'), onSuccess: refetch })
  const pending = save.isPending || test.isPending || remove.isPending
  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <form aria-label="Чат" className="flex flex-col gap-3" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-url`} className="text-sm font-medium">
          Адрес входящего вебхука
        </label>
        <input
          id={`${id}-url`}
          type="url"
          required={!channel}
          autoComplete="off"
          spellCheck={false}
          placeholder={channel ? 'Оставьте пустым, чтобы не менять' : `https://${hosts[0] ?? 'hooks.slack.com'}/services/…`}
          className={inputClass}
          value={url}
          disabled={pending}
          onChange={(event) => setUrl(event.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          {channel && <>Сейчас: {channel.addressHint}. </>}
          Slack, Mattermost или Rocket.Chat; адрес — секрет, CoDraw его больше не покажет. Разрешены:{' '}
          {hosts.join(', ')}
        </span>
      </div>
      <ChannelOptions sendLabel="Присылать сообщения" form={form} disabled={pending} />
      {channel && <DeliveryState kind="webhook" channel={channel} />}
      {test.isSuccess && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          Пробное сообщение отправлено
        </p>
      )}
      {(save.isError || test.isError || remove.isError) && (
        <p role="alert" className="text-sm text-destructive">
          {settingsErrorMessage(save.error ?? test.error ?? remove.error)}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Сохранить
        </Button>
        {channel && (
          <>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => test.mutate()}>
              Проверить
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => remove.mutate()}>
              Удалить
            </Button>
          </>
        )}
      </div>
    </form>
  )
}

function MutedBoardsSection({ boards }: { boards: MutedBoard[] }) {
  const refetch = useRefetchSettings()
  const unmute = useMutation({ mutationFn: unmuteBoard, onSuccess: refetch })

  return (
    <Section title="Доски без уведомлений">
      {boards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Нет. Чтобы не получать письма и сообщения о доске, выберите «Не присылать уведомления» в меню доски.
        </p>
      ) : (
        <ul aria-label="Доски без уведомлений" className="flex flex-col gap-1">
          {boards.map((board) => (
            <li key={board.boardId} className="flex items-center gap-2 text-sm">
              {board.boardTitle === null ? (
                <span className="flex-1 text-muted-foreground">Доска недоступна</span>
              ) : (
                <Link to={`/boards/${encodeURIComponent(board.boardId)}`} className="flex-1 truncate hover:underline">
                  {board.boardTitle}
                </Link>
              )}
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={unmute.isPending}
                aria-label={board.boardTitle ? `Присылать снова: ${board.boardTitle}` : 'Присылать снова'}
                onClick={() => unmute.mutate(board.boardId)}
              >
                Присылать снова
              </Button>
            </li>
          ))}
        </ul>
      )}
      {unmute.isError && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось включить уведомления доски
        </p>
      )}
    </Section>
  )
}
