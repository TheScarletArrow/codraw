import { Client } from '@maxgraph/core'
import { Lock } from 'lucide-react'
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { menuItems, shortcutLabel, type MenuCommand } from './canvasMenu.ts'
import { readSystemClipboard } from './clipboard.ts'
import type { ContextMenuRequest, DiagramEditor } from './editor.ts'
import { lockLabel } from './locks.ts'
import { useEditorState } from './useEditorState.ts'

const COMMANDS: Record<Exclude<MenuCommand, 'comment'>, (editor: DiagramEditor, request: ContextMenuRequest) => void> = {
  // The system clipboard first; when the browser does not let the page read it, the clipboard of the tab.
  paste: (editor, { point }) => void readSystemClipboard().then((content) => editor.paste(point, content?.text, content?.html)),
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
  lock: (editor) => editor.setLocked(true),
  unlock: (editor) => editor.setLocked(false),
  delete: (editor) => editor.deleteSelection(),
}

/**
 * The menu of a right click on the canvas, with the actions that fit what was clicked. With `onComment`, a single
 * element gets «Комментировать», for viewers too. The menu of locked elements says who locked them.
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
  const { canPaste, canUndo, canRedo, canGroup, lock } = useEditorState(editor)
  const lockId = useId()

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

  // Viewers do not lock, but a locked element is as unchangeable for them as everything else.
  const locked = !editor.readOnly && (lock?.all ?? false)

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
        {locked && (
          <p id={lockId} className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
            <Lock aria-hidden className="size-3.5" />
            {lockLabel(lock!.locks.map((holder) => holder.lockedBy))}
          </p>
        )}
        <div role="menu" aria-label="Действия" aria-describedby={locked ? lockId : undefined} className="flex flex-col">
          {menuItems(request.target, {
            canPaste,
            canUndo,
            canRedo,
            canGroup,
            readOnly: editor.readOnly,
            canComment,
            canLock: lock?.canLock,
            canUnlock: (lock?.locks.length ?? 0) > 0,
            locked,
          }).map((item) => (
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
