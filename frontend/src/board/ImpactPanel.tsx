import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DiagramEditor } from '../diagram/editor.ts'
import { boardImpact, cellName, type BoardImpactItem, type ImpactDepth, type ImpactPlace } from '../diagram/impact.ts'
import { IMPACT_COLORS, type ImpactRole } from '../diagram/impactView.ts'
import { useEditorState } from '../diagram/useEditorState.ts'

const pluralRules = new Intl.PluralRules('ru')

/** `3 шага`, `5 шагов`. */
function steps(count: number): string {
  const words: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'шаг', few: 'шага', many: 'шагов' }
  return `${count} ${words[pluralRules.select(count)] ?? 'шага'}`
}

const DEPTHS: readonly { value: ImpactDepth; label: string }[] = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 'all', label: 'Все' },
]

/** A key of a color of the canvas. */
function Swatch({ role }: { role: ImpactRole }) {
  return <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: IMPACT_COLORS[role] }} />
}

/** A field that is being typed in keeps Escape for itself. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/**
 * The impact analysis of the canvas (see `impact.ts`), at the right of the canvas while it is on: what the element
 * depends on and what depends on it on all pages of the board — each with the pages whose edges tell it, which open
 * the page at its cell and go on with the analysis there when the element is on it — and the depth of the analysis; or
 * the shortest path between two elements. The cross and Escape end it.
 */
export function ImpactPanel({
  editor,
  document,
  onShow,
}: {
  editor: DiagramEditor | null
  document: Y.Doc | null
  /** Opens the page and selects the cell on it. */
  onShow: (pageId: string, cellId: string) => void
}) {
  const { impact } = useEditorState(editor)
  // The analysis taken to the page that is opening: it starts once the canvas has that page.
  const carried = useRef<{ pageId: string; cellId: string; depth: ImpactDepth } | null>(null)
  useEffect(() => {
    const carry = carried.current
    if (!editor || !carry || editor.pageId !== carry.pageId) return
    carried.current = null
    editor.showDependencies(carry.cellId, carry.depth)
  }, [editor])
  useEffect(() => {
    if (!impact || !editor) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || typing(event.target)) return
      editor.clearImpact()
    }
    window.document.addEventListener('keydown', handleKey)
    return () => window.document.removeEventListener('keydown', handleKey)
  }, [impact, editor])
  if (!editor || !document || !impact) return null

  const close = (
    <Button type="button" variant="ghost" size="icon-sm" aria-label="Закончить анализ" title="Закончить анализ (Esc)" onClick={() => editor.clearImpact()}>
      <X />
    </Button>
  )

  if (impact.mode === 'path') {
    const from = cellName(document, editor.pageId, impact.from)
    const to = cellName(document, editor.pageId, impact.to)
    return (
      <aside aria-label="Путь между" className="pointer-events-auto flex w-[320px] max-w-full flex-col rounded-md border bg-background text-foreground shadow-lg">
        <header className="flex items-center gap-1 border-b px-3 py-2">
          <h2 className="mr-auto text-sm font-semibold">{`Путь «${from}» → «${to}»`}</h2>
          {close}
        </header>
        <p className="flex items-center gap-2 p-3 text-sm">
          {impact.steps === null ? (
            'Пути между ними нет'
          ) : (
            <>
              <Swatch role="path" />
              {impact.directed ? steps(impact.steps) : `${steps(impact.steps)}, связи на пути идут в разные стороны`}
            </>
          )}
        </p>
      </aside>
    )
  }

  const board = boardImpact(document, editor.pageId, impact.cellId, impact.depth)
  if (!board) return null
  const show = (place: ImpactPlace) => {
    // The element analysed is on that page too: the analysis goes on there.
    const focus = board.places.find((item) => item.pageId === place.pageId)
    carried.current = place.pageId !== editor.pageId && focus ? { pageId: place.pageId, cellId: focus.cellId, depth: impact.depth } : null
    onShow(place.pageId, place.cellId)
  }

  return (
    <aside
      aria-label="Зависимости"
      className="pointer-events-auto flex min-h-0 w-[320px] max-w-full flex-col overflow-hidden rounded-md border bg-background text-foreground shadow-lg"
    >
      <header className="flex items-center gap-1 border-b px-3 py-2">
        <h2 className="mr-auto min-w-0 truncate text-sm font-semibold">{`Зависимости «${board.name}»`}</h2>
        {close}
      </header>
      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        <div role="radiogroup" aria-label="Шаги" className="flex items-center gap-1 text-sm">
          <span className="mr-1 text-xs text-muted-foreground">Шаги</span>
          {DEPTHS.map(({ value, label }) => (
            <Button
              key={label}
              type="button"
              role="radio"
              aria-checked={impact.depth === value}
              variant="ghost"
              size="xs"
              className={cn(impact.depth === value && 'bg-accent text-accent-foreground')}
              onClick={() => editor.showDependencies(impact.cellId, value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <ItemList title="Зависит от" role="dependency" items={board.dependencies} onShow={show} />
        <ItemList title="Зависят от него" role="dependent" items={board.dependents} onShow={show} />
      </div>
    </aside>
  )
}

function ItemList({
  title,
  role,
  items,
  onShow,
}: {
  title: string
  role: ImpactRole
  items: BoardImpactItem[]
  onShow: (place: ImpactPlace) => void
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Swatch role={role} />
        {`${title} (${items.length})`}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ничего</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.key} className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
              <span className="font-medium">{item.name}</span>
              {item.depth > 1 && <span className="text-xs text-muted-foreground">{`шаг ${item.depth}`}</span>}
              {item.places.map((place) => (
                <Button
                  key={place.pageId}
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto px-0"
                  title={`Открыть «${item.name}» на странице «${place.pageName}»`}
                  onClick={() => onShow(place)}
                >
                  {`стр. «${place.pageName}»`}
                </Button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
