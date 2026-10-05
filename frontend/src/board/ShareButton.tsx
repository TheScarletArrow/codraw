import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { changeLinkAccess, type Board, type LinkAccess } from '../api/boards.ts'

/** How long «Скопировано» replaces «Копировать», in milliseconds. */
const COPIED_DURATION = 2_000

const LINK_ACCESS_OPTIONS: { value: LinkAccess; label: string; description: string }[] = [
  { value: 'none', label: 'Только я', description: 'По ссылке доску не откроет никто, кроме вас' },
  { value: 'view', label: 'Просмотр', description: 'По ссылке доску смотрят без правки' },
  { value: 'edit', label: 'Редактирование', description: 'По ссылке доску редактируют вместе с вами' },
]

/** What the link gives, as a participant who does not own the board sees it. */
const ACCESS_OF_OTHERS: Record<LinkAccess, string> = {
  none: 'Владелец закрыл доступ по ссылке',
  view: 'По ссылке доску можно только смотреть',
  edit: 'По ссылке доску можно редактировать',
}

/** Address of the board open on the page, as the address bar shows it. */
function boardLink(boardId: string, pageId: string | null, origin = window.location.origin) {
  const url = new URL(`/boards/${encodeURIComponent(boardId)}`, origin)
  if (pageId) url.searchParams.set('page', pageId)
  return url.toString()
}

interface ShareButtonProps {
  board: Board
  /** The page the participant is on: the link opens the board on it. */
  pageId: string | null
  /** Tells the other participants that the access to the board changed. */
  onChanged: () => void
}

/** «Поделиться»: the link to the board with a copy button and, for the owner, what the link gives to others. */
export function ShareButton({ board, pageId, onChanged }: ShareButtonProps) {
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  // The choice shows at once, before the request starts, so that the radio button does not jump back.
  const [chosen, setChosen] = useState<LinkAccess | null>(null)
  const link = boardLink(board.id, pageId)
  const change = useMutation({
    mutationFn: (linkAccess: LinkAccess) => changeLinkAccess(board.id, linkAccess),
    onSuccess: (changed) => {
      queryClient.setQueryData(['boards', board.id], changed)
      onChanged()
    },
    onSettled: () => setChosen(null),
  })

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), COPIED_DURATION)
    return () => clearTimeout(timeout)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // No clipboard, e.g. outside a secure context: the selected text is ready to be copied by hand.
      input.current?.select()
    }
  }

  const linkAccess = chosen ?? board.linkAccess
  return (
    <Popover onOpenChange={(open) => !open && setCopied(false)}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0">
          <Link2 />
          Поделиться
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3" aria-label="Поделиться доской">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="board-link" className="text-sm font-medium">
            Ссылка на доску
          </label>
          <div className="flex gap-2">
            <input
              ref={input}
              id="board-link"
              readOnly
              value={link}
              className="h-8 min-w-0 flex-1 rounded-md border bg-muted/50 px-2 text-sm"
              onFocus={(event) => event.target.select()}
            />
            <Button type="button" size="sm" className="w-28" onClick={() => void copy()}>
              {copied ? 'Скопировано' : 'Копировать'}
            </Button>
          </div>
        </div>
        {board.role === 'owner' ? (
          <fieldset className="flex flex-col gap-1" disabled={change.isPending}>
            <legend className="mb-1 text-sm font-medium">Доступ по ссылке</legend>
            {LINK_ACCESS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent',
                  linkAccess === option.value && 'bg-accent',
                )}
              >
                <input
                  type="radio"
                  name="link-access"
                  value={option.value}
                  checked={linkAccess === option.value}
                  aria-describedby={`link-access-${option.value}`}
                  className="mt-1"
                  onChange={() => {
                    setChosen(option.value)
                    change.mutate(option.value)
                  }}
                />
                <span className="flex flex-col">
                  <span className="text-sm">{option.label}</span>
                  <span id={`link-access-${option.value}`} className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
            {change.isError && (
              <p role="alert" className="text-sm text-destructive">
                Не удалось изменить доступ
              </p>
            )}
          </fieldset>
        ) : (
          <p className="text-sm text-muted-foreground">{ACCESS_OF_OTHERS[board.linkAccess]}</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
