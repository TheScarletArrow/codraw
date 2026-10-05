import { Client } from '@maxgraph/core'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { menuItems, shortcutLabel, type MenuCommand } from './canvasMenu.ts'
import type { ContextMenuRequest, DiagramEditor } from './editor.ts'
import { useEditorState } from './useEditorState.ts'

const COMMANDS: Record<MenuCommand, (editor: DiagramEditor, request: ContextMenuRequest) => void> = {
  paste: (editor, { point }) => editor.paste(point),
  selectAll: (editor) => editor.selectAll(),
  undo: (editor) => editor.undo(),
  redo: (editor) => editor.redo(),
  editLabel: (editor) => editor.editLabel(),
  addField: (editor) => editor.addTableField(),
  cut: (editor) => editor.cut(),
  copy: (editor) => editor.copy(),
  duplicate: (editor) => editor.duplicate(),
  bringToFront: (editor) => editor.bringToFront(),
  sendToBack: (editor) => editor.sendToBack(),
  reverseEdge: (editor) => editor.reverseEdge(),
  delete: (editor) => editor.deleteSelection(),
}

/** The menu of a right click on the canvas, with the actions that fit what was clicked. */
export function CanvasMenu({ editor }: { editor: DiagramEditor | null }) {
  const [request, setRequest] = useState<ContextMenuRequest | null>(null)
  // The open menu, read by a closed menu when it is about to give the keyboard back, which Radix does on a timeout.
  const openRequest = useRef<ContextMenuRequest | null>(null)
  const { canPaste, canUndo, canRedo } = useEditorState(editor)

  useEffect(
    () =>
      editor?.onContextMenu((next) => {
        // A participant who may only view has nothing to do with, e.g., an edge.
        if (
          menuItems(next.target, { canPaste: false, canUndo: false, canRedo: false, readOnly: editor.readOnly })
            .length === 0
        ) {
          return
        }
        openRequest.current = next
        setRequest(next)
      }),
    [editor],
  )

  if (!editor || !request) return null
  const close = () => {
    openRequest.current = null
    setRequest(null)
  }
  const run = (command: MenuCommand) => {
    close()
    COMMANDS[command](editor, request)
  }

  return (
    <Popover open onOpenChange={(open) => !open && close()}>
      <PopoverAnchor asChild>
        <div
          data-testid="canvas-menu-anchor"
          aria-hidden
          className="pointer-events-none absolute size-0"
          style={{ left: request.x, top: request.y }}
        />
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={2}
        className="w-64 p-1"
        // The keyboard goes back to the canvas, unless the chosen item started editing a label or another menu is open
        // already: taking the focus from that menu would close it.
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (!openRequest.current) editor.focus()
        }}
      >
        <div role="menu" aria-label="Действия" className="flex flex-col">
          {menuItems(request.target, { canPaste, canUndo, canRedo, readOnly: editor.readOnly }).map((item) => (
            <Fragment key={item.command}>
              {item.separatorBefore && <div role="separator" className="-mx-1 my-1 h-px bg-border" />}
              <Button
                type="button"
                role="menuitem"
                variant="ghost"
                size="sm"
                aria-label={item.label}
                aria-keyshortcuts={item.shortcut?.replace('Mod', Client.IS_MAC ? 'Meta' : 'Control')}
                className="justify-between font-normal"
                disabled={item.disabled}
                onClick={() => run(item.command)}
              >
                {item.label}
                {item.shortcut && (
                  <kbd aria-hidden className="font-sans text-xs text-muted-foreground">
                    {shortcutLabel(item.shortcut, Client.IS_MAC)}
                  </kbd>
                )}
              </Button>
            </Fragment>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
