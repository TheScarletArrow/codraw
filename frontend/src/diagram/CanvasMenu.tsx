import { Client } from '@maxgraph/core'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { menuItems, shortcutLabel, type MenuCommand } from './canvasMenu.ts'
import { readSystemClipboard } from './clipboard.ts'
import type { ContextMenuRequest, DiagramEditor } from './editor.ts'
import { useEditorState } from './useEditorState.ts'

const COMMANDS: Record<Exclude<MenuCommand, 'comment'>, (editor: DiagramEditor, request: ContextMenuRequest) => void> = {
  // The system clipboard first; when the browser does not let the page read it, the clipboard of the tab.
  paste: (editor, { point }) => void readSystemClipboard().then((text) => editor.paste(point, text ?? undefined)),
  selectAll: (editor) => editor.selectAll(),
  undo: (editor) => editor.undo(),
  redo: (editor) => editor.redo(),
  editLabel: (editor) => editor.editLabel(),
  addField: (editor) => editor.addTableField(),
  addIndex: (editor) => editor.addTableIndex(),
  cut: (editor) => editor.cut(),
  copy: (editor) => editor.copy(),
  duplicate: (editor) => editor.duplicate(),
  bringToFront: (editor) => editor.bringToFront(),
  sendToBack: (editor) => editor.sendToBack(),
  reverseEdge: (editor) => editor.reverseEdge(),
  group: (editor) => editor.group(),
  ungroup: (editor) => editor.ungroup(),
  delete: (editor) => editor.deleteSelection(),
}

/**
 * The menu of a right click on the canvas, with the actions that fit what was clicked. With `onComment`, a single
 * element gets «Комментировать», for viewers too.
 */
export function CanvasMenu({
  editor,
  onComment,
}: {
  editor: DiagramEditor | null
  onComment?: (cellId: string) => void
}) {
  const canComment = onComment !== undefined
  const [request, setRequest] = useState<ContextMenuRequest | null>(null)
  // The open menu, read by a closed menu when it is about to give the keyboard back, which Radix does on a timeout.
  const openRequest = useRef<ContextMenuRequest | null>(null)
  // The chosen item gave the keyboard to a field outside the canvas, e.g. of a new comment.
  const focusTaken = useRef(false)
  const { canPaste, canUndo, canRedo, canGroup } = useEditorState(editor)

  useEffect(
    () =>
      editor?.onContextMenu((next) => {
        // A participant who may only view has nothing to do with, e.g., an edge.
        if (
          menuItems(next.target, { canPaste: false, canUndo: false, canRedo: false, readOnly: editor.readOnly, canComment })
            .length === 0
        ) {
          return
        }
        openRequest.current = next
        setRequest(next)
      }),
    [editor, canComment],
  )

  if (!editor || !request) return null
  const close = () => {
    openRequest.current = null
    setRequest(null)
  }
  const run = (command: MenuCommand) => {
    close()
    if (command !== 'comment') {
      COMMANDS[command](editor, request)
    } else if (request.cellId) {
      focusTaken.current = true
      onComment?.(request.cellId)
    }
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
        // The keyboard goes back to the canvas, unless the chosen item started editing a label or a comment, or another
        // menu is open already: taking the focus from that menu would close it.
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (!openRequest.current && !focusTaken.current) editor.focus()
          focusTaken.current = false
        }}
      >
        <div role="menu" aria-label="Действия" className="flex flex-col">
          {menuItems(request.target, { canPaste, canUndo, canRedo, canGroup, readOnly: editor.readOnly, canComment }).map(
            (item) => (
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
            ),
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
