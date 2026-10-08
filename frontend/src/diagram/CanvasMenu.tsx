import { Client } from '@maxgraph/core'
import { Check, Lock } from 'lucide-react'
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import {
  isStatusCommand,
  menuItems,
  shortcutLabel,
  STATUS_COMMANDS,
  type MenuCommand,
  type StatusCommand,
} from './canvasMenu.ts'
import { readSystemClipboard } from './clipboard.ts'
import type { ContextMenuRequest, DiagramEditor, Point } from './editor.ts'
import { lockLabel } from './locks.ts'
import type { ElementStatus } from './status.ts'
import { StatusIcon } from './StatusIcon.tsx'
import { useEditorState } from './useEditorState.ts'

/** What a new thread of comments is about: an element, or a point of the page in diagram coordinates. */
export type CommentTarget = { cellId: string } | { point: Point }

/**
 * The items that the page does rather than the editor: those that start a thread, the window of a link, the panel of
 * the description of a call and the panel of properties.
 */
type PageCommand =
  | 'comment'
  | 'commentHere'
  | 'link'
  | 'edgeApi'
  | 'properties'
  | 'whereUsed'
  | 'deleteElementEverywhere'
  | 'mergeElements'

const COMMANDS: Record<
  Exclude<MenuCommand, PageCommand | StatusCommand>,
  (editor: DiagramEditor, request: ContextMenuRequest) => void
> = {
  // The system clipboard first; when the browser does not let the page read it, the clipboard of the tab.
  paste: (editor, { point }) =>
    void readSystemClipboard().then((content) => editor.paste(point, content?.text, content?.html, content?.images)),
  pasteAsSameElement: (editor, { point }) => editor.pasteAsSameElement(point),
  selectAll: (editor) => editor.selectAll(),
  // At the point of the click, editing its text at once.
  addSticky: (editor, { point }) => editor.addSticky(point),
  undo: (editor) => editor.undo(),
  redo: (editor) => editor.redo(),
  editLabel: (editor) => editor.editLabel(),
  addField: (editor) => editor.addTableField(),
  addIndex: (editor) => editor.addTableIndex(),
  cut: (editor) => editor.cut(),
  copy: (editor) => editor.copy(),
  duplicate: (editor) => editor.duplicate(),
  copyStyle: (editor) => editor.copyStyle(),
  pasteStyle: (editor) => editor.pasteStyle(),
  bringToFront: (editor) => editor.bringToFront(),
  sendToBack: (editor) => editor.sendToBack(),
  reverseEdge: (editor) => editor.reverseEdge(),
  group: (editor) => editor.group(),
  ungroup: (editor) => editor.ungroup(),
  lock: (editor) => editor.setLocked(true),
  unlock: (editor) => editor.setLocked(false),
  delete: (editor) => editor.deleteSelection(),
  detachElement: (editor, { cellId }) => cellId && editor.detachElement(cellId),
}

/**
 * The menu of a right click on the canvas, with the actions that fit what was clicked. With `onComment`, a single
 * element gets «Комментировать» and the empty canvas «Комментировать здесь», at the point of the click, for viewers
 * too. With `onLink`, a single shape, table, group or edge gets «Ссылка…», which asks the page to open the window of its
 * link at the point of the click. With `onEdgeApi`, a single edge gets «Описание API…», which asks the page to open the
 * description of its call for editing. With `onProperties`, a single shape or edge that has properties gets «Свойства…»,
 * for viewers too, which asks the page to show them. The menu of locked elements says who locked them. The items of the
 * status set it, and `onStatusChange` hears of the elements whose status they changed.
 */
export function CanvasMenu({
  editor,
  onComment,
  onLink,
  onEdgeApi,
  onProperties,
  onWhereUsed,
  onDeleteElementEverywhere,
  onMergeElements,
  onStatusChange,
}: {
  editor: DiagramEditor | null
  onComment?: (target: CommentTarget) => void
  onLink?: (request: ContextMenuRequest) => void
  onEdgeApi?: (cellId: string) => void
  onProperties?: (cellId: string) => void
  /** Shows where the element of the shape `cellId` is used, e.g. in the panel «Элементы доски». */
  onWhereUsed?: (cellId: string) => void
  /** Asks to confirm removing the element of the shape of the menu from all pages, at the point of the click. */
  onDeleteElementEverywhere?: (request: ContextMenuRequest) => void
  /** Asks which properties to keep when merging the selected shapes into one element, at the point of the click. */
  onMergeElements?: (request: ContextMenuRequest) => void
  onStatusChange?: (status: ElementStatus | null, cellIds: string[]) => void
}) {
  const canComment = onComment !== undefined
  const [request, setRequest] = useState<ContextMenuRequest | null>(null)
  // The open menu, read by a closed menu when it is about to give the keyboard back, which Radix does on a timeout.
  const openRequest = useRef<ContextMenuRequest | null>(null)
  // The chosen item gave the keyboard to a field outside the canvas, e.g. of a new comment.
  const focusTaken = useRef(false)
  const {
    canPaste,
    canUndo,
    canRedo,
    canGroup,
    canCopyStyle,
    canPasteStyle,
    lock,
    link,
    edgeApi,
    status,
    properties,
    canPasteAsSameElement,
    canMergeElements,
  } = useEditorState(editor)
  const lockId = useId()

  useEffect(
    () =>
      editor?.onContextMenu((next) => {
        // A participant who may only view has nothing to do with, e.g., an edge.
        const canShowProperties = onProperties !== undefined && editor.getState().properties?.cellId === next.cellId
        const element = editor.selectedElement()
        const canShowWhereUsed =
          onWhereUsed !== undefined &&
          element?.cellId === next.cellId &&
          (element.elementId !== null || element.properties.kind !== null)
        if (
          menuItems(next.target, {
            canPaste: false,
            canUndo: false,
            canRedo: false,
            readOnly: editor.readOnly,
            canComment,
            canShowProperties,
            canShowWhereUsed,
          }).length === 0
        ) {
          return
        }
        openRequest.current = next
        setRequest(next)
      }),
    [editor, canComment, onProperties, onWhereUsed],
  )

  if (!editor || !request) return null
  const close = () => {
    openRequest.current = null
    setRequest(null)
  }
  const run = (command: MenuCommand) => {
    close()
    if (command === 'link') {
      // The window of the link takes the keyboard.
      focusTaken.current = true
      onLink?.(request)
      return
    }
    if (command === 'edgeApi') {
      // The form of the description takes the keyboard.
      focusTaken.current = true
      if (request.cellId) onEdgeApi?.(request.cellId)
      return
    }
    if (command === 'properties') {
      // The panel of properties takes the keyboard.
      focusTaken.current = true
      if (request.cellId) onProperties?.(request.cellId)
      return
    }
    if (command === 'whereUsed') {
      // The panel of elements takes the keyboard.
      focusTaken.current = true
      if (request.cellId) onWhereUsed?.(request.cellId)
      return
    }
    if (command === 'deleteElementEverywhere' || command === 'mergeElements') {
      // The window of the confirmation or of the choice takes the keyboard.
      focusTaken.current = true
      ;(command === 'mergeElements' ? onMergeElements : onDeleteElementEverywhere)?.(request)
      return
    }
    if (isStatusCommand(command)) {
      const changed = editor.setStatus(STATUS_COMMANDS[command])
      if (changed.length > 0) onStatusChange?.(STATUS_COMMANDS[command], changed)
      return
    }
    if (command !== 'comment' && command !== 'commentHere') {
      COMMANDS[command](editor, request)
      return
    }
    const target = command === 'commentHere' ? { point: request.point } : request.cellId && { cellId: request.cellId }
    if (!target) return
    focusTaken.current = true
    onComment?.(target)
  }

  // Viewers do not lock, but a locked element is as unchangeable for them as everything else.
  const locked = !editor.readOnly && (lock?.all ?? false)
  // The element of the shape clicked, with the pages of its cells.
  const element = request.cellId ? editor.selectedElement() : null
  const elementHere = element !== null && element.cellId === request.cellId
  const elementCells = elementHere ? element.places.reduce((count, place) => count + place.cellIds.length, 0) : 0

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
        // A long menu, e.g. of a shape with its statuses, scrolls on a low screen instead of going off it.
        className="max-h-[var(--radix-popover-content-available-height)] w-64 overflow-y-auto p-1"
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
            canCopyStyle,
            canPasteStyle,
            readOnly: editor.readOnly,
            canComment,
            canLock: lock?.canLock,
            canUnlock: (lock?.locks.length ?? 0) > 0,
            locked,
            canLink: onLink !== undefined && link !== null && link.cellId === request.cellId,
            canDescribeApi: onEdgeApi !== undefined && edgeApi !== null && edgeApi.cellId === request.cellId,
            canShowProperties: onProperties !== undefined && properties !== null && properties.cellId === request.cellId,
            canPasteAsSameElement,
            // A shape that stands for nothing, e.g. a rectangle that is no element, is nowhere else.
            canShowWhereUsed: onWhereUsed !== undefined && elementHere && (element.elementId !== null || element.properties.kind !== null),
            sharedElement: elementCells > 1,
            canDeleteElementEverywhere: onDeleteElementEverywhere !== undefined && elementCells > 1,
            canMergeElements: onMergeElements !== undefined && canMergeElements,
            status,
          }).map((item) => {
            const choice = isStatusCommand(item.command) ? STATUS_COMMANDS[item.command] : undefined
            return (
              <Fragment key={item.command}>
                {item.separatorBefore && <div role="separator" className="-mx-1 my-1 h-px bg-border" />}
                {item.heading && (
                  <p role="presentation" className="px-2 pt-0.5 pb-1 text-xs text-muted-foreground">
                    {item.heading}
                  </p>
                )}
                <Button
                  type="button"
                  role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                  aria-checked={item.checked}
                  variant="ghost"
                  size="sm"
                  aria-label={item.label}
                  aria-keyshortcuts={item.shortcut?.replace('Mod', Client.IS_MAC ? 'Meta' : 'Control')}
                  className="justify-between font-normal"
                  disabled={item.disabled}
                  onClick={() => run(item.command)}
                >
                  {choice === undefined ? (
                    item.label
                  ) : (
                    <span className="flex items-center gap-2">
                      {choice ? <StatusIcon status={choice} /> : <span aria-hidden className="size-4 shrink-0 rounded-full border" />}
                      {item.label}
                    </span>
                  )}
                  {item.shortcut && (
                    <kbd aria-hidden className="font-sans text-xs text-muted-foreground">
                      {shortcutLabel(item.shortcut, Client.IS_MAC)}
                    </kbd>
                  )}
                  {item.checked && <Check aria-hidden className="text-muted-foreground" />}
                </Button>
              </Fragment>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
