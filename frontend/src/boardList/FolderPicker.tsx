import { Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BoardFolder } from '../api/folders.ts'
import { byName, FOLDER_NAME_MAX_LENGTH, normalizeLabel, sameLabel } from './boardList.ts'
import { boardListMessages as m } from './messages.ts'

interface FolderPickerProps {
  /** The title of the board, which names the menu. */
  title: string
  folders: BoardFolder[]
  /** The folder the board is in; `null` for none. */
  current: string | null
  /** Puts the board into the folder, or with `null` into none. */
  onMove: (folderId: string | null) => void
  /** Creates a folder of that name and puts the board into it. */
  onCreate: (name: string) => void
  /** Why the latest change did not happen. */
  error?: string | null
  disabled?: boolean
}

/**
 * Where a board of the list is: «Без папки» or a folder of the user, and a field that creates a folder and puts the
 * board into it — or into the folder of that name, when the user has one.
 */
export function FolderPicker({ title, folders, current, onMove, onCreate, error, disabled = false }: FolderPickerProps) {
  const [name, setName] = useState('')
  const item = 'justify-between font-normal'
  const choice = (id: string | null, label: string) => (
    <Button
      key={id ?? ''}
      type="button"
      role="menuitemradio"
      aria-checked={current === id}
      variant="ghost"
      size="sm"
      className={item}
      disabled={disabled}
      onClick={() => onMove(id)}
    >
      <span className="truncate">{label}</span>
      {current === id && <Check aria-hidden />}
    </Button>
  )
  const create = () => {
    const wanted = normalizeLabel(name)
    if (!wanted) return
    const existing = folders.find((folder) => sameLabel(folder.name, wanted))
    if (existing) onMove(existing.id)
    else onCreate(wanted)
    setName('')
  }

  return (
    <div className="flex flex-col gap-1">
      <div role="menu" aria-label={m.boardFolder(title)} className="flex max-h-64 flex-col overflow-y-auto">
        {choice(null, m.unfiled)}
        {byName(folders).map((folder) => choice(folder.id, folder.name))}
      </div>
      <input
        aria-label={m.newFolder}
        value={name}
        maxLength={FOLDER_NAME_MAX_LENGTH}
        placeholder={m.newFolderPlaceholder}
        disabled={disabled}
        className="mx-1 mb-1 rounded border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          create()
        }}
      />
      {error && (
        <p role="alert" className="px-2 pb-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
