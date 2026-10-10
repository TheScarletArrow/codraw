import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ContextMenuRequest, DiagramEditor } from '../diagram/editor.ts'
import { addressLink, boardLink, pageLink, parseLink } from '../diagram/links.ts'
import type { PageInfo } from '../diagram/pages.ts'
import { useEditorState } from '../diagram/useEditorState.ts'
import { useLinkableBoards } from './boards.ts'
import { linkMessages as m } from './messages.ts'

/** Where a link of the window leads. */
type LinkKind = 'page' | 'board' | 'url'

interface Choice {
  kind: LinkKind
  pageId: string
  boardId: string
  address: string
}

/**
 * What the window shows first: the link of the element, or without one the first page after the current one, or the
 * address on a board of one page.
 */
function initialChoice(value: string | null, pages: readonly PageInfo[], currentPageId: string): Choice {
  const index = pages.findIndex((page) => page.id === currentPageId)
  const next = pages.length > 1 ? (pages[(index + 1) % pages.length] ?? pages[0]!) : null
  const none: Choice = { kind: next ? 'page' : 'url', pageId: next?.id ?? pages[0]?.id ?? '', boardId: '', address: '' }
  const link = parseLink(value)
  switch (link?.kind) {
    case 'page':
      return { ...none, kind: 'page', pageId: pages.some((page) => page.id === link.pageId) ? link.pageId : none.pageId }
    case 'board':
      return { ...none, kind: 'board', boardId: link.boardId, address: link.url }
    case 'url':
      return { ...none, kind: 'url', address: link.url }
    default:
      return none
  }
}

interface LinkDialogProps {
  editor: DiagramEditor
  /** The right click whose menu opened the window: its point and its element. */
  request: ContextMenuRequest
  /** The pages of the board. */
  pages: readonly PageInfo[]
  currentPageId: string
  /** The board of the page, which is left out of the boards to choose: its pages are the first choice. */
  boardId: string
  onClose: () => void
}

/**
 * The window «Ссылка» of the element of a right click, at the point of the click: a page of this board, another board of
 * the user or an address, or no link. Saving sets the link of the selected element as one undo step; the editor refuses
 * a link that CoDraw would not open, and so does the window, with a message.
 */
export function LinkDialog({ editor, request, pages, currentPageId, boardId, onClose }: LinkDialogProps) {
  const { link: selection } = useEditorState(editor)
  // The link the element had when the window opened.
  const [current] = useState(() => (selection?.cellId === request.cellId ? selection.link : null))
  const [initial] = useState(() => initialChoice(current, pages, currentPageId))
  const [kind, setKind] = useState<LinkKind>(initial.kind)
  const [pageId, setPageId] = useState(initial.pageId)
  const [chosenBoard, setChosenBoard] = useState(initial.boardId)
  const [address, setAddress] = useState(initial.address)
  const [error, setError] = useState<string | null>(null)
  const { boards, failed } = useLinkableBoards(true)
  const others = boards?.filter((board) => board.id !== boardId)
  // The field of the kind, which takes the keyboard when the window opens and when what is chosen is not taken.
  const control = useRef<HTMLInputElement & HTMLSelectElement>(null)
  const errorId = useId()
  const kindName = useId()

  const close = () => {
    onClose()
    editor.focus()
  }
  const choose = (next: LinkKind) => {
    setKind(next)
    setError(null)
  }
  const linkOfChoice = (): string | { error: string } => {
    if (kind === 'page') return pageId ? pageLink(pageId) : { error: m.errors.page }
    if (kind === 'board') {
      if (!chosenBoard) return { error: m.errors.board }
      // The same board keeps its link, with the page it may lead to.
      return chosenBoard === initial.boardId && current ? current : boardLink(chosenBoard)
    }
    if (!address.trim()) return { error: m.errors.empty }
    return addressLink(address) ?? { error: m.errors.address }
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    const link = linkOfChoice()
    if (typeof link !== 'string') {
      setError(link.error)
      control.current?.focus()
      return
    }
    if (link !== current) editor.setLink(link)
    close()
  }
  const remove = () => {
    editor.setLink(null)
    close()
  }

  const choice = (value: LinkKind, label: string, field: ReactNode) => (
    <div className={cn('flex flex-col gap-1.5 rounded-md px-2 py-1.5', kind === value && 'bg-accent')}>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="radio" name={kindName} value={value} checked={kind === value} onChange={() => choose(value)} />
        {label}
      </label>
      {kind === value && field}
    </div>
  )
  const fieldClass = 'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground'
  const described = error ? errorId : undefined

  return (
    <Popover open onOpenChange={(open) => !open && close()}>
      <PopoverAnchor asChild>
        <div aria-hidden className="pointer-events-none absolute size-0" style={{ left: request.x, top: request.y }} />
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={2}
        aria-label={m.link}
        className="w-80 max-w-[calc(100vw-2rem)]"
        onOpenAutoFocus={(event) => {
          if (!control.current) return
          event.preventDefault()
          control.current.focus()
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <form className="flex flex-col gap-2" noValidate onSubmit={save}>
          <h2 className="text-sm font-semibold">{m.link}</h2>
          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">{m.whereTo}</legend>
            {choice(
              'page',
              m.pageOfThisBoard,
              <select
                ref={kind === 'page' ? control : undefined}
                aria-label={m.page}
                aria-describedby={described}
                className={fieldClass}
                value={pageId}
                onChange={(event) => setPageId(event.target.value)}
              >
                {pages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.id === currentPageId ? m.currentPage(page.name) : page.name}
                  </option>
                ))}
              </select>,
            )}
            {choice(
              'board',
              m.otherBoard,
              failed ? (
                <p className="text-sm text-muted-foreground">{m.boardsFailed}</p>
              ) : !others ? (
                <p className="text-sm text-muted-foreground">{m.loadingBoards}</p>
              ) : others.length === 0 && !chosenBoard ? (
                <p className="text-sm text-muted-foreground">{m.noOtherBoards}</p>
              ) : (
                <select
                  ref={kind === 'board' ? control : undefined}
                  aria-label={m.board}
                  aria-describedby={described}
                  className={fieldClass}
                  value={chosenBoard}
                  onChange={(event) => setChosenBoard(event.target.value)}
                >
                  {!chosenBoard && <option value="">{m.chooseBoard}</option>}
                  {chosenBoard && !others.some((board) => board.id === chosenBoard) && (
                    <option value={chosenBoard}>{m.linkedBoard}</option>
                  )}
                  {others.map((board) => (
                    <option key={board.id} value={board.id}>
                      {board.owner ? `${board.title} — ${board.owner}` : board.title}
                    </option>
                  ))}
                </select>
              ),
            )}
            {choice(
              'url',
              m.address,
              <input
                ref={kind === 'url' ? control : undefined}
                type="text"
                inputMode="url"
                aria-label={m.address}
                aria-describedby={described}
                aria-invalid={error !== null && kind === 'url'}
                placeholder="https://…"
                className={fieldClass}
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value)
                  setError(null)
                }}
              />,
            )}
          </fieldset>
          {error && (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {current && (
              <Button type="button" variant="ghost" size="sm" onClick={remove}>
                {m.removeLink}
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={close}>
                {m.cancel}
              </Button>
              <Button type="submit" size="sm">
                {m.save}
              </Button>
            </div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
