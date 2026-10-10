import { Client } from '@maxgraph/core'
import { ArrowDown, ArrowRight, Network } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DiagramEditor } from './editor.ts'
import type { LayoutDirection } from './layout.ts'
import { pickerMessages } from './pickers.messages.ts'
import { useEditorState } from './useEditorState.ts'

const m = pickerMessages.autoLayout

const DIRECTIONS: { direction: LayoutDirection; label: string; icon: typeof ArrowRight }[] = [
  { direction: 'right', label: m.leftToRight, icon: ArrowRight },
  { direction: 'down', label: m.topToBottom, icon: ArrowDown },
]

/** Lays out the selection, or the whole page without one, in layers along the edges. */
export function AutoLayoutPicker({ editor, isMac = Client.IS_MAC }: { editor: DiagramEditor | null; isMac?: boolean }) {
  const { hasCells, layoutSelection } = useEditorState(editor)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  const run = async (direction: LayoutDirection) => {
    if (!editor) return
    setOpen(false)
    setPending(true)
    try {
      await editor.autoLayout(direction)
    } finally {
      setPending(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={m.name}
          title={m.name}
          disabled={!editor || !hasCells || pending}
        >
          <Network />
          {/* Only while the toolbar has the room: otherwise an icon, as the other tools. */}
          <span className="hidden @min-[35rem]:inline">{pending ? m.pending : m.name}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={m.name} className="flex w-56 flex-col gap-1 p-2">
        <p className="px-2 pb-1 text-xs text-muted-foreground">
          {layoutSelection ? m.selection : m.page}
        </p>
        {DIRECTIONS.map(({ direction, label, icon: Icon }) => (
          <Button
            key={direction}
            type="button"
            variant="ghost"
            size="sm"
            className="justify-between font-normal"
            onClick={() => void run(direction)}
          >
            <span className="flex items-center gap-2">
              <Icon />
              {label}
            </span>
            {direction === 'right' && (
              <kbd className="font-sans text-xs text-muted-foreground">{isMac ? '⇧⌘L' : 'Ctrl+Shift+L'}</kbd>
            )}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
