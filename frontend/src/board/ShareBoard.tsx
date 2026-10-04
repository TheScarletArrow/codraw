import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { setLinkAccess, type Board, type LinkAccess } from '../api/boards.ts'

const MODES: { value: LinkAccess; label: string; hint: string }[] = [
  { value: 'none', label: 'Только владелец', hint: 'По ссылке доску не открыть' },
  { value: 'view', label: 'Просмотр по ссылке', hint: 'Все, у кого есть ссылка, смотрят доску' },
  { value: 'edit', label: 'Редактирование по ссылке', hint: 'Все, у кого есть ссылка, редактируют доску' },
]

interface ShareBoardProps {
  board: Board
  /** Tells the participants that the access changed, so that collab checks it again. */
  onChanged: () => void
}

/** The link to the board and who opens it through the link; for the owner of the board. */
export function ShareBoard({ board, onChanged }: ShareBoardProps) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/boards/${board.id}`
  // The chosen mode shows at once, while the change is on its way.
  const [chosen, setChosen] = useState<LinkAccess | null>(null)
  const change = useMutation({
    mutationFn: (access: LinkAccess) => setLinkAccess(board.id, access),
    onSuccess: (changed) => {
      queryClient.setQueryData(['boards', board.id], changed)
      onChanged()
    },
    onSettled: () => setChosen(null),
  })
  const access = chosen ?? board.linkAccess

  return (
    <Popover onOpenChange={() => setCopied(false)}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0">
          <Share2 />
          Поделиться
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3" aria-label="Доступ к доске">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="board-link" className="text-sm font-medium">
            Ссылка на доску
          </label>
          <div className="flex gap-2">
            <input
              id="board-link"
              readOnly
              value={link}
              className="h-8 min-w-0 flex-1 rounded-md border bg-muted px-2 text-sm"
              onFocus={(event) => event.target.select()}
            />
            <Button
              type="button"
              size="sm"
              onClick={() =>
                navigator.clipboard.writeText(link).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }
            >
              Скопировать ссылку
            </Button>
          </div>
          <span role="status" className="text-xs text-muted-foreground">
            {copied ? 'Ссылка скопирована' : ''}
          </span>
        </div>
        <fieldset className="flex flex-col gap-2" disabled={change.isPending}>
          <legend className="mb-1 text-sm font-medium">Доступ по ссылке</legend>
          {MODES.map((mode) => (
            <label key={mode.value} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="link-access"
                value={mode.value}
                aria-label={mode.label}
                checked={access === mode.value}
                className="mt-0.5"
                onChange={() => {
                  setChosen(mode.value)
                  change.mutate(mode.value)
                }}
              />
              <span className="flex flex-col">
                {mode.label}
                <span className="text-xs text-muted-foreground">{mode.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {change.isError && (
          <p role="alert" className="text-sm text-destructive">
            Не удалось изменить доступ
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
