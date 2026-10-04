import {
  Box,
  Boxes,
  Cloud,
  Component,
  Database,
  FileText,
  Globe,
  Rows3,
  Server,
  SquareDashed,
  Table2,
  Type,
  User,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DiagramEditor } from './editor.ts'
import { SHAPE_DRAG_TYPE, SHAPE_SECTIONS, type ShapeId } from './shapes.ts'

/** Shapes that can be dragged onto the canvas or added to the middle of the view with a click. */
export function ShapePalette({ editor }: { editor: DiagramEditor | null }) {
  return (
    <aside aria-label="Фигуры" className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r p-2">
      {SHAPE_SECTIONS.map((section) => (
        <div key={section.title} role="group" aria-label={section.title} className="flex flex-col gap-1">
          <h3 className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{section.title}</h3>
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
      ))}
    </aside>
  )
}

const ICONS: Partial<Record<ShapeId, LucideIcon>> = {
  text: Type,
  table: Table2,
  service: Server,
  database: Database,
  queue: Rows3,
  cache: Zap,
  user: User,
  'external-system': Cloud,
  document: FileText,
  boundary: SquareDashed,
  'c4-person': User,
  'c4-system': Box,
  'c4-container': Boxes,
  'c4-component': Component,
  'c4-database': Database,
  'c4-external-system': Globe,
  'c4-boundary': SquareDashed,
}

function ShapeIcon({ shape }: { shape: ShapeId }) {
  const Icon = ICONS[shape]
  if (Icon) return <Icon aria-hidden />
  return (
    <svg aria-hidden viewBox="0 0 20 18" className="size-5 fill-background stroke-foreground" strokeWidth={1.5}>
      {shape === 'rectangle' && <rect x="2" y="4" width="16" height="10" />}
      {shape === 'rounded' && <rect x="2" y="4" width="16" height="10" rx="3" />}
      {shape === 'ellipse' && <ellipse cx="10" cy="9" rx="8" ry="5.5" />}
      {shape === 'rhombus' && <path d="M10 2 18 9 10 16 2 9Z" />}
    </svg>
  )
}
