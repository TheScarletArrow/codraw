import { useQueryClient } from '@tanstack/react-query'
import { ExternalLink, FileSymlink, LayoutDashboard, X } from 'lucide-react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { fetchBoard } from '../api/boards.ts'
import { isNotFound } from '../api/http.ts'
import type { DiagramEditor } from '../diagram/editor.ts'
import { parseLink } from '../diagram/links.ts'
import type { PageInfo } from '../diagram/pages.ts'
import { useLinkableBoards } from './boards.ts'
import { LINK_MESSAGE_DURATION, LINK_MESSAGES, linkTarget } from './linkTexts.ts'

/** The size of a badge and its gap from the corner, outside the resize handle of a selected shape. */
const BADGE_SIZE = 18
const BADGE_GAP = 4

const ICONS = { page: FileSymlink, board: LayoutDashboard, url: ExternalLink } as const

interface ShapeLinksProps {
  editor: DiagramEditor | null
  /** The pages of the board, which links to pages lead to. */
  pages: readonly PageInfo[]
  /** Opens a page of the board. */
  onSelectPage: (pageId: string) => void
  /** The participant leaves the page of the canvas for another one, e.g. to stop following. */
  onNavigate?: () => void
}

/**
 * The links of the elements of the page: a badge over the bottom-right corner of each element with a link, which tells
 * where the link leads and follows it, as Ctrl+click on the element does. A page opens on the board, a board in CoDraw
 * and an address in a new tab that knows nothing of the board; a link that leads nowhere says so over the canvas. Like
 * the badges of comments, it is a layer over the canvas, not cells of the diagram.
 */
export function ShapeLinks({ editor, pages, onSelectPage, onNavigate }: ShapeLinksProps) {
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const links = (editor?.getLinks() ?? []).flatMap(({ cellId, link }) => {
    const parsed = parseLink(link)
    return parsed ? [{ cellId, link, parsed }] : []
  })
  // Names of boards only for pages that link to boards.
  const { boards } = useLinkableBoards(links.some(({ parsed }) => parsed.kind === 'board'))

  const follow = useCallback(
    (value: string) => {
      setMessage(null)
      const link = parseLink(value)
      if (!link) {
        setMessage(LINK_MESSAGES.unsafe)
        return
      }
      if (link.kind === 'url') {
        // A new tab with neither `window.opener` nor the address of the board as the referrer.
        window.open(link.url, '_blank', 'noopener,noreferrer')
        return
      }
      if (link.kind === 'page') {
        if (!pages.some((page) => page.id === link.pageId)) {
          setMessage(LINK_MESSAGES.page)
          return
        }
        onNavigate?.()
        onSelectPage(link.pageId)
        return
      }
      // A board that is gone leaves the participant here; one they may not open shows how to ask for access.
      const path = `/boards/${encodeURIComponent(link.boardId)}${link.pageId ? `?page=${encodeURIComponent(link.pageId)}` : ''}`
      void queryClient.fetchQuery({ queryKey: ['boards', link.boardId], queryFn: () => fetchBoard(link.boardId) }).then(
        () => navigate(path),
        (error: unknown) => (isNotFound(error) ? setMessage(LINK_MESSAGES.board) : navigate(path)),
      )
    },
    [pages, onSelectPage, onNavigate, navigate, queryClient],
  )
  useEffect(() => editor?.onLinkOpen(({ link }) => follow(link)), [editor, follow])
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), LINK_MESSAGE_DURATION)
    return () => clearTimeout(timer)
  }, [message])

  if (!editor) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {links.map(({ cellId, link, parsed }) => {
        const bounds = editor.cellBounds(cellId)
        if (!bounds) return null
        const target = linkTarget(parsed, pages, boards)
        const Icon = ICONS[parsed.kind]
        return (
          <button
            key={cellId}
            type="button"
            data-testid="link-badge"
            data-cell={cellId}
            data-kind={parsed.kind}
            aria-label={`Перейти по ссылке: ${target}`}
            title={target}
            className="pointer-events-auto absolute flex items-center justify-center rounded-full bg-sky-600 text-white shadow-sm hover:bg-sky-500"
            style={{
              left: bounds.x + bounds.width + BADGE_GAP,
              top: bounds.y + bounds.height + BADGE_GAP,
              width: BADGE_SIZE,
              height: BADGE_SIZE,
            }}
            onClick={() => follow(link)}
          >
            <Icon aria-hidden className="size-3" />
          </button>
        )
      })}
      <div aria-live="polite" className="absolute inset-x-0 bottom-3 flex justify-center px-3">
        {message && (
          <p
            role="alert"
            className="pointer-events-auto flex items-center gap-1 rounded-md border bg-background py-1 pr-1 pl-3 text-sm text-foreground shadow-md"
          >
            {message}
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть" onClick={() => setMessage(null)}>
              <X />
            </Button>
          </p>
        )}
      </div>
    </div>
  )
}

const noSubscription = () => () => {}
