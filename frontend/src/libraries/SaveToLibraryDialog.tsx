import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { COMPONENT_NAME_MAX_LENGTH, LIBRARY_NAME_MAX_LENGTH } from '../api/libraries.ts'
import type { ContextMenuRequest, DiagramEditor } from '../diagram/editor.ts'
import type { LibraryShelf } from './useLibraries.ts'

/** The choice of the window that makes a new library. */
const NEW_LIBRARY = ''

/** The name a new library gets unless the user writes another. */
export const DEFAULT_LIBRARY_NAME = 'Мои фигуры'

/**
 * «Сохранить в библиотеку» at the point of the click of the menu: the name of the component, the name of the selected
 * shape at first, and its library — one of the user, or a new one. «Сохранить» saves the selection as the editor has it
 * then; the window stays with the reason when that fails.
 */
export function SaveToLibraryDialog({
  editor,
  shelf,
  request,
  onClose,
}: {
  editor: DiagramEditor
  shelf: LibraryShelf
  request: ContextMenuRequest
  onClose: () => void
}) {
  const libraries = shelf.libraries
  const [name, setName] = useState(() => editor.selectionComponent()?.name ?? 'Компонент')
  const [choice, setChoice] = useState(() => libraries?.[0]?.id ?? NEW_LIBRARY)
  const [newName, setNewName] = useState(DEFAULT_LIBRARY_NAME)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // The libraries may come after the window opens: the first one is chosen then, unless the user chose meanwhile.
  const chosen = useRef(false)
  useEffect(() => {
    if (!chosen.current && libraries?.[0]) setChoice(libraries[0].id)
  }, [libraries])
  const nameId = useId()
  const libraryId = useId()
  const newNameId = useId()
  const close = () => {
    onClose()
    editor.focus()
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const target = choice === NEW_LIBRARY ? { newLibrary: newName.trim() } : { libraryId: choice }
    const failure = await shelf.saveSelection(editor, target, name)
    setSaving(false)
    if (failure) setError(failure)
    else close()
  }
  const ready = name.trim() !== '' && (choice !== NEW_LIBRARY || newName.trim() !== '')

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <div aria-hidden className="pointer-events-none absolute size-0" style={{ left: request.x, top: request.y }} />
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={2}
        aria-label="Сохранить в библиотеку"
        className="w-80 max-w-[calc(100vw-2rem)]"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <form className="flex flex-col gap-2" onSubmit={(event) => void save(event)}>
          <h2 className="text-sm font-semibold">Сохранить в библиотеку</h2>
          <label htmlFor={nameId} className="text-xs text-muted-foreground">
            Название
          </label>
          <input
            id={nameId}
            autoFocus
            value={name}
            maxLength={COMPONENT_NAME_MAX_LENGTH}
            className="h-8 rounded-md border bg-background px-2 text-sm"
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.target.select()}
          />
          <label htmlFor={libraryId} className="text-xs text-muted-foreground">
            Библиотека
          </label>
          <select
            id={libraryId}
            value={choice}
            className="h-8 rounded-md border bg-background px-1 text-sm"
            onChange={(event) => {
              chosen.current = true
              setChoice(event.target.value)
            }}
          >
            {(libraries ?? []).map((library) => (
              <option key={library.id} value={library.id}>
                {library.name}
              </option>
            ))}
            <option value={NEW_LIBRARY}>Новая библиотека…</option>
          </select>
          {choice === NEW_LIBRARY && (
            <>
              <label htmlFor={newNameId} className="text-xs text-muted-foreground">
                Название библиотеки
              </label>
              <input
                id={newNameId}
                value={newName}
                maxLength={LIBRARY_NAME_MAX_LENGTH}
                className="h-8 rounded-md border bg-background px-2 text-sm"
                onChange={(event) => setNewName(event.target.value)}
              />
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              Отмена
            </Button>
            <Button type="submit" size="sm" disabled={saving || !ready}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
