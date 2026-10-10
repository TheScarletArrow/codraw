import { Shapes, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { boardMessages as m } from './board.messages.ts'

/**
 * On a narrow screen the line of the board keeps its title, «Поделиться» and «Комментарии»; this button shows and hides
 * the rest of its tools, which come on the lines under it.
 */
export function ToolsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={m.tools}
      aria-expanded={open}
      title={m.tools}
      className="shrink-0 aria-expanded:bg-accent lg:hidden"
      onClick={onToggle}
    >
      <Wrench />
    </Button>
  )
}

/** On a narrow screen the palette of shapes is hidden: this button shows it over the canvas. */
export function PaletteButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={m.shapes}
      aria-expanded={open}
      title={m.shapes}
      className="shrink-0 aria-expanded:bg-accent md:hidden"
      onClick={onToggle}
    >
      <Shapes />
    </Button>
  )
}
