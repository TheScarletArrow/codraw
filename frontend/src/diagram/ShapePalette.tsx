import { ChevronDown, Search } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { DiagramEditor } from './editor.ts'
import { ShapeIcon } from './ShapeIcon.tsx'
import { searchShapes } from './shapeSearch.ts'
import { SHAPE_DRAG_TYPE, SHAPE_SECTIONS, type ShapePreset } from './shapes.ts'

/** Shapes that can be dragged onto the canvas or added to the middle of the view with a click, and a search for them. */
export function ShapePalette({ editor }: { editor: DiagramEditor | null }) {
  const [query, setQuery] = useState('')
  const searching = query.trim() !== ''
  const found = searching ? searchShapes(query) : []

  return (
    <aside aria-label="Фигуры" className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r p-2">
      <label className="relative flex items-center">
        <Search aria-hidden className="pointer-events-none absolute left-2 size-4 text-muted-foreground" />
        <input
          type="search"
          aria-label="Поиск фигур"
          placeholder="Поиск фигур"
          className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setQuery('')
            } else if (event.key === 'Enter' && found[0]) {
              event.preventDefault()
              editor?.addShape(found[0].id)
            }
          }}
        />
      </label>
      {searching ? (
        found.length > 0 ? (
          <div role="group" aria-label="Найденные фигуры" className="flex flex-col gap-1">
            {found.map((shape) => (
              <ShapeButton key={shape.id} shape={shape} editor={editor} />
            ))}
          </div>
        ) : (
          <p className="px-2 text-sm text-muted-foreground">Ничего не найдено</p>
        )
      ) : (
        SHAPE_SECTIONS.map((section) => (
          // A section collapses with a click on its title.
          <details key={section.title} open aria-label={section.title} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded px-2 py-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronDown aria-hidden className="size-3.5 -rotate-90 transition-transform group-open:rotate-0" />
              {section.title}
            </summary>
            {/* Chrome does not lay out the content of <details> as flex, so the buttons get their own column. */}
            <div className="mt-1 flex flex-col gap-1">
              {section.shapes.map((shape) => (
                <ShapeButton key={shape.id} shape={shape} editor={editor} />
              ))}
            </div>
          </details>
        ))
      )}
    </aside>
  )
}

function ShapeButton({ shape, editor }: { shape: ShapePreset; editor: DiagramEditor | null }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto justify-start py-1.5 text-left whitespace-normal"
      disabled={!editor}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(SHAPE_DRAG_TYPE, shape.id)
        event.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => editor?.addShape(shape.id)}
    >
      <ShapeIcon shape={shape.id} />
      {shape.label}
    </Button>
  )
}
