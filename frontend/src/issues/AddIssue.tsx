import { Link2, Lock, Plus, Search, Ticket } from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  createIssue,
  findIssue,
  linkIssue,
  searchIssues,
  type FoundIssue,
  type IssueTarget,
  type TrackerSettings,
} from '../api/issues.ts'
import { newId } from '../diagram/ids.ts'
import { CONNECTIONS_PATH, isRepository, issueErrorMessage, parseIssueReference, stateLabel } from './issues.ts'
import { useIssueLinkChange, useTrackerRepositories, useTrackerSettings } from './useIssues.ts'

const fieldClass =
  'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

/** The browser remembers the repository that the user linked or created an issue in last, for the next time. */
const LAST_REPOSITORY_KEY = 'codraw.issues.repository'

function lastRepository(): string {
  try {
    return window.localStorage.getItem(LAST_REPOSITORY_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberRepository(repository: string) {
  try {
    window.localStorage.setItem(LAST_REPOSITORY_KEY, repository)
  } catch {
    // Without storage the field starts empty next time.
  }
}

/**
 * «Привязать задачу» and «Создать задачу» of an element or a thread, each in a window of its own, or, `compact`, one
 * button «Задача» whose window offers both. The user links issues that their own token reaches; without a connection
 * they are sent to connect GitHub, and a guest gets nothing.
 */
export function AddIssue({
  boardId,
  target,
  guest,
  defaultTitle,
  elementLabel,
  compact = false,
  onChanged,
}: {
  boardId: string
  target: IssueTarget
  guest: boolean
  /** The title that a new issue starts with, e.g. the label of the element. */
  defaultTitle: string
  /** The label of the element, which the link back from a new issue names. */
  elementLabel?: string
  /** One small button, e.g. in every thread of comments. */
  compact?: boolean
  onChanged: () => void
}) {
  const settings = useTrackerSettings(!guest)
  if (guest || !settings.data?.available) return null
  const connection = settings.data.connection
  const connected = connection?.working === true
  const connect = (
    <p className="text-xs text-muted-foreground">
      {connection ? 'GitHub больше не принимает ваш токен. ' : 'Чтобы привязывать и создавать задачи GitHub, '}
      <Link to={CONNECTIONS_PATH} className="text-primary underline-offset-4 hover:underline">
        {connection ? 'Подключить заново' : 'подключите GitHub'}
      </Link>
    </p>
  )
  const linkForm = (close: () => void) => (
    <LinkIssueForm boardId={boardId} target={target} settings={settings.data} onChanged={onChanged} onDone={close} />
  )
  const createForm = (close: () => void) => (
    <CreateIssueForm
      boardId={boardId}
      target={target}
      defaultTitle={defaultTitle}
      elementLabel={elementLabel}
      onChanged={onChanged}
      onDone={close}
    />
  )

  if (compact) {
    return (
      <IssueWindow label="Задача GitHub" trigger={<><Ticket />Задача</>} compact>
        {(close) => (connected ? <IssueModes link={linkForm(close)} create={createForm(close)} /> : connect)}
      </IssueWindow>
    )
  }
  if (!connected) return connect
  return (
    <div className="flex flex-wrap gap-1.5">
      <IssueWindow label="Привязать задачу" trigger={<><Link2 />Привязать задачу</>}>
        {linkForm}
      </IssueWindow>
      <IssueWindow label="Создать задачу" trigger={<><Plus />Создать задачу</>}>
        {createForm}
      </IssueWindow>
    </div>
  )
}

function IssueWindow({
  label,
  trigger,
  compact = false,
  children,
}: {
  label: string
  trigger: ReactNode
  compact?: boolean
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant={compact ? 'ghost' : 'outline'} size="xs" className={cn(compact && 'self-start')}>
          {trigger}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={label} className="flex w-80 flex-col gap-2">
        {open && children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}

/** «Существующая» and «Новая» in one window. */
function IssueModes({ link, create }: { link: ReactNode; create: ReactNode }) {
  const [mode, setMode] = useState<'link' | 'create'>('link')
  return (
    <>
      <div role="tablist" aria-label="Задача" className="flex gap-1">
        {(['link', 'create'] as const).map((value) => (
          <Button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            variant={mode === value ? 'secondary' : 'ghost'}
            size="xs"
            onClick={() => setMode(value)}
          >
            {value === 'link' ? 'Существующая' : 'Новая'}
          </Button>
        ))}
      </div>
      {mode === 'link' ? link : create}
    </>
  )
}

/** The repository field, with the repositories that the token reaches to choose from. */
function RepositoryField({
  id,
  value,
  required,
  onChange,
  disabled,
}: {
  id: string
  value: string
  /** A new issue needs one; an address of an issue names its own. */
  required: boolean
  onChange: (value: string) => void
  disabled: boolean
}) {
  const repositories = useTrackerRepositories(true)
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium">
        Репозиторий
      </label>
      <input
        id={id}
        list={`${id}-list`}
        required={required}
        autoComplete="off"
        spellCheck={false}
        placeholder="owner/name"
        className={fieldClass}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={`${id}-list`}>
        {repositories.data?.map((repository) => <option key={repository.fullName} value={repository.fullName} />)}
      </datalist>
    </div>
  )
}

function LinkIssueForm({
  boardId,
  target,
  settings,
  onChanged,
  onDone,
}: {
  boardId: string
  target: IssueTarget
  settings: TrackerSettings
  onChanged: () => void
  onDone: () => void
}) {
  const id = useId()
  const [repository, setRepository] = useState(lastRepository)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<FoundIssue | null>(null)
  const [results, setResults] = useState<FoundIssue[] | null>(null)
  const [lookup, setLookup] = useState<{ pending: boolean; error: unknown }>({ pending: false, error: null })
  // The text names no issue, and there is no repository to search in.
  const [unclear, setUnclear] = useState(false)
  const link = useIssueLinkChange(boardId, onChanged, (issue: FoundIssue) => linkIssue(boardId, target, issue.repository, issue.number))

  const look = (action: () => Promise<void>) => {
    // A new lookup takes away the issue found before: «Привязать» never links what the user no longer looks at.
    setFound(null)
    setUnclear(false)
    setLookup({ pending: true, error: null })
    action().then(
      () => setLookup({ pending: false, error: null }),
      (error: unknown) => setLookup({ pending: false, error }),
    )
  }
  const preview = (name: string, number: number) =>
    look(async () => {
      setFound(await findIssue(name, number))
      setResults(null)
    })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const reference = parseIssueReference(query, isRepository(repository.trim()) ? repository.trim() : null)
    if (reference) {
      setRepository(reference.repository)
      preview(reference.repository, reference.number)
    } else if (isRepository(repository.trim()) && query.trim()) {
      look(async () => setResults(await searchIssues(repository.trim(), query.trim())))
    } else {
      setFound(null)
      setUnclear(true)
    }
  }
  const pending = lookup.pending || link.isPending
  const lookupError = unclear
    ? 'Укажите репозиторий owner/name и номер задачи, ссылку на неё или слова из названия'
    : lookup.error
      ? issueErrorMessage(lookup.error, 'Не удалось найти задачу')
      : null

  return (
    <>
      <form aria-label="Найти задачу" className="flex flex-col gap-2" onSubmit={submit}>
        <RepositoryField id={`${id}-repository`} value={repository} required={false} onChange={setRepository} disabled={pending} />
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-query`} className="text-xs font-medium">
            Задача
          </label>
          <div className="flex gap-1">
            <input
              id={`${id}-query`}
              required
              autoComplete="off"
              placeholder={`12, ${settings.webUrl ?? 'https://github.com'}/owner/name/issues/12 или слова`}
              className={fieldClass}
              value={query}
              disabled={pending}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button type="submit" variant="outline" size="icon-sm" aria-label="Найти" title="Найти" disabled={pending}>
              <Search />
            </Button>
          </div>
        </div>
      </form>
      {results && (
        <ul aria-label="Найденные задачи" className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
          {results.length === 0 && <li className="text-xs text-muted-foreground">Ничего не найдено</li>}
          {results.map((issue) => (
            <li key={issue.number}>
              <button
                type="button"
                className="w-full rounded px-1.5 py-1 text-left text-sm hover:bg-accent"
                disabled={pending}
                onClick={() => preview(issue.repository, issue.number)}
              >
                <span className="text-muted-foreground">#{issue.number}</span> {issue.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      {found && (
        <section aria-label="Задача" className="flex flex-col gap-1.5 rounded-md border p-2 text-sm">
          <span className="font-medium break-words">{found.title}</span>
          <span className="text-xs text-muted-foreground">
            {found.repository}#{found.number} · {stateLabel(found)}
          </span>
          {found.private ? (
            <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
              <Lock aria-hidden className="mt-px size-3 shrink-0" />
              Репозиторий закрытый: номер, название и статус задачи увидят все, кто может открыть доску.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Номер, название и статус задачи увидят все, кто может открыть доску.</p>
          )}
          <Button
            type="button"
            size="sm"
            className="self-start"
            disabled={pending}
            onClick={() =>
              link.mutate(found, {
                onSuccess: () => {
                  rememberRepository(found.repository)
                  onDone()
                },
              })
            }
          >
            Привязать
          </Button>
        </section>
      )}
      {(lookupError || link.isError) && (
        <p role="alert" className="text-xs text-destructive">
          {lookupError || issueErrorMessage(link.error, 'Не удалось привязать задачу')}
        </p>
      )}
    </>
  )
}

function CreateIssueForm({
  boardId,
  target,
  defaultTitle,
  elementLabel,
  onChanged,
  onDone,
}: {
  boardId: string
  target: IssueTarget
  defaultTitle: string
  elementLabel?: string
  onChanged: () => void
  onDone: () => void
}) {
  const id = useId()
  // One id for the issue of this window: a request repeated after a lost answer creates no second issue.
  const [requestId] = useState(newId)
  const [repository, setRepository] = useState(lastRepository)
  const [title, setTitle] = useState(defaultTitle.slice(0, TITLE_MAX_LENGTH))
  const [description, setDescription] = useState('')
  const create = useIssueLinkChange(boardId, onChanged, () =>
    createIssue(boardId, target, {
      requestId,
      repository: repository.trim(),
      title: title.trim(),
      description,
      ...(elementLabel !== undefined && { elementLabel }),
    }),
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!isRepository(repository.trim()) || !title.trim()) return
    create.mutate(undefined, {
      onSuccess: () => {
        rememberRepository(repository.trim())
        onDone()
      },
    })
  }

  return (
    <form aria-label="Новая задача" className="flex flex-col gap-2" onSubmit={submit}>
      <RepositoryField id={`${id}-repository`} value={repository} required onChange={setRepository} disabled={create.isPending} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-title`} className="text-xs font-medium">
          Название
        </label>
        <input
          id={`${id}-title`}
          required
          maxLength={TITLE_MAX_LENGTH}
          className={fieldClass}
          value={title}
          disabled={create.isPending}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-description`} className="text-xs font-medium">
          Описание
        </label>
        <textarea
          id={`${id}-description`}
          rows={4}
          maxLength={DESCRIPTION_MAX_LENGTH}
          className="min-h-16 w-full min-w-0 rounded-md border bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          value={description}
          disabled={create.isPending}
          onChange={(event) => setDescription(event.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          В конце задачи будет ссылка на {'threadId' in target ? 'это обсуждение' : 'этот элемент'} в CoDraw. Задачу увидят
          все, кто может открыть доску.
        </span>
      </div>
      {create.isError && (
        <p role="alert" className="text-xs text-destructive">
          {issueErrorMessage(create.error, 'Не удалось создать задачу')}
        </p>
      )}
      <Button type="submit" size="sm" className="self-start" disabled={create.isPending || !isRepository(repository.trim())}>
        Создать в GitHub
      </Button>
    </form>
  )
}

const TITLE_MAX_LENGTH = 256
const DESCRIPTION_MAX_LENGTH = 20000
