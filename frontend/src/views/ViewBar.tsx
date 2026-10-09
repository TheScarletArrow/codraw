import { EyeOff, LayoutGrid, ScanEye, SlidersHorizontal } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import type * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DiagramEditor } from '../diagram/editor.ts'
import { viewOf } from '../diagram/modelViews.ts'
import { sliceLabel, viewTitle } from '../diagram/viewRule.ts'
import { elementName, hiddenLabel, modelStore } from './modelStore.ts'

/**
 * The bar over the canvas of a page that is a view of the model: what it shows and its slice, and for who edits the
 * board what is hidden on it with a way to bring it back, the window of its rule and the layout of the page. Nothing for a
 * page that is no view; a page shows it for its views only, so that other pages do not read the model after every change.
 */
export function ViewBar({
  document,
  pageId,
  editor,
  readOnly,
  onEditRule,
}: {
  document: Y.Doc | null
  pageId: string
  editor: DiagramEditor | null
  readOnly: boolean
  onEditRule: () => void
}) {
  if (!document) return null
  return <Bar document={document} pageId={pageId} editor={editor} readOnly={readOnly} onEditRule={onEditRule} />
}

function Bar({
  document,
  pageId,
  editor,
  readOnly,
  onEditRule,
}: {
  document: Y.Doc
  pageId: string
  editor: DiagramEditor | null
  readOnly: boolean
  onEditRule: () => void
}) {
  const store = modelStore(document)
  // A new model with every change of the board: the rule of the page is read with it.
  const model = useSyncExternalStore(store.subscribe, store.get)
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const view = viewOf(document, pageId)
  if (!view) return null
  const scope = view.rule.scope !== null ? model.elements.get(view.rule.scope) : undefined
  const missing = view.rule.scope !== null && !scope
  const title = viewTitle(view.rule, scope ? elementName(scope) : '')
  const slice = sliceLabel(view.rule)
  const hidden = view.hidden.flatMap((key) => {
    const label = hiddenLabel(model, key)
    return label === null ? [] : [{ key, label }]
  })
  const canChange = !readOnly && editor !== null && editor.pageId === pageId

  return (
    <div
      role="region"
      aria-label="Представление"
      className="absolute top-2 left-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-sm shadow-sm"
    >
      <ScanEye aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground">Представление: </span>
        <span className="font-medium">{missing ? 'элемента больше нет в модели' : title}</span>
        {slice && <span className="text-muted-foreground"> · {slice}</span>}
      </span>
      {canChange && hidden.length > 0 && (
        <Popover open={hiddenOpen} onOpenChange={setHiddenOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2" title="Скрытое на этом представлении">
              <EyeOff aria-hidden />
              Скрыто: {hidden.length}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" aria-label="Скрытое на представлении" className="flex w-72 flex-col gap-1 p-2">
            <ul aria-label="Скрытое" className="flex max-h-64 flex-col overflow-y-auto">
              {hidden.map(({ key, label }) => (
                <li key={key} className="flex items-center gap-2 py-0.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    aria-label={`Вернуть ${label}`}
                    onClick={() => {
                      editor.showOnView([key])
                      if (hidden.length === 1) setHiddenOpen(false)
                    }}
                  >
                    Вернуть
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                editor.showOnView('all')
                setHiddenOpen(false)
              }}
            >
              Вернуть всё
            </Button>
          </PopoverContent>
        </Popover>
      )}
      {canChange && (
        <>
          <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2" onClick={onEditRule}>
            <SlidersHorizontal aria-hidden />
            Правило…
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2"
            title="Разложить страницу автораскладкой"
            onClick={() => void editor.autoLayout('right')}
          >
            <LayoutGrid aria-hidden />
            Разложить
          </Button>
        </>
      )}
    </div>
  )
}
