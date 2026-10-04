import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DiagramEditor } from './editor.ts'
import { ShapeIcon } from './ShapeIcon.tsx'
import { SHAPE_DRAG_TYPE, SHAPE_SECTIONS } from './shapes.ts'

/** Shapes that can be dragged onto the canvas or added to the middle of the view with a click. */
export function ShapePalette({ editor }: { editor: DiagramEditor | null }) {
  return (
    <aside aria-label="Фигуры" className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r p-2">
      {SHAPE_SECTIONS.map((section) => (
        // A section collapses with a click on its title.
        <details key={section.title} open aria-label={section.title} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded px-2 py-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown aria-hidden className="size-3.5 -rotate-90 transition-transform group-open:rotate-0" />
            {section.title}
          </summary>
          {/* Chrome does not lay out the content of <details> as flex, so the buttons get their own column. */}
          <div className="mt-1 flex flex-col gap-1">
            {section.shapes.map((shape) => (
              <Button
                key={shape.id}
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
            ))}
          </div>
        </details>
      ))}
    </aside>
  )
}
