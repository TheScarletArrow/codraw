import { ArrowDown, ArrowUp, Eye, EyeOff, Layers, Lock, LockOpen, MoreHorizontal, Plus, X } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { DiagramEditor, LayerState } from './editor.ts'
import { useEditorState } from './useEditorState.ts'

/** The button of the header of the board that shows and hides the panel of layers. */
export function LayersButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Слои"
      aria-pressed={open}
      title="Слои страницы"
      className="shrink-0"
      onClick={onToggle}
    >
      <Layers />
    </Button>
  )
}

/** Which visibility a layer has on this canvas, as the panel tells it; `null` when it simply shows. */
function visibilityNote(layer: LayerState): string | null {
  if (layer.ownVisibility === false) return 'скрыт только у вас'
  if (layer.ownVisibility === true && layer.hiddenForAll) return 'показан только у вас'
  if (layer.hiddenForAll) return 'скрыт для всех'
  return null
}

/**
 * The layers of the page, at the right of the canvas while it is open, the top one first: the eye shows and hides a layer
 * for the participant only, the lock locks it for everybody, a click on its name makes it the layer new elements go into;
 * its menu renames, moves, hides for everybody, takes the selection in and removes it. Who may only view the board shows
 * and hides layers for themselves only.
 */
export function LayersPanel({ editor, onClose }: { editor: DiagramEditor | null; onClose: () => void }) {
  const { layers } = useEditorState(editor)
  const readOnly = editor?.readOnly ?? true
  const [renaming, setRenaming] = useState<string | null>(null)

  return (
    <aside
      aria-label="Слои"
      className="pointer-events-auto flex min-h-0 w-[320px] max-w-full flex-col overflow-hidden rounded-md border bg-background text-foreground shadow-lg outline-none"
    >
      <header className="flex items-center gap-1 border-b px-3 py-2">
        <h2 className="mr-auto text-sm font-semibold">Слои</h2>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Новый слой"
            title="Новый слой"
            onClick={() => {
              const id = editor?.addLayer()
              if (id) setRenaming(id)
            }}
          >
            <Plus />
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть" title="Закрыть" onClick={onClose}>
          <X />
        </Button>
      </header>
      <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
        Глаз скрывает слой только у вас. «Скрыть для всех» и замок действуют у всех участников.
      </p>
      <ul aria-label="Слои страницы" className="flex flex-col overflow-y-auto p-1">
        {layers.map((layer, index) => (
          <LayerRow
            key={layer.id}
            editor={editor}
            layer={layer}
            readOnly={readOnly}
            isTop={index === 0}
            isBottom={index === layers.length - 1}
            // The neighbour that takes the elements of a removed layer: the one under it, or above the bottom one.
            neighbour={layers[index + 1] ?? layers[index - 1] ?? null}
            renaming={renaming === layer.id}
            onRename={(rename) => setRenaming(rename ? layer.id : null)}
          />
        ))}
      </ul>
    </aside>
  )
}

interface LayerRowProps {
  editor: DiagramEditor | null
  layer: LayerState
  readOnly: boolean
  isTop: boolean
  isBottom: boolean
  neighbour: LayerState | null
  renaming: boolean
  onRename: (renaming: boolean) => void
}

function LayerRow({ editor, layer, readOnly, isTop, isBottom, neighbour, renaming, onRename }: LayerRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const note = visibilityNote(layer)
  const notes = [
    layer.active ? 'новые элементы здесь' : null,
    note,
    layer.locked ? (layer.lockedBy ? `заблокировал ${layer.lockedBy}` : 'заблокирован') : null,
    layer.selected > 0 ? `выделено: ${layer.selected}` : null,
  ].filter((text): text is string => text !== null)
  const iconButton = 'size-7 shrink-0 text-muted-foreground hover:text-foreground'

  return (
    <li data-layer-id={layer.id} aria-current={layer.active || undefined} aria-label={layer.name}>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              'group flex items-center gap-1 rounded px-1 py-1 text-sm',
              layer.active ? 'bg-accent' : 'hover:bg-accent/60',
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={iconButton}
              aria-label={layer.visible ? `Скрыть у себя «${layer.name}»` : `Показать у себя «${layer.name}»`}
              aria-pressed={!layer.visible}
              title={layer.visible ? 'Скрыть только у себя' : 'Показать только у себя'}
              onClick={() => editor?.setLayerVisible(layer.id, !layer.visible)}
            >
              {layer.visible ? <Eye /> : <EyeOff />}
            </Button>
            {renaming ? (
              <LayerNameInput
                layer={layer}
                onDone={(name) => {
                  onRename(false)
                  if (name !== null) editor?.renameLayer(layer.id, name)
                }}
              />
            ) : (
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col rounded px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label={`Сделать активным «${layer.name}»`}
                title={readOnly ? layer.name : 'Новые элементы попадут в этот слой; двойной щелчок — переименовать'}
                disabled={readOnly}
                onClick={() => editor?.setActiveLayer(layer.id)}
                onDoubleClick={() => !readOnly && onRename(true)}
                onKeyDown={(event) => {
                  if (event.key === 'F2' && !readOnly) onRename(true)
                }}
              >
                <span className={cn('truncate', !layer.visible && 'text-muted-foreground', !layer.ownName && 'italic')}>
                  {layer.name}
                </span>
                {notes.length > 0 && <span className="truncate text-xs text-muted-foreground">{notes.join(' · ')}</span>}
              </button>
            )}
            <span className="shrink-0 px-1 text-xs text-muted-foreground tabular-nums" title="Элементов в слое">
              {layer.elements}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn(iconButton, layer.locked && 'text-foreground')}
              aria-label={layer.locked ? `Разблокировать «${layer.name}»` : `Заблокировать «${layer.name}»`}
              aria-pressed={layer.locked}
              title={
                layer.locked
                  ? `Заблокирован для всех${layer.lockedBy ? `: ${layer.lockedBy}` : ''}`
                  : 'Заблокировать для всех: элементы слоя нельзя выделить и изменить'
              }
              disabled={readOnly}
              onClick={() => editor?.setLayerLocked(layer.id, !layer.locked)}
            >
              {layer.locked ? <Lock /> : <LockOpen />}
            </Button>
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={iconButton}
                aria-label={`Действия со слоем «${layer.name}»`}
                title="Действия со слоем"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreHorizontal />
              </Button>
            )}
          </div>
        </PopoverAnchor>
        <LayerMenu
          editor={editor}
          layer={layer}
          isTop={isTop}
          isBottom={isBottom}
          neighbour={neighbour}
          onRename={() => {
            setMenuOpen(false)
            onRename(true)
          }}
          onDone={() => setMenuOpen(false)}
        />
      </Popover>
    </li>
  )
}

/** Inline editor of the name of a layer: Enter or leaving it applies, Escape cancels; an empty name is the default one. */
function LayerNameInput({ layer, onDone }: { layer: LayerState; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(layer.ownName || layer.name)
  // Enter removes the input, and the browser may then report a blur too.
  const finished = useRef(false)
  const finish = (result: string | null) => {
    if (finished.current) return
    finished.current = true
    onDone(result)
  }
  return (
    <input
      aria-label="Имя слоя"
      autoFocus
      value={value}
      maxLength={100}
      placeholder={layer.main ? 'Основной слой' : 'Слой без имени'}
      className="h-7 min-w-0 flex-1 rounded border bg-background px-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => finish(value)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        event.stopPropagation()
        if (event.key === 'Enter') finish(value)
        if (event.key === 'Escape') finish(null)
      }}
    />
  )
}

interface LayerMenuProps {
  editor: DiagramEditor | null
  layer: LayerState
  isTop: boolean
  isBottom: boolean
  neighbour: LayerState | null
  onRename: () => void
  onDone: () => void
}

/** What a layer does besides its eye and lock; removing a layer with elements asks what happens to them. */
function LayerMenu({ editor, layer, isTop, isBottom, neighbour, onRename, onDone }: LayerMenuProps) {
  const [confirming, setConfirming] = useState(false)
  const hintId = useId()
  const item = 'justify-start font-normal'
  const run = (action: () => void) => () => {
    action()
    onDone()
  }
  const deleteHint = layer.main
    ? 'Основной слой страницы нельзя удалить'
    : layer.locked
      ? 'Заблокированный слой нельзя удалить'
      : undefined
  const canMoveOut = neighbour !== null && !neighbour.locked

  return (
    <PopoverContent
      side="bottom"
      align="end"
      className="w-72 p-1"
      onCloseAutoFocus={(event) => event.preventDefault()}
      onOpenAutoFocus={() => setConfirming(false)}
    >
      {confirming ? (
        <div role="alertdialog" aria-label="Удаление слоя" className="flex flex-col gap-2 p-2">
          <p className="text-sm">
            В слое «{layer.name}» элементов: {layer.elements}. Что сделать с ними у всех участников?
          </p>
          {layer.holdsLocked && (
            <p className="text-xs text-muted-foreground">В слое есть закреплённые элементы: их можно только перенести.</p>
          )}
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              size="sm"
              disabled={!canMoveOut}
              title={canMoveOut ? undefined : 'Соседний слой заблокирован'}
              onClick={run(() => editor?.deleteLayer(layer.id, neighbour!.id))}
            >
              Перенести в «{neighbour?.name}» и удалить слой
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={layer.holdsLocked}
              onClick={run(() => editor?.deleteLayer(layer.id, null))}
            >
              Удалить вместе с элементами
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <div role="menu" aria-label={`Слой «${layer.name}»`} className="flex flex-col">
          <Button type="button" role="menuitem" variant="ghost" size="sm" className={item} onClick={onRename}>
            Переименовать
          </Button>
          <Button
            type="button"
            role="menuitem"
            variant="ghost"
            size="sm"
            className={item}
            disabled={isTop}
            onClick={run(() => editor?.moveLayer(layer.id, 'up'))}
          >
            <ArrowUp /> Выше
          </Button>
          <Button
            type="button"
            role="menuitem"
            variant="ghost"
            size="sm"
            className={item}
            disabled={isBottom}
            onClick={run(() => editor?.moveLayer(layer.id, 'down'))}
          >
            <ArrowDown /> Ниже
          </Button>
          <Button
            type="button"
            role="menuitem"
            variant="ghost"
            size="sm"
            className={item}
            disabled={!layer.canMoveSelection}
            title={layer.locked ? 'Слой заблокирован' : 'Выделенные элементы перейдут в этот слой на своих местах'}
            onClick={run(() => editor?.moveSelectionToLayer(layer.id))}
          >
            Перенести выделенное сюда
          </Button>
          <Button
            type="button"
            role="menuitem"
            variant="ghost"
            size="sm"
            className={item}
            title="Видимость для всех участников, живой картинки и .drawio"
            onClick={run(() => editor?.setLayerHidden(layer.id, !layer.hiddenForAll))}
          >
            {layer.hiddenForAll ? 'Показать для всех' : 'Скрыть для всех'}
          </Button>
          <Button
            type="button"
            role="menuitem"
            variant="ghost"
            size="sm"
            className={cn(item, 'text-destructive hover:text-destructive')}
            disabled={deleteHint !== undefined}
            aria-describedby={deleteHint ? hintId : undefined}
            onClick={() => (layer.elements > 0 ? setConfirming(true) : run(() => editor?.deleteLayer(layer.id, null))())}
          >
            Удалить слой
          </Button>
          {deleteHint && (
            <p id={hintId} className="px-3 pb-1 text-xs text-muted-foreground">
              {deleteHint}
            </p>
          )}
        </div>
      )}
    </PopoverContent>
  )
}
