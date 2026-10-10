import { useId, useState, type FormEvent, type ReactNode } from 'react'
import type * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import type { ContextMenuRequest, DiagramEditor, MergeCandidate } from '../diagram/editor.ts'
import { kindLabel } from '../diagram/elementProps.ts'
import { elementPlaces } from '../diagram/sharedElements.ts'
import { pagesLabel } from './elementList.ts'
import { elementsMessages as m } from './messages.ts'

/** A window at the point of the click of the menu that asked for it. */
function MenuWindow({
  request,
  label,
  onClose,
  children,
}: {
  request: ContextMenuRequest
  label: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <div aria-hidden className="pointer-events-none absolute size-0" style={{ left: request.x, top: request.y }} />
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={2}
        aria-label={label}
        className="w-80 max-w-[calc(100vw-2rem)]"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

const candidateDetails = (candidate: MergeCandidate) =>
  [
    candidate.properties.kind ? kindLabel(candidate.properties.kind) : '',
    candidate.properties.technology,
    pagesLabel(candidate.pages),
  ]
    .filter(Boolean)
    .join(' · ')

/**
 * «Объединить в один элемент»: the elements of the selected shapes, to choose whose properties stay; the first is chosen.
 * «Объединить» merges them in the editor.
 */
export function MergeElementsDialog({
  editor,
  request,
  onClose,
}: {
  editor: DiagramEditor
  request: ContextMenuRequest
  onClose: () => void
}) {
  // Taken once: the choice is about the selection the menu was opened for.
  const [candidates] = useState(() => editor.mergeCandidates())
  const [kept, setKept] = useState(candidates[0]?.cellId ?? '')
  const name = useId()
  const merge = (event: FormEvent) => {
    event.preventDefault()
    if (kept) editor.mergeElements(kept)
    onClose()
    editor.focus()
  }
  return (
    <MenuWindow request={request} label={m.merge} onClose={onClose}>
      <form className="flex flex-col gap-2" onSubmit={merge}>
        <h2 className="text-sm font-semibold">{m.merge}</h2>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs text-muted-foreground">
            {m.mergeHint}
          </legend>
          {candidates.map((candidate) => (
            <label key={candidate.cellId} className="flex items-start gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
              <input
                type="radio"
                name={name}
                className="mt-1"
                checked={kept === candidate.cellId}
                onChange={() => setKept(candidate.cellId)}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{candidate.properties.name || m.unnamed}</span>
                <span className="truncate text-xs text-muted-foreground">{candidateDetails(candidate)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {m.cancel}
          </Button>
          <Button type="submit" size="sm" disabled={candidates.length < 2}>
            {m.mergeSubmit}
          </Button>
        </div>
      </form>
    </MenuWindow>
  )
}

/**
 * «Удалить со всех страниц»: the pages that lose the cells of the element of the shape of the menu and how many on each,
 * and the locked cells that stay. «Удалить» removes them in the editor.
 */
export function DeleteElementDialog({
  editor,
  document,
  request,
  onClose,
}: {
  editor: DiagramEditor
  document: Y.Doc
  request: ContextMenuRequest
  onClose: () => void
}) {
  const [element] = useState(() => editor.selectedElement())
  const places = element?.elementId ? elementPlaces(document, element.elementId) : []
  const removed = places.filter((place) => place.cellIds.length > place.locked.length)
  const locked = places.filter((place) => place.locked.length > 0)
  const remove = () => {
    if (element) editor.deleteElementEverywhere(element.cellId)
    onClose()
    editor.focus()
  }
  return (
    <MenuWindow request={request} label={m.deleteEverywhere} onClose={onClose}>
      <div role="alertdialog" aria-label={m.deleteEverywhere} className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{m.deleteEverywhereQuestion(element?.properties.name || m.elementWord)}</h2>
        <p className="text-sm text-muted-foreground">{m.deleteEverywhereHint}</p>
        <ul aria-label={m.pages} className="flex flex-col text-sm">
          {removed.map((place) => (
            <li key={place.pageId}>
              {place.pageName} — {place.cellIds.length - place.locked.length}
            </li>
          ))}
        </ul>
        {locked.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {m.lockedStay(locked.map((place) => place.pageName).join(', '))}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {m.cancel}
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={removed.length === 0}
            onClick={remove}
          >
            {m.delete}
          </Button>
        </div>
      </div>
    </MenuWindow>
  )
}
