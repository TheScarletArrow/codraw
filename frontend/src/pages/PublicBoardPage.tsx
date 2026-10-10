import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { isNotFound } from '../api/http.ts'
import { fetchPublicBoard, fetchPublicDocument } from '../api/publicBoards.ts'
import { useCurrentUser } from '../auth/session.ts'
import { PageTabs } from '../board/PageTabs.tsx'
import { StatusBadges } from '../board/StatusBadges.tsx'
import { usePages } from '../board/usePages.ts'
import { DiagramCanvas } from '../diagram/DiagramCanvas.tsx'
import type { DiagramEditor } from '../diagram/editor.ts'
import { EditorToolbar } from '../diagram/EditorToolbar.tsx'

/** How often the page asks for a newer state of the board, in milliseconds; it asks when the tab is shown again too. */
export const PUBLIC_REFRESH_INTERVAL = 60_000

const noop = () => {}

/** The page is in a frame of another page, e.g. of a wiki: CoDraw opens in a new tab, not in the frame. */
const isFramed = () => window.top !== window.self

/** The address of the board in CoDraw, on its page `pageId`. */
function boardPath(boardId: string, pageId: string | null) {
  return `/boards/${encodeURIComponent(boardId)}${pageId ? `?page=${encodeURIComponent(pageId)}` : ''}`
}

/**
 * A board that its link shows to anybody, for reading without a sign-in: its pages on a read-only canvas with the scale
 * and the statuses of the elements, without a connection to collab, presence, comments or a guest. The page takes the
 * state of the board from time to time into one document, so the canvas keeps its scale and its page. A board that is
 * not shown without a sign-in opens as usual: for a signed-in user on its page, for anybody else after the login page.
 */
export function PublicBoardPage() {
  const { boardId = '' } = useParams()
  // Another board is another document, with nothing of the previous one.
  return <PublicBoard key={boardId} boardId={boardId} />
}

function PublicBoard({ boardId }: { boardId: string }) {
  const [params, setParams] = useSearchParams()
  const board = useQuery({ queryKey: ['public-boards', boardId], queryFn: () => fetchPublicBoard(boardId) })
  const [document] = useState(() => new Y.Doc())
  // Every state of the board merges into the one document of the page as it comes; the query keeps only its size, and
  // nothing once the page is gone, so that a page opened again loads the board into its new document.
  const state = useQuery({
    queryKey: ['public-boards', boardId, 'document'],
    queryFn: async () => {
      const update = await fetchPublicDocument(boardId)
      if (update.length > 0) Y.applyUpdate(document, update)
      return update.length
    },
    enabled: board.isSuccess,
    refetchInterval: PUBLIC_REFRESH_INTERVAL,
    gcTime: 0,
  })
  const merged = state.data !== undefined
  const user = useCurrentUser()
  const [framed] = useState(isFramed)
  const pages = usePages(document, false)
  const [editor, setEditor] = useState<DiagramEditor | null>(null)
  const currentPage = pages.find((page) => page.id === params.get('page')) ?? pages[0] ?? null
  const inCodraw = boardPath(boardId, currentPage?.id ?? params.get('page'))

  if (isNotFound(board.error)) {
    if (framed) {
      return (
        <PublicLayout action={<OpenInCodraw path={inCodraw} />}>
          <Message>Доска недоступна без входа</Message>
        </PublicLayout>
      )
    }
    if (user.isPending) return <Message>Загрузка…</Message>
    // A signed-in user gets what their role gives on the page of the board; Layout sends nobody without a session back.
    return user.data ? <Navigate to={inCodraw} replace /> : <Navigate to="/login" replace state={{ from: inCodraw }} />
  }

  const action = framed ? (
    <OpenInCodraw path={inCodraw} />
  ) : user.data ? (
    <Button asChild size="sm" variant="outline">
      <Link to={inCodraw}>Открыть доску</Link>
    </Button>
  ) : user.isError ? (
    <Button asChild size="sm">
      <Link to="/login" state={{ from: inCodraw }}>
        Войти
      </Link>
    </Button>
  ) : null

  return (
    <PublicLayout title={board.data?.title} action={action} editor={editor}>
      {!merged &&
        (board.isError || state.isError ? (
          <Message alert>Не удалось загрузить доску</Message>
        ) : (
          <Message>Загрузка…</Message>
        ))}
      {merged && (
        <>
          <div className="relative min-h-0 flex-1">
            {currentPage ? (
              <>
                <DiagramCanvas
                  document={document}
                  pageId={currentPage.id}
                  readOnly
                  collaboration={false}
                  onEditor={setEditor}
                />
                <StatusBadges editor={editor} document={document} />
              </>
            ) : (
              <Message>Доска пока пуста</Message>
            )}
          </div>
          <PageTabs
            pages={pages}
            currentPageId={currentPage?.id ?? null}
            onSelect={(id) =>
              setParams(
                (current) => {
                  current.set('page', id)
                  return current
                },
                { replace: true },
              )
            }
            onAdd={noop}
            onRename={noop}
            onDuplicate={noop}
            onDelete={noop}
            onMove={noop}
            readOnly
          />
        </>
      )}
    </PublicLayout>
  )
}

/** The page: the title of the board, «Только просмотр», the scale, and what the reader can do next. */
function PublicLayout({
  title,
  action,
  editor = null,
  children,
}: {
  title?: string
  action: ReactNode
  editor?: DiagramEditor | null
  children: ReactNode
}) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-x-3 border-b px-3 py-2">
        <span className="shrink-0 font-bold">CoDraw</span>
        {title && <h1 className="min-w-0 truncate font-medium">{title}</h1>}
        {title && (
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-sm whitespace-nowrap text-muted-foreground">
            Только просмотр
          </span>
        )}
        {title && <EditorToolbar editor={editor} readOnly collaboration={false} />}
        <span className="ml-auto shrink-0">{action}</span>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}

function OpenInCodraw({ path }: { path: string }) {
  return (
    <Button asChild size="sm" variant="outline">
      <a href={path} target="_blank" rel="noopener noreferrer">
        Открыть в CoDraw
      </a>
    </Button>
  )
}

function Message({ alert = false, children }: { alert?: boolean; children: ReactNode }) {
  return (
    <p role={alert ? 'alert' : undefined} className={alert ? 'p-6 text-destructive' : 'p-6 text-muted-foreground'}>
      {children}
    </p>
  )
}
