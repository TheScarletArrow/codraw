import { Client } from '@maxgraph/core'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { sameMatch, searchCanvas, stepMatch, type CanvasMatch } from '../diagram/canvasSearch.ts'
import type { DiagramEditor } from '../diagram/editor.ts'
import type { PageInfo } from '../diagram/pages.ts'
import { isModLetter } from '../lib/keyboard.ts'

/** The shortest time between two searches of a board that others change: a drag gives dozens of changes a second. */
const MATCHES_INTERVAL_MS = 150

const NO_MATCHES: CanvasMatch[] = []

const pluralRules = new Intl.PluralRules('ru')

/** «3 совпадения»: how many matches there are while none of them is the current one. */
function matchCount(count: number): string {
  const words: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'совпадение', few: 'совпадения', many: 'совпадений' }
  return `${count} ${words[pluralRules.select(count)] ?? 'совпадения'}`
}

interface CanvasSearchProps {
  document: Y.Doc
  /** The pages of the board in their order. */
  pages: PageInfo[]
  /** The page on the canvas. */
  pageId: string
  /** The editor of the canvas; `null` while the canvas of a page is being made. */
  editor: DiagramEditor | null
  /** Opens a page of the board, as its tab does. */
  onSelectPage: (id: string) => void
  /** The search is about to move the canvas to a match, on one's own: e.g. following another participant ends. */
  onNavigate?: () => void
  isMac?: boolean
}

/** Going to a match: a new one for every move, so that the latest one is shown. */
interface Going {
  match: CanvasMatch
}

/**
 * The search of texts on all pages of the board over the canvas, which `Ctrl+F` (`Cmd+F` on macOS) opens anywhere on
 * the page instead of the find of the browser: «N из M», Enter and Shift+Enter go to the next and the previous match
 * around, on its page, selected in the middle of the canvas; Escape gives the keyboard back to the canvas.
 */
export function CanvasSearch({
  document,
  pages,
  pageId,
  editor,
  onSelectPage,
  onNavigate,
  isMac = Client.IS_MAC,
}: CanvasSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // The current match is an element, and its number follows the changes of the board.
  const [current, setCurrent] = useState<CanvasMatch | null>(null)
  const [going, setGoing] = useState<Going | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const { matches, find } = useMatches(document, query, open)
  const index = current ? matches.findIndex((match) => sameMatch(match, current)) : -1
  const pageIds = pages.map((page) => page.id)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isModLetter(event, 'f', isMac)) return
      event.preventDefault()
      flushSync(() => setOpen(true))
      input.current?.focus()
      input.current?.select()
    }
    window.document.addEventListener('keydown', handleKey)
    return () => window.document.removeEventListener('keydown', handleKey)
  }, [isMac])

  // A page asked for and not shown yet: the next move asks for its own page again, so that the latest one wins even
  // before the canvas has the page of the one before.
  const askedPage = useRef<string | null>(null)
  const goTo = (match: CanvasMatch) => {
    onNavigate?.()
    setCurrent(match)
    setGoing({ match })
    if (match.pageId !== pageId || askedPage.current !== null) {
      askedPage.current = match.pageId
      onSelectPage(match.pageId)
    }
  }
  // The match is shown once the canvas has its page: selected, in the middle of the canvas.
  const shown = useRef<Going | null>(null)
  useEffect(() => {
    if (!going || shown.current === going || !editor || editor.pageId !== going.match.pageId || pageId !== going.match.pageId) {
      return
    }
    shown.current = going
    askedPage.current = null
    editor.revealCell(going.match.cellId)
  }, [going, editor, pageId])

  if (!open) return null

  /** A new query keeps the current match while it matches; otherwise the first match on this page or after it. */
  const search = (text: string) => {
    setQuery(text)
    const found = find(text)
    if (current && found.some((match) => sameMatch(match, current))) return
    const first = found[stepMatch(found, -1, 1, pageIds, pageId)]
    if (first) goTo(first)
    else setCurrent(null)
  }
  const step = (direction: 1 | -1) => {
    const next = matches[stepMatch(matches, index, direction, pageIds, pageId)]
    if (next) goTo(next)
  }
  const close = () => {
    setOpen(false)
    setCurrent(null)
    editor?.focus()
  }

  const status = !query.trim()
    ? ''
    : matches.length === 0
      ? 'Нет совпадений'
      : index >= 0
        ? `${index + 1} из ${matches.length}`
        : matchCount(matches.length)

  return (
    <div
      role="search"
      aria-label="Поиск на доске"
      className="absolute top-2 right-6 z-20 flex items-center gap-1 rounded-md border bg-background p-1 shadow-md"
    >
      <label className="relative flex items-center">
        <Search aria-hidden className="pointer-events-none absolute left-2 size-4 text-muted-foreground" />
        <input
          ref={input}
          type="search"
          aria-label="Найти на доске"
          placeholder="Найти на доске"
          className="h-8 w-52 rounded-md border bg-background pr-2 pl-8 text-sm [&::-webkit-search-cancel-button]:hidden"
          value={query}
          onChange={(event) => search(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              step(event.shiftKey ? -1 : 1)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              close()
            }
          }}
        />
      </label>
      <span aria-live="polite" className="min-w-28 px-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {status}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Предыдущее совпадение"
        title="Предыдущее совпадение (Shift+Enter)"
        disabled={matches.length === 0}
        onClick={() => step(-1)}
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Следующее совпадение"
        title="Следующее совпадение (Enter)"
        disabled={matches.length === 0}
        onClick={() => step(1)}
      >
        <ChevronDown />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть поиск" title="Закрыть поиск (Esc)" onClick={close}>
        <X />
      </Button>
    </div>
  )
}

/**
 * The matches of `query` on the board, searched again after changes of the board while `live`, at most every
 * {@link MATCHES_INTERVAL_MS}; and `find`, which searches another query at once, sharing the last search with them.
 */
function useMatches(document: Y.Doc, query: string, live: boolean) {
  // Changes of the board seen so far; a search made before the last of them is out of date.
  const revision = useRef(0)
  const last = useRef<{ document: Y.Doc; query: string; revision: number; matches: CanvasMatch[] } | null>(null)
  const find = useCallback(
    (text: string) => {
      const cached = last.current
      if (cached?.document === document && cached.query === text && cached.revision === revision.current) return cached.matches
      const matches = searchCanvas(document, text)
      last.current = { document, query: text, revision: revision.current, matches }
      return matches
    },
    [document],
  )
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!live) return () => {}
      let timer: ReturnType<typeof setTimeout> | undefined
      const changed = () => {
        timer = undefined
        revision.current++
        onChange()
      }
      const schedule = () => {
        timer ??= setTimeout(changed, MATCHES_INTERVAL_MS)
      }
      document.on('update', schedule)
      return () => {
        clearTimeout(timer)
        document.off('update', schedule)
        // The board may change while the search is closed: it is searched again when it opens.
        revision.current++
      }
    },
    [document, live],
  )
  const matches = useSyncExternalStore(subscribe, () => (live ? find(query) : NO_MATCHES))
  return { matches, find }
}
