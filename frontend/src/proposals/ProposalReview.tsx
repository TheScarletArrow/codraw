import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { isNotFound } from '../api/http.ts'
import {
  acceptProposal,
  declineProposal,
  fetchProposal,
  fetchProposalBase,
  PROPOSAL_TEXT_MAX_LENGTH,
  withdrawProposal,
  type Proposal,
} from '../api/proposals.ts'
import { countConflicts } from '../board/changes.ts'
import { ConfirmedAction } from '../board/ConfirmedAction.tsx'
import { useBoardDiff } from '../board/useBoardDiff.ts'
import { VersionView } from '../board/VersionView.tsx'
import { versionsKey } from '../board/versions.ts'
import { snapshotDocument } from '../diagram/diff.ts'
import { mergeConflicts, mergeProposal } from '../diagram/merge.ts'
import { timeAgo } from '../notifications/notifications.ts'
import { draftPath, isOpen, proposalBaseKey, proposalKey, proposalsKey, STATUS_LABELS } from './proposals.ts'
import { useDraftConnection } from './useDraftConnection.ts'

interface ProposalReviewProps {
  boardId: string
  proposalId: string
  /** The current user: the author of a proposal edits and withdraws it. */
  userId: string
  /** The live board document, which accepting the proposal merges it into. */
  document: Y.Doc
  /** The user reviews the proposals of the board: its owner or an editor, who accept and decline them. */
  reviewer: boolean
  /**
   * The board is synced with collab over a connection that may edit it. Accepting keeps the board as a version first
   * and changes it for everybody, which needs the state of the board with the changes of the others.
   */
  synced: boolean
  /** The proposal is accepted and merged into the board; `pageId` is the first page it changed that the board has. */
  onAccepted: (pageId: string | null) => void
  /** The proposal was decided or withdrawn here: the other participants of the board fetch the proposals again. */
  onChanged: () => void
  onClose: () => void
}

/**
 * A proposal of changes in place of the board, for viewing only: its draft with what it changes since its base, as the
 * comparison of a version shows the board, and the elements that the board changed too since the base marked in the
 * list. Reviewers accept it, merging it into the board, or decline it; its author edits its draft or withdraws it.
 */
export function ProposalReview({
  boardId,
  proposalId,
  userId,
  document,
  reviewer,
  synced,
  onAccepted,
  onChanged,
  onClose,
}: ProposalReviewProps) {
  const queryClient = useQueryClient()
  const proposal = useQuery({ queryKey: proposalKey(boardId, proposalId), queryFn: () => fetchProposal(boardId, proposalId) })
  const base = useQuery({
    queryKey: proposalBaseKey(boardId, proposalId),
    queryFn: () => fetchProposalBase(boardId, proposalId),
    staleTime: Infinity,
  })
  // A plain document without a provider: nothing to destroy, it goes away with the review.
  const baseDocument = useMemo(() => {
    if (!base.data) return null
    const doc = new Y.Doc()
    if (base.data.length > 0) Y.applyUpdate(doc, base.data)
    return doc
  }, [base.data])
  // The draft as collab has it, so that the reviewer sees what its author changes meanwhile.
  const draft = useDraftConnection(boardId, proposalId)
  const draftDocument = draft.document
  const proposed = useBoardDiff(baseDocument, draftDocument)
  const changedOnBoard = useBoardDiff(baseDocument, document)
  const conflicts = useMemo(
    () => (proposed && changedOnBoard ? mergeConflicts(proposed, changedOnBoard) : undefined),
    [proposed, changedOnBoard],
  )
  const conflictCount = proposed && conflicts ? countConflicts(proposed, conflicts) : 0

  const decided = (next: Proposal) => {
    queryClient.setQueryData(proposalKey(boardId, proposalId), next)
    draft.notifyProposalsChanged()
    onChanged()
    return queryClient.invalidateQueries({ queryKey: proposalsKey(boardId) })
  }
  const accept = useMutation({
    mutationFn: async ({ base, draft }: { base: Y.Doc; draft: Y.Doc }) => {
      // What the reviewer sees now is what the board gets, whatever comes later.
      const from = snapshotDocument(base)
      const to = snapshotDocument(draft)
      // The board is kept as a version and the proposal closed first: if that fails, the board stays as it is.
      const accepted = await acceptProposal(boardId, proposalId, Y.encodeStateAsUpdate(document))
      mergeProposal(document, from, to)
      return accepted
    },
    onSuccess: async (accepted) => {
      const pages = new Set(snapshotDocument(document).keys())
      const shown = proposed?.pages.find((page) => page.type !== 'removed' && pages.has(page.id))
      await Promise.all([decided(accepted), queryClient.invalidateQueries({ queryKey: versionsKey(boardId), exact: true })])
      onAccepted(shown?.id ?? null)
    },
  })
  const decline = useMutation({
    mutationFn: (comment: string) => declineProposal(boardId, proposalId, comment.trim()),
    onSuccess: decided,
  })
  const withdraw = useMutation({ mutationFn: () => withdrawProposal(boardId, proposalId), onSuccess: decided })
  const unsyncedHint = useId()

  if (isNotFound(proposal.error)) return <Shell title="Предложение" onClose={onClose} message="Предложение не найдено" />
  if (proposal.isError) return <Shell title="Предложение" onClose={onClose} message="Не удалось загрузить предложение" alert />
  if (!proposal.data) return <Shell title="Предложение" onClose={onClose} message="Загрузка предложения…" />

  const { title, description, author, createdAt, comment } = proposal.data
  const open = isOpen(proposal.data)
  const mine = author.id === userId
  const failed = accept.isError || decline.isError || withdraw.isError
  return (
    <section aria-label={`Предложение «${title}»`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/50 px-3 py-2 text-sm">
        <span className="font-medium">Предложение «{title}»</span>
        <span className="text-muted-foreground">
          {author.name} · <time dateTime={createdAt}>{timeAgo(createdAt)}</time>
        </span>
        {!open && <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">{decision(proposal.data)}</span>}
        <span className="flex-1" />
        {failed && (
          <span role="alert" className="text-destructive">
            {accept.isError
              ? 'Не удалось принять предложение'
              : decline.isError
                ? 'Не удалось отклонить предложение'
                : 'Не удалось отозвать предложение'}
          </span>
        )}
        <Button asChild variant="outline" size="sm">
          <Link to={draftPath(boardId, proposalId)}>{mine && open ? 'Править черновик' : 'Открыть черновик'}</Link>
        </Button>
        {open && mine && (
          <ConfirmedAction
            label="Отозвать"
            title="Отзыв предложения"
            confirmLabel="Отозвать"
            variant="outline"
            disabled={withdraw.isPending}
            onConfirm={() => withdraw.mutate()}
          >
            Предложение закроется, а его черновик останется только для просмотра.
          </ConfirmedAction>
        )}
        {open && reviewer && (
          <>
            {!synced && (
              <span id={unsyncedHint} className="text-muted-foreground">
                Принять можно после синхронизации
              </span>
            )}
            <DeclineButton disabled={decline.isPending} onDecline={(text) => decline.mutate(text)} />
            <ConfirmedAction
              label="Принять"
              title="Принятие предложения"
              confirmLabel="Принять"
              disabled={!synced || !baseDocument || !draftDocument || accept.isPending}
              describedBy={synced ? undefined : unsyncedHint}
              onConfirm={() => baseDocument && draftDocument && accept.mutate({ base: baseDocument, draft: draftDocument })}
            >
              Изменения предложения появятся на доске у всех участников.{' '}
              {conflictCount > 0
                ? `Где доску после предложения тоже изменили (${conflictCount}), останется вариант предложения.`
                : 'Где доску после предложения тоже изменили, останется вариант предложения.'}{' '}
              Текущее состояние доски сохранится в истории версий.
            </ConfirmedAction>
          </>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>
      {(description || comment) && (
        <div className="flex flex-col gap-1 border-b px-3 py-2 text-sm whitespace-pre-wrap">
          {description && <p>{description}</p>}
          {comment && <p className="text-muted-foreground">Комментарий: {comment}</p>}
        </div>
      )}
      {base.isError || draft.status === 'not-found' || draft.status === 'forbidden' ? (
        <p role="alert" className="p-6 text-destructive">
          Не удалось загрузить черновик
        </p>
      ) : baseDocument && draftDocument ? (
        <VersionView
          version={baseDocument}
          board={draftDocument}
          unchanged="В черновике пока нет изменений."
          participantId={userId}
          conflicts={conflicts}
        />
      ) : (
        <p className="p-6 text-muted-foreground">Загрузка черновика…</p>
      )}
    </section>
  )
}

/** What became of a closed proposal and who decided: «Принято: Алиса, 5 минут назад». */
function decision({ status, decidedBy, decidedAt }: Proposal): string {
  const who = decidedBy?.name ?? 'Удалённый пользователь'
  return `${STATUS_LABELS[status]}: ${who}${decidedAt ? `, ${timeAgo(decidedAt)}` : ''}`
}

/** «Отклонить» with a comment to the author, if any. */
function DeclineButton({ disabled, onDecline }: { disabled: boolean; onDecline: (comment: string) => void }) {
  const [open, setOpen] = useState(false)
  const [comment, setComment] = useState('')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          Отклонить
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1" onCloseAutoFocus={(event) => event.preventDefault()}>
        <form
          aria-label="Отклонение предложения"
          className="flex flex-col gap-2 p-2"
          onSubmit={(event) => {
            event.preventDefault()
            setOpen(false)
            onDecline(comment)
          }}
        >
          <textarea
            aria-label="Комментарий автору"
            placeholder="Почему, если нужно"
            value={comment}
            maxLength={PROPOSAL_TEXT_MAX_LENGTH}
            rows={3}
            className="resize-y rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onChange={(event) => setComment(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" size="sm">
              Отклонить
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/** The review without a proposal to show: why, and how to close it. */
function Shell({ title, message, alert = false, onClose }: { title: string; message: string; alert?: boolean; onClose: () => void }) {
  return (
    <section aria-label={title} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2 text-sm">
        <span className="flex-1 font-medium">{title}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>
      <p role={alert ? 'alert' : undefined} className={alert ? 'p-6 text-destructive' : 'p-6 text-muted-foreground'}>
        {message}
      </p>
    </section>
  )
}
