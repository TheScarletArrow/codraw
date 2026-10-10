import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  adminKey,
  blockSharing,
  blockUser,
  deleteUser,
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
import { HttpError, isForbidden } from '../api/http.ts'
import { REPORT_REASONS } from '../admin/reports.ts'
import { useCurrentUser } from '../auth/session.ts'
import { ConfirmedAction } from '../board/ConfirmedAction.tsx'
import { perLocale } from '../i18n/i18n.ts'
import { adminMessages as m } from './AdminPage.messages.ts'

type Tab = 'reports' | 'users' | 'boards' | 'journal'

const TABS: Tab[] = ['reports', 'users', 'boards', 'journal']

const time = perLocale((tag) => new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' }))
const at = (value: string) => time().format(new Date(value))

const linkAccess = (access: LinkAccess): string => m.linkAccess[access]

const actionLabel = (action: AdminActionKind): string => m.actions[action]

const reasonOf = (report: BoardReport) => REPORT_REASONS.find((reason) => reason.value === report.reason)?.label ?? ''

/** Bytes in the units people read them in. */
function size(bytes: number): string {
  if (bytes < 1024) return m.bytes(bytes)
  if (bytes < 1024 * 1024) return m.kilobytes((bytes / 1024).toFixed(1))
  return m.megabytes((bytes / 1024 / 1024).toFixed(1))
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
      <h1 className="text-2xl font-bold">{m.title}</h1>
      <div role="tablist" aria-label={m.sections} className="flex gap-1 border-b">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={cn(
              '-mb-px border-b-2 px-3 py-1.5 text-sm',
              tab === item ? 'border-primary font-medium' : 'border-transparent text-muted-foreground',
            )}
            onClick={() => setTab(item)}
          >
            {m.tabs[item]}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={m.tabs[tab]} className="flex flex-col gap-4">
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
      <h1 className="text-2xl font-bold">{m.noAccess}</h1>
      <p className="mt-2 text-muted-foreground">{m.noAccessHint}</p>
    </div>
  )
}

/** What a list shows while it loads or when it fails, and the list itself once it is there. */
function Loaded<T>({ query, empty, children }: { query: { data?: T[]; isError: boolean; error: unknown }; empty: string; children: (items: T[]) => ReactNode }) {
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {isForbidden(query.error) ? m.noAccess : m.loadFailed}
      </p>
    )
  }
  if (!query.data) return <p className="text-sm text-muted-foreground">{m.loading}</p>
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
    <Loaded query={reports} empty={m.noOpenReports}>
      {(items) => (
        <ul className="flex flex-col gap-2" aria-label={m.openReports}>
          {items.map((report) => (
            <li key={report.id} className="flex flex-col gap-1 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{report.board.title}</span>
                <span className="text-muted-foreground">{m.owner(report.board.owner.name)}</span>
                {report.board.sharingBlocked && <Badge>{m.sharingBlocked}</Badge>}
                {report.board.deletedAt && <Badge>{m.inTrash}</Badge>}
                <span className="ml-auto text-muted-foreground">{at(report.createdAt)}</span>
              </div>
              <p>
                <span className="font-medium">{reasonOf(report)}</span>
                {report.message && <span className="whitespace-pre-wrap">: {report.message}</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {report.reporter ? m.reportedBy(report.reporter.name) : m.reportedAnonymously}
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => onOpenBoard(report.board.id)}>
                  {m.boardDetails}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate(report.id)}
                >
                  {m.resolveReport}
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
        {m.find}
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
  const remove = useMutation({
    mutationFn: (user: AdminUser) => deleteUser(user.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKey() }),
  })
  return (
    <>
      <Search label={m.userSearch} onSearch={setText} />
      {change.isError && (
        <p role="alert" className="text-sm text-destructive">
          {m.blockFailed}
        </p>
      )}
      {remove.isError && (
        <p role="alert" className="text-sm text-destructive">
          {remove.error instanceof HttpError && remove.error.problem?.reason === 'sole-workspace-owner'
            ? m.soleWorkspaceOwner
            : m.deleteFailed}
        </p>
      )}
      <Loaded query={users} empty={m.nobodyFound}>
        {(items) => (
          <ul className="flex flex-col divide-y rounded-md border" aria-label={m.users}>
            {items.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {user.guest ? m.guest : `${user.provider}:${user.providerUserId}`} · {m.boardCount(user.boards)} ·{' '}
                    {m.since(at(user.createdAt))}
                  </span>
                </span>
                {user.admin && <Badge>{m.admin}</Badge>}
                {user.blockedAt && <Badge>{m.blockedAt(at(user.blockedAt))}</Badge>}
                <span className="ml-auto flex gap-2">
                  {user.admin ? null : user.blockedAt ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={change.isPending}
                      onClick={() => change.mutate({ user, block: false })}
                    >
                      {m.unblock}
                    </Button>
                  ) : (
                    <ConfirmedAction
                      label={m.block}
                      title={m.blockTitle(user.name)}
                      confirmLabel={m.block}
                      variant="outline"
                      disabled={change.isPending}
                      onConfirm={() => change.mutate({ user, block: true })}
                    >
                      {m.blockText(user.name)}
                    </ConfirmedAction>
                  )}
                  {!user.admin && (
                    <ConfirmedAction
                      label={m.remove}
                      title={m.removeTitle(user.name)}
                      confirmLabel={m.removeConfirm}
                      variant="ghost"
                      disabled={remove.isPending}
                      onConfirm={() => remove.mutate(user)}
                    >
                      {m.removeText}
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
      <Search label={m.boardSearch} onSearch={setText} />
      {selected && <BoardDetails boardId={selected} />}
      <Loaded query={boards} empty={m.noBoardsFound}>
        {(items) => (
          <ul className="flex flex-col divide-y rounded-md border" aria-label={m.boards}>
            {items.map((board) => (
              <li key={board.id}>
                <button
                  type="button"
                  className={cn('flex w-full flex-wrap items-center gap-2 p-3 text-left text-sm hover:bg-accent', selected === board.id && 'bg-accent')}
                  onClick={() => onSelect(board.id)}
                >
                  <span className="font-medium">{board.title}</span>
                  <span className="text-muted-foreground">{board.owner.name}</span>
                  <span className="text-xs text-muted-foreground">{linkAccess(board.linkAccess)}</span>
                  {board.embed && <Badge>{m.embed}</Badge>}
                  {board.sharingBlocked && <Badge>{m.sharingBlocked}</Badge>}
                  {board.deletedAt && <Badge>{m.inTrash}</Badge>}
                  {board.openReports > 0 && <Badge>{m.reportCount(board.openReports)}</Badge>}
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
        {m.boardLoadFailed}
      </p>
    )
  }
  if (!details.data) return <p className="text-sm text-muted-foreground">{m.loading}</p>
  const { board, workspace, sizes, embed, reports }: AdminBoardDetails = details.data
  return (
    <section aria-label={m.boardSection(board.title)} className="flex flex-col gap-3 rounded-md border p-4 text-sm">
      <h2 className="text-lg font-semibold">{board.title}</h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">{m.ownerLabel}</dt>
        <dd>{board.owner.name}</dd>
        {workspace && (
          <>
            <dt className="text-muted-foreground">{m.workspace}</dt>
            <dd>{workspace.name}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{m.linkAccessLabel}</dt>
        <dd>
          {linkAccess(board.linkAccess)}
          {board.sharingBlocked && m.blockedByAdmin}
        </dd>
        <dt className="text-muted-foreground">{m.embed}</dt>
        <dd>{embed ? <code className="break-all">{embed.path}</code> : m.embedOff}</dd>
        <dt className="text-muted-foreground">{m.size}</dt>
        <dd>
          {m.sizes(size(sizes.document), size(sizes.versions), sizes.versionCount, size(sizes.images), sizes.imageCount)}
        </dd>
        <dt className="text-muted-foreground">{m.created}</dt>
        <dd>{at(board.createdAt)}</dd>
        <dt className="text-muted-foreground">{m.updated}</dt>
        <dd>{at(board.updatedAt)}</dd>
        {board.deletedAt && (
          <>
            <dt className="text-muted-foreground">{m.inTrash}</dt>
            <dd>{m.since(at(board.deletedAt))}</dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {board.sharingBlocked ? (
          <Button type="button" size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate(unblockSharing)}>
            {m.unblockSharing}
          </Button>
        ) : (
          <ConfirmedAction
            label={m.blockSharing}
            title={m.blockSharingTitle}
            confirmLabel={m.blockSharingConfirm}
            variant="outline"
            disabled={act.isPending}
            onConfirm={() => act.mutate(blockSharing)}
          >
            {m.blockSharingText}
          </ConfirmedAction>
        )}
        {!board.deletedAt && (
          <ConfirmedAction
            label={m.trash}
            title={m.trashTitle}
            confirmLabel={m.trash}
            variant="outline"
            disabled={act.isPending}
            onConfirm={() => act.mutate(trashBoard)}
          >
            {m.trashText}
          </ConfirmedAction>
        )}
        {reports.length > 0 && (
          <Button type="button" size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate(resolveReportsOf)}>
            {m.resolveReports(reports.length)}
          </Button>
        )}
      </div>
      {act.isError && (
        <p role="alert" className="text-destructive">
          {m.actionFailed}
        </p>
      )}
      {reports.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label={m.boardReports}>
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
    <Loaded query={actions} empty={m.noActions}>
      {(items: AdminAction[]) => (
        <table className="w-full text-left text-sm" aria-label={m.journal}>
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">{m.when}</th>
              <th className="py-1 font-normal">{m.who}</th>
              <th className="py-1 font-normal">{m.what}</th>
              <th className="py-1 font-normal">{m.target}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((action) => (
              <tr key={action.id} className="border-t">
                <td className="py-1 pr-2 whitespace-nowrap">{at(action.createdAt)}</td>
                <td className="py-1 pr-2">{action.adminName}</td>
                <td className="py-1 pr-2">
                  {actionLabel(action.action)}
                  {action.details && ` (${action.details})`}
                </td>
                <td className="py-1">
                  {action.targetKind === 'user' ? m.targetUser(action.targetLabel) : m.targetBoard(action.targetLabel)}
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
