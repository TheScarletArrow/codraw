import { useMutation } from '@tanstack/react-query'
import { GitPullRequestArrow, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  createProposal,
  PROPOSAL_TEXT_MAX_LENGTH,
  PROPOSAL_TITLE_MAX_LENGTH,
  proposalLimitOf,
  type Proposal,
} from '../api/proposals.ts'
import { timeAgo } from '../notifications/notifications.ts'
import { isOpen, STATUS_LABELS } from './proposals.ts'

interface ProposalsPanelProps {
  boardId: string
  /** The proposals of the board that the user sees, newest first. */
  proposals: Proposal[] | undefined
  failed: boolean
  selectedId: string | null
  onSelect: (proposal: Proposal) => void
  /** A proposal was made: its author goes to its draft. */
  onCreated: (proposal: Proposal) => void
  onClose: () => void
}

/**
 * The proposals of changes of a board: «Предложить изменения» for whoever has a role on it, then the open proposals and
 * the closed ones. A proposal opens in its review in place of the board.
 */
export function ProposalsPanel({ boardId, proposals, failed, selectedId, onSelect, onCreated, onClose }: ProposalsPanelProps) {
  const [composing, setComposing] = useState(false)
  const open = proposals?.filter(isOpen) ?? []
  const closed = proposals?.filter((proposal) => !isOpen(proposal)) ?? []

  return (
    <aside aria-label="Предложения" className="flex w-72 shrink-0 flex-col border-l bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <GitPullRequestArrow className="size-4 text-muted-foreground" />
        <h3 className="flex-1 text-sm font-semibold">Предложения</h3>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть предложения" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="border-b p-3">
        {composing ? (
          <ProposalForm
            boardId={boardId}
            onCreated={(proposal) => {
              setComposing(false)
              onCreated(proposal)
            }}
            onCancel={() => setComposing(false)}
          />
        ) : (
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setComposing(true)}>
            Предложить изменения
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {!proposals && !failed && <p className="p-2 text-sm text-muted-foreground">Загрузка…</p>}
        {failed && (
          <p role="alert" className="p-2 text-sm text-destructive">
            Не удалось загрузить предложения
          </p>
        )}
        {proposals?.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">
            Предложений пока нет. Правки предложения делаются в черновике и попадают на доску, когда их примут владелец
            или редактор.
          </p>
        )}
        {open.length > 0 && <ProposalList name="Открытые" proposals={open} selectedId={selectedId} onSelect={onSelect} />}
        {closed.length > 0 && <ProposalList name="Закрытые" proposals={closed} selectedId={selectedId} onSelect={onSelect} />}
      </div>
    </aside>
  )
}

function ProposalList({
  name,
  proposals,
  selectedId,
  onSelect,
}: {
  name: string
  proposals: Proposal[]
  selectedId: string | null
  onSelect: (proposal: Proposal) => void
}) {
  return (
    <section aria-label={name} className="mb-2 flex flex-col last:mb-0">
      <h4 className="px-2 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">{name}</h4>
      <ul className="flex flex-col">
        {proposals.map((proposal) => (
          <li key={proposal.id}>
            <button
              type="button"
              aria-pressed={proposal.id === selectedId}
              className={cn(
                'flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-accent',
                proposal.id === selectedId && 'bg-accent',
              )}
              onClick={() => onSelect(proposal)}
            >
              <span className="truncate text-sm font-medium">{proposal.title}</span>{' '}
              <span className="text-xs text-muted-foreground">
                {proposal.author.name} · <time dateTime={proposal.createdAt}>{timeAgo(proposal.createdAt)}</time>
                {!isOpen(proposal) && ` · ${STATUS_LABELS[proposal.status]}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The title and the description of a new proposal; creating it opens its draft. */
function ProposalForm({
  boardId,
  onCreated,
  onCancel,
}: {
  boardId: string
  onCreated: (proposal: Proposal) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const create = useMutation({
    mutationFn: () => createProposal(boardId, title.trim(), description.trim()),
    onSuccess: onCreated,
  })
  const limit = proposalLimitOf(create.error)

  return (
    <form
      aria-label="Новое предложение"
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (title.trim()) create.mutate()
      }}
    >
      <input
        aria-label="Название предложения"
        placeholder="Что вы предлагаете"
        value={title}
        maxLength={PROPOSAL_TITLE_MAX_LENGTH}
        autoFocus
        className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onChange={(event) => setTitle(event.target.value)}
      />
      <textarea
        aria-label="Описание предложения"
        placeholder="Зачем, если нужно"
        value={description}
        maxLength={PROPOSAL_TEXT_MAX_LENGTH}
        rows={3}
        className="resize-y rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onChange={(event) => setDescription(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        Правки в черновике не попадают на доску, пока их не примут владелец или редактор.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" size="sm" disabled={!title.trim() || create.isPending}>
          Создать
        </Button>
      </div>
      {create.isError && (
        <p role="alert" className="text-sm text-destructive">
          {limit?.scope === 'author'
            ? `Больше открытых предложений на этой доске нельзя: у вас их уже ${limit.limit}`
            : limit
              ? `Больше открытых предложений на доске нельзя: их уже ${limit.limit}`
              : 'Не удалось создать предложение'}
        </p>
      )}
    </form>
  )
}
