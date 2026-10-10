import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { canManageVersions, deleteBoard, renameBoard, type Board } from '../api/boards.ts'
import { useBoardNotifications } from '../notifications/useBoardNotifications.ts'
import { deleteLocalCopiesOfBoard } from '../offline/localCopies.ts'
import { BoardActions } from './BoardActions.tsx'
import { useCopyBoard } from './copyBoard.ts'
import { TitleInput } from './TitleInput.tsx'
import { boardMessages as m } from './board.messages.ts'

interface BoardHeadingProps {
  board: Board
  /** Tells the other participants that the board was renamed or deleted. */
  onChanged: () => void
  /** Opens the versions of the board. */
  onOpenHistory?: () => void
}

/**
 * Title of the board; its owner renames it with a click and deletes it from the menu of the board, anybody copies it
 * there, whoever edits it opens its versions from that menu, and whoever has an email or a chat for notifications turns those of the board off
 * and on there.
 */
export function BoardHeading({ board, onChanged, onOpenHistory }: BoardHeadingProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [renaming, setRenaming] = useState(false)
  const notifications = useBoardNotifications(board.id)
  const copy = useCopyBoard(board.id)
  const rename = useMutation({
    mutationFn: (title: string) => renameBoard(board.id, title),
    onSuccess: (renamed) => {
      queryClient.setQueryData(['boards', board.id], renamed)
      onChanged()
      return queryClient.invalidateQueries({ queryKey: ['boards'], exact: true })
    },
  })
  const remove = useMutation({
    mutationFn: () => deleteBoard(board.id),
    onSuccess: async () => {
      // Before leaving: the connection that carries the message closes with the page.
      onChanged()
      await navigate('/', { replace: true })
      queryClient.removeQueries({ queryKey: ['boards', board.id], exact: true })
      // Once the page has closed its local copy: a deleted board does not stay in the browser.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['boards'], exact: true }),
        deleteLocalCopiesOfBoard(board.id),
      ])
    },
  })

  if (board.role !== 'owner') {
    const heading = <h2 className="max-w-64 min-w-24 truncate font-semibold">{board.title}</h2>
    const onHistory = canManageVersions(board) ? onOpenHistory : undefined
    return (
      <div className="flex max-w-72 min-w-0 items-center gap-1">
        {heading}
        <BoardActions
          title={board.title}
          disabled={copy.pending}
          onCopy={copy.copy}
          onHistory={onHistory}
          notifications={notifications}
        />
        {copy.error && (
          <span role="alert" className="text-sm whitespace-nowrap text-destructive">
            {copy.error}
          </span>
        )}
      </div>
    )
  }

  const title = rename.isPending ? rename.variables : board.title
  return (
    // A long title shortens before the tools of the line lose their room.
    <div className="flex max-w-72 min-w-0 items-center gap-1">
      {renaming ? (
        <TitleInput
          title={board.title}
          label={m.boardTitle}
          className="w-64 font-semibold"
          onDone={(next) => {
            setRenaming(false)
            if (next !== null) rename.mutate(next)
          }}
        />
      ) : (
        <h2 className="min-w-24 font-semibold">
          <button
            type="button"
            title={m.renameBoard}
            className="max-w-full truncate rounded px-1 text-left hover:bg-accent"
            onClick={() => setRenaming(true)}
          >
            {title}
          </button>
        </h2>
      )}
      <BoardActions
        title={board.title}
        deleteLabel={m.deleteBoard}
        disabled={remove.isPending || copy.pending}
        onRename={() => setRenaming(true)}
        onCopy={copy.copy}
        onHistory={onOpenHistory}
        onDelete={() => remove.mutate()}
        notifications={notifications}
      />
      {(rename.isError || remove.isError || copy.error) && (
        <span role="alert" className="text-sm whitespace-nowrap text-destructive">
          {rename.isError ? m.renameFailed : remove.isError ? m.deleteFailed : copy.error}
        </span>
      )}
    </div>
  )
}
