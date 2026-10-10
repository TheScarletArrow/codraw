import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { downloadMyData } from '../account/exportArchive.ts'
import type { CurrentUser } from '../api/auth.ts'
import {
  deleteAccount,
  DELETION_PREVIEW_KEY,
  fetchDeletionPreview,
  type BoardDecision,
  type DeletionPreview,
  type SharedBoard,
} from '../api/account.ts'
import { HttpError, isTooManyRequests } from '../api/http.ts'
import { useCurrentUser } from '../auth/session.ts'
import { deleteLocalCopiesOf } from '../offline/localCopies.ts'
import { accountMessages as m } from './AccountPage.messages.ts'

const inputClass =
  'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

/** State that the login page gets after the deletion, to say so. */
const ACCOUNT_DELETED_STATE = { accountDeleted: true }

/**
 * «Учётная запись»: the user downloads all their data in an archive, or deletes their account for good, deciding what
 * becomes of the boards that others work on.
 */
export function AccountPage() {
  const user = useCurrentUser()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 overflow-y-auto p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{m.title}</h1>
        <p className="text-sm text-muted-foreground">{m.intro}</p>
      </div>
      <ExportSection />
      {user.data && <DeletionSection user={user.data} />}
    </div>
  )
}

function ExportSection() {
  const id = useId()
  const download = useMutation({ mutationFn: downloadMyData })

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 id={id} className="font-semibold">
        {m.myData}
      </h2>
      <p className="text-sm text-muted-foreground">
        {m.archive}
      </p>
      <div>
        <Button type="button" variant="outline" onClick={() => download.mutate()} disabled={download.isPending}>
          {download.isPending ? m.building : m.download}
        </Button>
      </div>
      {download.isError && (
        <p role="alert" className="text-sm text-destructive">
          {isTooManyRequests(download.error) ? m.tooManyDownloads : m.downloadFailed}
        </p>
      )}
    </section>
  )
}

/** A decision chosen in the form: `transfer:<id of the member>` or `delete`; empty while there is none. */
type Choice = string

function decisionOf(boardId: string, choice: Choice): BoardDecision | null {
  if (choice === 'delete') return { boardId, action: 'delete' }
  if (choice.startsWith('transfer:')) return { boardId, action: 'transfer', newOwnerId: choice.slice('transfer:'.length) }
  return null
}

function DeletionSection({ user }: { user: CurrentUser }) {
  const id = useId()
  const preview = useQuery({ queryKey: DELETION_PREVIEW_KEY, queryFn: fetchDeletionPreview })

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4">
      <h2 id={id} className="font-semibold">
        {m.deletion}
      </h2>
      <p className="text-sm text-muted-foreground">
        {m.deletionText(!user.guest)}
      </p>
      {!user.guest && (
        <p className="text-sm text-muted-foreground">
          {m.githubToken}
        </p>
      )}
      {preview.isPending && <p className="text-sm text-muted-foreground">{m.loading}</p>}
      {preview.isError && (
        <p role="alert" className="text-sm text-destructive">
          {m.previewFailed}
        </p>
      )}
      {preview.data && <DeletionForm user={user} preview={preview.data} />}
    </section>
  )
}

function DeletionForm({ user, preview }: { user: CurrentUser; preview: DeletionPreview }) {
  const confirmationId = useId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [confirmation, setConfirmation] = useState('')
  const decisions = preview.sharedBoards.map((board) => decisionOf(board.id, choices[board.id] ?? ''))
  const decided = decisions.every((decision) => decision !== null)
  const blocked = preview.blockingWorkspaces.length > 0
  const remove = useMutation({
    mutationFn: () => deleteAccount(decisions.filter((decision) => decision !== null)),
    onSuccess: async () => {
      await navigate('/login', { replace: true, state: ACCOUNT_DELETED_STATE })
      // Nothing of the deleted user stays in the cache, nor in the browser.
      queryClient.clear()
      await deleteLocalCopiesOf(user.id)
    },
    // Something changed meanwhile, e.g. somebody joined a board: the page shows what to decide now.
    onError: () => void queryClient.invalidateQueries({ queryKey: DELETION_PREVIEW_KEY }),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (decided && !blocked && confirmation.trim().toLowerCase() === m.confirmationWord) remove.mutate()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm">
        {preview.deletedBoards > 0 ? m.deletedBoards(preview.deletedBoards) : m.noDeletedBoards}
      </p>
      {blocked && (
        <div role="alert" className="flex flex-col gap-1 text-sm text-destructive">
          <p>{m.blockingWorkspaces}</p>
          <ul className="list-disc pl-5">
            {preview.blockingWorkspaces.map((workspace) => (
              <li key={workspace.id}>
                <Link to={`/workspaces/${encodeURIComponent(workspace.id)}`} className="underline">
                  {workspace.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.sharedBoards.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{m.sharedBoards}</p>
          {preview.sharedBoards.map((board) => (
            <SharedBoardChoice
              key={board.id}
              board={board}
              choice={choices[board.id] ?? ''}
              onChoose={(choice) => setChoices((current) => ({ ...current, [board.id]: choice }))}
            />
          ))}
        </div>
      )}
      <label htmlFor={confirmationId} className="text-sm">
        {m.confirm(m.confirmationWord)}
      </label>
      <input
        id={confirmationId}
        className={inputClass}
        value={confirmation}
        autoComplete="off"
        onChange={(event) => setConfirmation(event.target.value)}
      />
      <div>
        <Button
          type="submit"
          className="bg-destructive text-white hover:bg-destructive/90"
          disabled={!decided || blocked || confirmation.trim().toLowerCase() !== m.confirmationWord || remove.isPending}
        >
          {m.deleteAccount}
        </Button>
      </div>
      {remove.isError && (
        <p role="alert" className="text-sm text-destructive">
          {deletionErrorMessage(remove.error)}
        </p>
      )}
    </form>
  )
}

function SharedBoardChoice({ board, choice, onChoose }: { board: SharedBoard; choice: Choice; onChoose: (choice: Choice) => void }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1 rounded-md border p-2">
      <label htmlFor={id} className="text-sm font-medium">
        {board.title}
      </label>
      <select id={id} className={inputClass} value={choice} onChange={(event) => onChoose(event.target.value)}>
        <option value="">{m.choose}</option>
        {board.members.map((member) => (
          <option key={member.id} value={`transfer:${member.id}`}>
            {m.transfer(member.name)}
          </option>
        ))}
        <option value="delete">{m.deleteBoard}</option>
      </select>
      {board.members.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {m.visitorsOnly(board.visitors)}
        </p>
      )}
    </div>
  )
}

function deletionErrorMessage(error: unknown): string {
  if (error instanceof HttpError && error.status === 409) {
    if (error.problem?.limit !== undefined) {
      return m.ownerLimit(error.problem.limit)
    }
    return m.changed
  }
  return m.deletionFailed
}
