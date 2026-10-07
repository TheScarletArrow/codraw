import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { HttpError, isUnauthorized } from '../api/http.ts'
import { importSchema, type SslMode } from '../api/schemaImport.ts'
import { recheckSession } from '../auth/session.ts'
import { parseConnectionString } from './connectionString.ts'

interface DatabaseConnectionProps {
  /** The most tables of a schema that the server reads. */
  maxTables: number
  /** The DDL of the schema, once the server read it. */
  onLoaded: (ddl: string) => void
  onBack: () => void
}

interface Fields {
  host: string
  port: string
  database: string
  schema: string
  user: string
  password: string
  sslMode: SslMode
}

const EMPTY: Fields = { host: '', port: '5432', database: '', schema: 'public', user: '', password: '', sslMode: 'prefer' }

const SSL_MODES: { value: SslMode; label: string }[] = [
  { value: 'disable', label: 'Не использовать' },
  { value: 'prefer', label: 'Если есть' },
  { value: 'require', label: 'Обязательно' },
  { value: 'verify-full', label: 'С проверкой сертификата' },
]

/** What the user reads for a reason of a failed import, as the server names it. */
const REASONS: Record<string, string> = {
  'host-not-allowed': 'Администратор CoDraw не разрешил подключаться к этому адресу',
  'connection-failed': 'Не удалось подключиться к PostgreSQL: проверьте хост, порт и SSL',
  'authentication-failed': 'Неверная база, пользователь или пароль',
  'schema-not-found': 'В базе нет такой схемы',
  timeout: 'База не ответила вовремя',
  'unsupported-server': 'Нужен PostgreSQL 12 или новее',
  'sign-in-required': 'Подключаться к базе можно после входа через GitHub или Google',
}

function failure(error: unknown): string {
  if (!(error instanceof HttpError)) return 'Не удалось загрузить схему'
  const { reason, limit } = error.problem ?? {}
  if (reason === 'too-large') return limit ? `В схеме больше ${limit} таблиц — столько за раз не загрузить` : 'Схема слишком большая для загрузки'
  if (reason && REASONS[reason]) return REASONS[reason]
  if (error.status === 429) return 'Слишком много попыток подключения, попробуйте позже'
  if (error.status === 400) return 'Проверьте хост, порт и остальные поля'
  if (error.status === 404) return 'Подключение к базе выключено'
  return 'Не удалось загрузить схему'
}

const inputClass =
  'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

/**
 * «Подключение к базе» of «Импорт SQL»: where and as whom the server reads the schema of a PostgreSQL database, typed
 * or from a connection string, and the DDL it reads goes to the field of the import. The password lives only while the
 * window is open: it is in no storage and in no cache of requests.
 */
export function DatabaseConnection({ maxTables, onLoaded, onBack }: DatabaseConnectionProps) {
  const queryClient = useQueryClient()
  const [connectionString, setConnectionString] = useState('')
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (changes: Partial<Fields>) => setFields((current) => ({ ...current, ...changes }))
  const port = Number(fields.port)
  const complete =
    fields.host.trim() !== '' && fields.database !== '' && fields.user !== '' && Number.isInteger(port) && port > 0 && port <= 65535

  const pasteConnection = (text: string) => {
    setConnectionString(text)
    const parts = parseConnectionString(text)
    if (!parts) return
    // The string replaces what it says; a host without a port is on the port of PostgreSQL.
    set({
      ...(parts.host !== undefined && { host: parts.host, port: String(parts.port ?? 5432) }),
      ...(parts.port !== undefined && { port: String(parts.port) }),
      ...(parts.database !== undefined && { database: parts.database }),
      ...(parts.schema !== undefined && { schema: parts.schema }),
      ...(parts.user !== undefined && { user: parts.user }),
      ...(parts.password !== undefined && { password: parts.password }),
      ...(parts.sslMode !== undefined && { sslMode: parts.sslMode }),
    })
  }

  const load = async () => {
    setBusy(true)
    setError(null)
    try {
      const { ddl } = await importSchema({
        host: fields.host.trim(),
        port,
        database: fields.database,
        user: fields.user,
        password: fields.password,
        schema: fields.schema.trim() || 'public',
        sslMode: fields.sslMode,
      })
      onLoaded(ddl)
    } catch (caught) {
      if (isUnauthorized(caught)) void recheckSession(queryClient)
      setError(failure(caught))
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Назад" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <h2 className="text-sm font-semibold">Подключение к базе</h2>
      </div>
      <Field label="Строка подключения">
        <input
          className={inputClass}
          placeholder="postgresql://user@host:5432/database"
          autoComplete="off"
          spellCheck={false}
          value={connectionString}
          onChange={(event) => pasteConnection(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <Field label="Хост">
          <input className={inputClass} autoComplete="off" spellCheck={false} value={fields.host} onChange={(event) => set({ host: event.target.value })} />
        </Field>
        <Field label="Порт">
          <input className={inputClass} inputMode="numeric" value={fields.port} onChange={(event) => set({ port: event.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="База">
          <input className={inputClass} autoComplete="off" spellCheck={false} value={fields.database} onChange={(event) => set({ database: event.target.value })} />
        </Field>
        <Field label="Схема">
          <input className={inputClass} autoComplete="off" spellCheck={false} value={fields.schema} onChange={(event) => set({ schema: event.target.value })} />
        </Field>
        <Field label="Пользователь">
          <input className={inputClass} autoComplete="off" spellCheck={false} value={fields.user} onChange={(event) => set({ user: event.target.value })} />
        </Field>
        <Field label="Пароль">
          <input
            className={inputClass}
            type="password"
            autoComplete="off"
            value={fields.password}
            onChange={(event) => set({ password: event.target.value })}
          />
        </Field>
      </div>
      <Field label="SSL">
        <select className={inputClass} value={fields.sslMode} onChange={(event) => set({ sslMode: event.target.value as SslMode })}>
          {SSL_MODES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs text-muted-foreground">
        Только PostgreSQL, не больше {maxTables} таблиц схемы. Сервер CoDraw подключается к базе один раз, только для
        чтения, и не сохраняет пароль.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button type="button" size="sm" disabled={busy || !complete} onClick={() => void load()}>
        {busy ? 'Загрузка…' : 'Загрузить схему'}
      </Button>
    </>
  )
}
