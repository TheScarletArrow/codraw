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

const inputClass =
  'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

/** The word that confirms the deletion: a name of a guest or of GitHub is awkward to type, a word is not. */
const CONFIRMATION_WORD = 'удалить'

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
        <h1 className="text-xl font-semibold">Учётная запись</h1>
        <p className="text-sm text-muted-foreground">Ваши данные в CoDraw: скачайте их или удалите учётную запись.</p>
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
        Мои данные
      </h2>
      <p className="text-sm text-muted-foreground">
        Архив ZIP: профиль, ваши доски в формате draw.io с изображениями, комментарии, реакции, решения, предложения,
        библиотеки фигур, шаблоны, папки и теги, участие в досках и пространствах, настройки уведомлений — в JSON.
      </p>
      <div>
        <Button type="button" variant="outline" onClick={() => download.mutate()} disabled={download.isPending}>
          {download.isPending ? 'Собираем архив…' : 'Скачать мои данные'}
        </Button>
      </div>
      {download.isError && (
        <p role="alert" className="text-sm text-destructive">
          {isTooManyRequests(download.error)
            ? 'Слишком много выгрузок за сутки. Попробуйте позже.'
            : 'Не удалось собрать архив. Попробуйте ещё раз.'}
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
        Удаление учётной записи
      </h2>
      <p className="text-sm text-muted-foreground">
        Удаление необратимо. Удаляются профиль, ваши доски без других участников и доски в корзине с изображениями,
        участие в досках и пространствах, библиотеки фигур, шаблоны, папки, теги, уведомления и их настройки
        {user.guest ? '' : ', подключение GitHub'}. Ваши комментарии, решения и правки на досках других людей остаются
        с подписью «Удалённый пользователь». Все сеансы завершаются.
      </p>
      {!user.guest && (
        <p className="text-sm text-muted-foreground">
          Токен GitHub CoDraw удалит у себя; отозвать его можно в настройках GitHub.
        </p>
      )}
      {preview.isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {preview.isError && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось узнать, что станет с вашими досками
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
    if (decided && !blocked && confirmation.trim().toLowerCase() === CONFIRMATION_WORD) remove.mutate()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm">
        {preview.deletedBoards > 0
          ? `Удалятся досок без других участников и из корзины: ${preview.deletedBoards}.`
          : 'Досок без других участников у вас нет.'}
      </p>
      {blocked && (
        <div role="alert" className="flex flex-col gap-1 text-sm text-destructive">
          <p>Вы единственный владелец пространств, где есть другие участники. Сначала передайте роль владельца:</p>
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
          <p className="text-sm">С этими досками работают другие люди. Решите, что с ними будет:</p>
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
        Чтобы подтвердить, введите слово «{CONFIRMATION_WORD}»
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
          disabled={!decided || blocked || confirmation.trim().toLowerCase() !== CONFIRMATION_WORD || remove.isPending}
        >
          Удалить учётную запись
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
        <option value="">Выберите…</option>
        {board.members.map((member) => (
          <option key={member.id} value={`transfer:${member.id}`}>
            {`Передать: ${member.name}`}
          </option>
        ))}
        <option value="delete">Удалить доску</option>
      </select>
      {board.members.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Доску открывали по ссылке ({board.visitors}). Передать её можно только участнику: добавьте человека в
          участники в окне «Поделиться».
        </p>
      )}
    </div>
  )
}

function deletionErrorMessage(error: unknown): string {
  if (error instanceof HttpError && error.status === 409) {
    if (error.problem?.limit !== undefined) {
      return `У нового владельца уже ${error.problem.limit} досок — больше нельзя. Выберите другого участника или удалите доску.`
    }
    return 'Пока вы решали, что-то изменилось. Проверьте доски и пространства ещё раз.'
  }
  return 'Не удалось удалить учётную запись. Попробуйте ещё раз.'
}
