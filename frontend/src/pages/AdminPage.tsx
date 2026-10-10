import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  adminKey,
  blockSharing,
  blockUser,
  fetchActions,
  fetchAdminBoard,
  fetchReports,
  findBoards,
  findUsers,
  resolveReport,
  resolveReportsOf,
  trashBoard,
  unblockSharing,
  unblockUser,
  type AdminAction,
  type AdminActionKind,
  type AdminBoardDetails,
  type AdminUser,
  type BoardReport,
} from '../api/admin.ts'
import type { LinkAccess } from '../api/boards.ts'
import { isForbidden } from '../api/http.ts'
import { REPORT_REASONS } from '../admin/reports.ts'
import { useCurrentUser } from '../auth/session.ts'
import { ConfirmedAction } from '../board/ConfirmedAction.tsx'

type Tab = 'reports' | 'users' | 'boards' | 'journal'

const TABS: { id: Tab; label: string }[] = [
  { id: 'reports', label: 'Жалобы' },
  { id: 'users', label: 'Пользователи' },
  { id: 'boards', label: 'Доски' },
  { id: 'journal', label: 'Журнал' },
]

const time = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
const at = (value: string) => time.format(new Date(value))

const LINK_ACCESS: Record<LinkAccess, string> = {
  none: 'Только участники',
  view: 'Просмотр по ссылке',
  public: 'Все, у кого есть ссылка, без входа',
  edit: 'Редактирование по ссылке',
}

const ACTIONS: Record<AdminActionKind, string> = {
  'block-user': 'Заблокировать',
  'unblock-user': 'Разблокировать',
  'block-sharing': 'Закрыть доступ по ссылке',
  'unblock-sharing': 'Снять запрет доступа',
  'trash-board': 'В корзину',
  'resolve-reports': 'Закрыть жалобы',
}

const reasonOf = (report: BoardReport) => REPORT_REASONS.find((reason) => reason.value === report.reason)?.label ?? ''

/** Bytes in the units people read them in. */
function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

/**
 * «Администрирование»: the reports of readers, the users and the boards of the installation, and the journal of what its
 * administrators did. Only the configuration of the installation makes administrators; anybody else sees «Нет доступа»,
 * and the backend answers them 403 anyway.
 */
export function AdminPage() {
  const user = useCurrentUser()
  const [tab, setTab] = useState<Tab>('reports')
  const [boardId, setBoardId] = useState<string | null>(null)

  if (!user.data?.admin) return <NoAccess />
  const openBoard = (id: string) => {
    setBoardId(id)
    setTab('boards')
  }
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 overflow-y-auto p-6">
      <h1 className="text-2xl font-bold">Администрирование</h1>
      <div role="tablist" aria-label="Разделы администрирования" className="flex gap-1 border-b">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={cn(
              '-mb-px border-b-2 px-3 py-1.5 text-sm',
              tab === item.id ? 'border-primary font-medium' : 'border-transparent text-muted-foreground',
            )}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={TABS.find((item) => item.id === tab)!.label} className="flex flex-col gap-4">
        {tab === 'reports' && <Reports onOpenBoard={openBoard} />}
        {tab === 'users' && <Users />}
        {tab === 'boards' && <Boards selected={boardId} onSelect={setBoardId} />}
        {tab === 'journal' && <Journal />}
      </div>
    </div>
  )
}

function NoAccess() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Нет доступа</h1>
      <p className="mt-2 text-muted-foreground">Раздел доступен только администраторам этой установки CoDraw.</p>
    </div>
  )
}

/** What a list shows while it loads or when it fails, and the list itself once it is there. */
function Loaded<T>({ query, empty, children }: { query: { data?: T[]; isError: boolean; error: unknown }; empty: string; children: (items: T[]) => ReactNode }) {
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {isForbidden(query.error) ? 'Нет доступа' : 'Не удалось загрузить'}
      </p>
    )
  }
  if (!query.data) return <p className="text-sm text-muted-foreground">Загрузка…</p>
  if (query.data.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return <>{children(query.data)}</>
}

function Reports({ onOpenBoard }: { onOpenBoard: (boardId: string) => void }) {
  const queryClient = useQueryClient()
  const reports = useQuery({ queryKey: adminKey('reports'), queryFn: () => fetchReports('open') })
  const resolve = useMutation({
    mutationFn: resolveReport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKey() }),
  })
  return (
    <Loaded query={reports} empty="Открытых жалоб нет">
      {(items) => (
        <ul className="flex flex-col gap-2" aria-label="Открытые жалобы">
          {items.map((report) => (
            <li key={report.id} className="flex flex-col gap-1 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{report.board.title}</span>
                <span className="text-muted-foreground">владелец {report.board.owner.name}</span>
                {report.board.sharingBlocked && <Badge>Доступ закрыт</Badge>}
                {report.board.deletedAt && <Badge>В корзине</Badge>}
                <span className="ml-auto text-muted-foreground">{at(report.createdAt)}</span>
              </div>
              <p>
                <span className="font-medium">{reasonOf(report)}</span>
                {report.message && <span className="whitespace-pre-wrap">: {report.message}</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {report.reporter ? `Отправил(а) ${report.reporter.name}` : 'Отправлена без входа'}
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => onOpenBoard(report.board.id)}>
                  Сведения о доске
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate(report.id)}
                >
                  Закрыть жалобу
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Loaded>
  )
}

function Search({ label, onSearch }: { label: string; onSearch: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
    <form
      role="search"
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        onSearch(text.trim())
      }}
    >
      <input
        aria-label={label}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={label}
        className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
      />
      <Button type="submit" size="sm">
        Найти
      </Button>
    </form>
  )
}

function Users() {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const users = useQuery({ queryKey: adminKey('users', text), queryFn: () => findUsers(text) })
  const change = useMutation({
    mutationFn: ({ user, block }: { user: AdminUser; block: boolean }) => (block ? blockUser(user.id) : unblockUser(user.id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKey() }),
  })
  return (
    <>
      <Search label="Имя, id или id у GitHub и Google" onSearch={setText} />
      {change.isError && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось изменить блокировку
        </p>
      )}
      <Loaded query={users} empty="Никого не нашлось">
        {(items) => (
          <ul className="flex flex-col divide-y rounded-md border" aria-label="Пользователи">
            {items.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {user.guest ? 'гость' : `${user.provider}:${user.providerUserId}`} · {user.boards} досок · с{' '}
                    {at(user.createdAt)}
                  </span>
                </span>
                {user.admin && <Badge>Администратор</Badge>}
                {user.blockedAt && <Badge>Заблокирован(а) {at(user.blockedAt)}</Badge>}
                <span className="ml-auto">
                  {user.admin ? null : user.blockedAt ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={change.isPending}
                      onClick={() => change.mutate({ user, block: false })}
                    >
                      Разблокировать
                    </Button>
                  ) : (
                    <ConfirmedAction
                      label="Заблокировать"
                      title={`Заблокировать ${user.name}?`}
                      confirmLabel="Заблокировать"
                      variant="outline"
                      disabled={change.isPending}
                      onConfirm={() => change.mutate({ user, block: true })}
                    >
                      {user.name} не сможет войти, а открытые сеансы и подключения к доскам закроются. Доски останутся.
                    </ConfirmedAction>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Loaded>
    </>
  )
}

function Boards({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const [text, setText] = useState('')
  const boards = useQuery({ queryKey: adminKey('boards', text), queryFn: () => findBoards(text) })
  return (
    <>
      <Search label="Название или id доски" onSearch={setText} />
      {selected && <BoardDetails boardId={selected} />}
      <Loaded query={boards} empty="Досок не нашлось">
        {(items) => (
          <ul className="flex flex-col divide-y rounded-md border" aria-label="Доски">
            {items.map((board) => (
              <li key={board.id}>
                <button
                  type="button"
                  className={cn('flex w-full flex-wrap items-center gap-2 p-3 text-left text-sm hover:bg-accent', selected === board.id && 'bg-accent')}
                  onClick={() => onSelect(board.id)}
                >
                  <span className="font-medium">{board.title}</span>
                  <span className="text-muted-foreground">{board.owner.name}</span>
                  <span className="text-xs text-muted-foreground">{LINK_ACCESS[board.linkAccess]}</span>
                  {board.embed && <Badge>Живая картинка</Badge>}
                  {board.sharingBlocked && <Badge>Доступ закрыт</Badge>}
                  {board.deletedAt && <Badge>В корзине</Badge>}
                  {board.openReports > 0 && <Badge>Жалоб: {board.openReports}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Loaded>
    </>
  )
}

function BoardDetails({ boardId }: { boardId: string }) {
  const queryClient = useQueryClient()
  const details = useQuery({ queryKey: adminKey('board', boardId), queryFn: () => fetchAdminBoard(boardId) })
  const act = useMutation({
    mutationFn: (action: (id: string) => Promise<unknown>) => action(boardId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKey() }),
  })
  if (details.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Не удалось загрузить доску
      </p>
    )
  }
  if (!details.data) return <p className="text-sm text-muted-foreground">Загрузка…</p>
  const { board, workspace, sizes, embed, reports }: AdminBoardDetails = details.data
  return (
    <section aria-label={`Доска «${board.title}»`} className="flex flex-col gap-3 rounded-md border p-4 text-sm">
      <h2 className="text-lg font-semibold">{board.title}</h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Владелец</dt>
        <dd>{board.owner.name}</dd>
        {workspace && (
          <>
            <dt className="text-muted-foreground">Пространство</dt>
            <dd>{workspace.name}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Доступ по ссылке</dt>
        <dd>
          {LINK_ACCESS[board.linkAccess]}
          {board.sharingBlocked && ' · закрыт администратором'}
        </dd>
        <dt className="text-muted-foreground">Живая картинка</dt>
        <dd>{embed ? <code className="break-all">{embed.path}</code> : 'выключена'}</dd>
        <dt className="text-muted-foreground">Размер</dt>
        <dd>
          документ {size(sizes.document)}, версии {size(sizes.versions)} ({sizes.versionCount}), картинки {size(sizes.images)} (
          {sizes.imageCount})
        </dd>
        <dt className="text-muted-foreground">Создана</dt>
        <dd>{at(board.createdAt)}</dd>
        <dt className="text-muted-foreground">Изменена</dt>
        <dd>{at(board.updatedAt)}</dd>
        {board.deletedAt && (
          <>
            <dt className="text-muted-foreground">В корзине</dt>
            <dd>с {at(board.deletedAt)}</dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {board.sharingBlocked ? (
          <Button type="button" size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate(unblockSharing)}>
            Снять запрет
          </Button>
        ) : (
          <ConfirmedAction
            label="Закрыть доступ по ссылке"
            title="Закрыть доступ по ссылке?"
            confirmLabel="Закрыть"
            variant="outline"
            disabled={act.isPending}
            onConfirm={() => act.mutate(blockSharing)}
          >
            Доску откроют только её участники, живая картинка выключится, и владелец не сможет открыть их снова, пока вы
            не снимете запрет.
          </ConfirmedAction>
        )}
        {!board.deletedAt && (
          <ConfirmedAction
            label="В корзину"
            title="Перенести доску в корзину?"
            confirmLabel="В корзину"
            variant="outline"
            disabled={act.isPending}
            onConfirm={() => act.mutate(trashBoard)}
          >
            Доска пропадёт у всех. Владелец сможет восстановить её из корзины в течение 30 дней.
          </ConfirmedAction>
        )}
        {reports.length > 0 && (
          <Button type="button" size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate(resolveReportsOf)}>
            Закрыть жалобы ({reports.length})
          </Button>
        )}
      </div>
      {act.isError && (
        <p role="alert" className="text-destructive">
          Не удалось выполнить действие
        </p>
      )}
      {reports.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Жалобы на доску">
          {reports.map((report) => (
            <li key={report.id}>
              <span className="text-muted-foreground">{at(report.createdAt)}</span> {reasonOf(report)}
              {report.message && `: ${report.message}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Journal() {
  const actions = useQuery({ queryKey: adminKey('actions'), queryFn: fetchActions })
  return (
    <Loaded query={actions} empty="Администраторы пока ничего не делали">
      {(items: AdminAction[]) => (
        <table className="w-full text-left text-sm" aria-label="Журнал действий администраторов">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Когда</th>
              <th className="py-1 font-normal">Кто</th>
              <th className="py-1 font-normal">Что</th>
              <th className="py-1 font-normal">Над чем</th>
            </tr>
          </thead>
          <tbody>
            {items.map((action) => (
              <tr key={action.id} className="border-t">
                <td className="py-1 pr-2 whitespace-nowrap">{at(action.createdAt)}</td>
                <td className="py-1 pr-2">{action.adminName}</td>
                <td className="py-1 pr-2">
                  {ACTIONS[action.action]}
                  {action.details && ` (${action.details})`}
                </td>
                <td className="py-1">
                  {action.targetKind === 'user' ? 'Пользователь' : 'Доска'} «{action.targetLabel}»
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Loaded>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs whitespace-nowrap text-muted-foreground">{children}</span>
}
