import { Ellipsis, FolderPlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { BoardFolder } from '../api/folders.ts'
import { TitleInput } from '../board/TitleInput.tsx'
import { byName, FOLDER_NAME_MAX_LENGTH, type FolderFilter } from './boardList.ts'

interface FolderBarProps {
  folders: BoardFolder[]
  selected: FolderFilter
  onSelect: (folder: FolderFilter) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  /** Called once the user has confirmed the deletion. */
  onDelete: (id: string) => void
  /** Why the latest change of folders did not happen. */
  error?: string | null
}

const chip = (pressed: boolean) =>
  cn('h-8 max-w-48 rounded-full px-3 font-normal', pressed && 'border-primary bg-primary/10 text-foreground')

/**
 * The folders of the user over the list of boards: «Все доски», «Без папки» and each folder choose the boards the list
 * shows, a menu renames or deletes the chosen folder, and «Новая папка» creates one. Folders wrap onto more lines on a
 * narrow screen.
 */
export function FolderBar({ folders, selected, onSelect, onCreate, onRename, onDelete, error }: FolderBarProps) {
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const chosen = selected.kind === 'folder' ? folders.find((folder) => folder.id === selected.id) : undefined
  const option = (filter: FolderFilter, label: string, key: string) => {
    const pressed =
      filter.kind === selected.kind && (filter.kind !== 'folder' || (selected.kind === 'folder' && filter.id === selected.id))
    return (
      <Button
        key={key}
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={pressed}
        className={chip(pressed)}
        onClick={() => onSelect(filter)}
      >
        <span className="truncate">{label}</span>
      </Button>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div role="group" aria-label="Папки" className="flex flex-wrap items-center gap-2">
        {folders.length > 0 && (
          <>
            {option({ kind: 'all' }, 'Все доски', 'all')}
            {option({ kind: 'unfiled' }, 'Без папки', 'unfiled')}
            {byName(folders).map((folder) =>
              renaming && chosen?.id === folder.id ? (
                <TitleInput
                  key={folder.id}
                  title={folder.name}
                  label="Название папки"
                  maxLength={FOLDER_NAME_MAX_LENGTH}
                  className="h-8 w-48 px-2"
                  onDone={(name) => {
                    setRenaming(false)
                    if (name !== null) onRename(folder.id, name)
                  }}
                />
              ) : (
                option({ kind: 'folder', id: folder.id }, folder.name, folder.id)
              ),
            )}
          </>
        )}
        {chosen && !renaming && (
          <FolderMenu name={chosen.name} onRename={() => setRenaming(true)} onDelete={() => onDelete(chosen.id)} />
        )}
        {creating ? (
          <TitleInput
            title=""
            label="Новая папка"
            placeholder="Название папки"
            maxLength={FOLDER_NAME_MAX_LENGTH}
            className="h-8 w-48 px-2"
            onDone={(name) => {
              setCreating(false)
              if (name !== null) onCreate(name)
            }}
          />
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(true)}>
            <FolderPlus />
            Новая папка
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** Menu of the chosen folder: renaming it, and deleting it after a confirmation that its boards stay. */
function FolderMenu({ name, onRename, onDelete }: { name: string; onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const item = 'justify-start font-normal'

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setConfirming(false)
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Меню папки «${name}»`} title="Действия с папкой">
          <Ellipsis />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1" onCloseAutoFocus={(event) => event.preventDefault()}>
        {confirming ? (
          <div role="alertdialog" aria-label="Удаление папки" className="flex flex-col gap-2 p-2">
            <p className="text-sm">Удалить папку «{name}»? Доски из неё останутся в списке без папки.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Отмена
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => {
                  setOpen(false)
                  onDelete()
                }}
              >
                Удалить
              </Button>
            </div>
          </div>
        ) : (
          <div role="menu" aria-label={`Папка «${name}»`} className="flex flex-col">
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              size="sm"
              className={item}
              onClick={() => {
                setOpen(false)
                onRename()
              }}
            >
              Переименовать папку
            </Button>
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              size="sm"
              className={cn(item, 'text-destructive hover:text-destructive')}
              onClick={() => setConfirming(true)}
            >
              Удалить папку
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
