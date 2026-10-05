import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { deleteBoard, renameBoard, type Board } from '../api/boards.ts'
import { BoardActions } from './BoardActions.tsx'
import { TitleInput } from './TitleInput.tsx'

interface BoardHeadingProps {
  board: Board
  /** Tells the other participants that the board was renamed or deleted. */
  onChanged: () => void
  /** Opens the versions of the board. */
  onOpenHistory?: () => void
}

/** Title of the board; its owner renames it with a click and deletes it from the menu of the board. */
export function BoardHeading({ board, onChanged, onOpenHistory }: BoardHeadingProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [renaming, setRenaming] = useState(false)
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
      await queryClient.invalidateQueries({ queryKey: ['boards'], exact: true })
    },
  })

  if (board.role !== 'owner') return <h2 className="max-w-64 shrink-0 truncate font-semibold">{board.title}</h2>

  const title = rename.isPending ? rename.variables : board.title
  return (
    <div className="flex max-w-72 shrink-0 items-center gap-1">
      {renaming ? (
        <TitleInput
          title={board.title}
          label="Название доски"
          className="w-64 font-semibold"
          onDone={(next) => {
            setRenaming(false)
            if (next !== null) rename.mutate(next)
          }}
        />
      ) : (
        <h2 className="min-w-0 font-semibold">
          <button
            type="button"
            title="Переименовать доску"
            className="max-w-full truncate rounded px-1 text-left hover:bg-accent"
            onClick={() => setRenaming(true)}
          >
            {title}
          </button>
        </h2>
      )}
      <BoardActions
        title={board.title}
        deleteLabel="Удалить доску"
        disabled={remove.isPending}
        onRename={() => setRenaming(true)}
        onHistory={onOpenHistory}
        onDelete={() => remove.mutate()}
      />
      {(rename.isError || remove.isError) && (
        <span role="alert" className="text-sm whitespace-nowrap text-destructive">
          {rename.isError ? 'Не удалось переименовать' : 'Не удалось удалить'}
        </span>
      )}
    </div>
  )
}
