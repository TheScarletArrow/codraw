import { ChevronDown, Ellipsis, Plus, Shapes } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { COMPONENT_NAME_MAX_LENGTH, LIBRARY_NAME_MAX_LENGTH, type LibraryComponentSummary, type ShapeLibrary } from '../api/libraries.ts'
import { TitleInput } from '../board/TitleInput.tsx'
import type { DiagramEditor } from '../diagram/editor.ts'
import { useEditorState } from '../diagram/useEditorState.ts'
import { LIBRARY_FILE_TYPES } from './component.ts'
import { COMPONENT_DRAG_TYPE, componentDragData } from './drag.ts'
import { libraryMessages as m } from './messages.ts'
import type { LibraryShelf } from './useLibraries.ts'

/** What the selection of the canvas lets the menus do; read once for the whole panel. */
interface Selection {
  /** Something is selected that copying takes: it can be saved into a library. */
  canCopy: boolean
  /** Something is selected that can take a look. */
  canTakeStyle: boolean
}

/** The small picture of a component on a white tile: the component has the colors of the diagram in both themes. */
function ComponentPreview({ preview }: { preview: string | null }) {
  return preview ? (
    <img src={preview} alt="" draggable={false} className="h-9 w-12 shrink-0 rounded-sm border bg-white object-contain" />
  ) : (
    <span aria-hidden className="flex h-9 w-12 shrink-0 items-center justify-center rounded-sm border bg-white">
      <Shapes className="size-4 text-neutral-500" strokeWidth={1.5} />
    </span>
  )
}

/**
 * A component in the panel: a click adds it to the middle of the visible part of the canvas, a drag to where it is
 * dropped.
 */
export function ComponentButton({
  shelf,
  editor,
  library,
  component,
  className,
}: {
  shelf: LibraryShelf
  editor: DiagramEditor | null
  library: ShapeLibrary
  component: LibraryComponentSummary
  className?: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn('h-auto w-full justify-start gap-2 py-1 text-left whitespace-normal', className)}
      disabled={!editor}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(COMPONENT_DRAG_TYPE, componentDragData({ libraryId: library.id, componentId: component.id }))
        event.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => editor && void shelf.insert(editor, library.id, component)}
    >
      <ComponentPreview preview={component.preview} />
      <span className="min-w-0 break-words">{component.name}</span>
    </Button>
  )
}

/**
 * «Мои библиотеки» of the panel of shapes: «Новая библиотека», then each library of the user as a section that
 * collapses, with its components and a menu; what is being done and why the last change failed.
 */
export function LibrarySections({ shelf, editor }: { shelf: LibraryShelf; editor: DiagramEditor | null }) {
  const [creating, setCreating] = useState(false)
  const { libraries, unavailable, error, pending } = shelf
  const { canCopy, canTakeStyle } = useEditorState(editor)
  const selection = { canCopy: editor !== null && canCopy, canTakeStyle: editor !== null && canTakeStyle }

  return (
    <section aria-label={m.myLibraries} className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-1 pl-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.myLibraries}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={m.newLibrary}
          title={m.newLibrary}
          disabled={libraries === undefined}
          onClick={() => setCreating(true)}
        >
          <Plus />
        </Button>
      </div>
      {creating && (
        <TitleInput
          title=""
          label={m.newLibraryName}
          placeholder={m.libraryName}
          maxLength={LIBRARY_NAME_MAX_LENGTH}
          className="h-8 px-2 text-sm"
          onDone={(name) => {
            setCreating(false)
            if (name !== null) void shelf.createLibrary(name)
          }}
        />
      )}
      {pending && (
        <p role="status" className="px-2 text-xs text-muted-foreground">
          {pending}
        </p>
      )}
      {error && (
        <div role="alert" className="flex flex-col items-start gap-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {error}
          <Button type="button" variant="ghost" size="xs" className="h-6 px-1" onClick={shelf.dismissError}>
            {m.gotIt}
          </Button>
        </div>
      )}
      {libraries === undefined ? (
        unavailable && <p className="px-2 text-xs text-muted-foreground">{m.unavailable}</p>
      ) : libraries.length === 0 ? (
        !creating && (
          <p className="px-2 text-xs text-muted-foreground">
            {m.emptyShelf}
          </p>
        )
      ) : (
        libraries.map((library) => (
          <LibrarySection key={library.id} shelf={shelf} editor={editor} library={library} selection={selection} />
        ))
      )}
    </section>
  )
}

function LibrarySection({
  shelf,
  editor,
  library,
  selection,
}: {
  shelf: LibraryShelf
  editor: DiagramEditor | null
  library: ShapeLibrary
  selection: Selection
}) {
  const [renaming, setRenaming] = useState(false)
  return (
    <div className="relative">
      {renaming ? (
        <TitleInput
          title={library.name}
          label={m.libraryName}
          maxLength={LIBRARY_NAME_MAX_LENGTH}
          className="h-7 w-full px-2 text-sm"
          onDone={(name) => {
            setRenaming(false)
            if (name !== null) void shelf.renameLibrary(library.id, name)
          }}
        />
      ) : (
        <LibraryMenu shelf={shelf} editor={editor} library={library} selection={selection} onRename={() => setRenaming(true)} />
      )}
      <details open aria-label={library.name} className="group">
        <summary
          className={cn(
            'flex cursor-pointer list-none items-center gap-1 rounded py-0.5 pr-7 pl-2 text-xs font-medium tracking-wide text-muted-foreground uppercase select-none hover:text-foreground [&::-webkit-details-marker]:hidden',
            renaming && 'sr-only',
          )}
        >
          <ChevronDown aria-hidden className="size-3.5 shrink-0 -rotate-90 transition-transform group-open:rotate-0" />
          <span className="min-w-0 truncate">{library.name}</span>
        </summary>
        <div className="mt-1 flex flex-col gap-1">
          {library.components.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">{m.emptyLibrary}</p>
          ) : (
            library.components.map((component) => (
              <ComponentRow
                key={component.id}
                shelf={shelf}
                editor={editor}
                library={library}
                component={component}
                selection={selection}
              />
            ))
          )}
        </div>
      </details>
    </div>
  )
}

function ComponentRow({
  shelf,
  editor,
  library,
  component,
  selection,
}: {
  shelf: LibraryShelf
  editor: DiagramEditor | null
  library: ShapeLibrary
  component: LibraryComponentSummary
  selection: Selection
}) {
  const [renaming, setRenaming] = useState(false)
  if (renaming) {
    return (
      <TitleInput
        title={component.name}
        label={m.componentName}
        maxLength={COMPONENT_NAME_MAX_LENGTH}
        className="h-8 px-2 text-sm"
        onDone={(name) => {
          setRenaming(false)
          if (name !== null) void shelf.renameComponent(library.id, component.id, name)
        }}
      />
    )
  }
  return (
    <div className="relative">
      <ComponentButton shelf={shelf} editor={editor} library={library} component={component} className="pr-7" />
      <ComponentMenu
        shelf={shelf}
        editor={editor}
        library={library}
        component={component}
        selection={selection}
        onRename={() => setRenaming(true)}
      />
    </div>
  )
}

/** A menu of the panel with its button over the top right corner of what it is about, and a confirmation step. */
function Menu({
  label,
  title,
  children,
}: {
  label: string
  title: string
  children: (close: () => void, confirm: (question: ReactNode, run: () => void) => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<{ question: ReactNode; run: () => void } | null>(null)
  const close = () => setOpen(false)
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setConfirming(null)
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={label} title={title} className="absolute top-0.5 right-0 z-10">
          <Ellipsis />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-64 p-1" onCloseAutoFocus={(event) => event.preventDefault()}>
        {confirming ? (
          <div role="alertdialog" aria-label={title} className="flex flex-col gap-2 p-2">
            <p className="text-sm">{confirming.question}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                {m.cancel}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => {
                  close()
                  confirming.run()
                }}
              >
                {m.delete}
              </Button>
            </div>
          </div>
        ) : (
          <div role="menu" aria-label={title} className="flex flex-col">
            {children(close, (question, run) => setConfirming({ question, run }))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function MenuItem({
  children,
  disabled,
  destructive,
  onSelect,
}: {
  children: ReactNode
  disabled?: boolean
  destructive?: boolean
  onSelect: () => void
}) {
  return (
    <Button
      type="button"
      role="menuitem"
      variant="ghost"
      size="sm"
      disabled={disabled}
      className={cn('justify-start font-normal', destructive && 'text-destructive hover:text-destructive')}
      onClick={onSelect}
    >
      {children}
    </Button>
  )
}

function LibraryMenu({
  shelf,
  editor,
  library,
  selection,
  onRename,
}: {
  shelf: LibraryShelf
  editor: DiagramEditor | null
  library: ShapeLibrary
  selection: Selection
  onRename: () => void
}) {
  const files = useRef<HTMLInputElement>(null)
  const count = library.components.length
  return (
    <>
      <input
        ref={files}
        type="file"
        accept={[...LIBRARY_FILE_TYPES, '.svg'].join(',')}
        multiple
        aria-label={m.imagesFor(library.name)}
        className="hidden"
        onChange={(event) => {
          const chosen = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (chosen.length > 0) void shelf.addFiles(library.id, chosen)
        }}
      />
      <Menu label={m.libraryMenu(library.name)} title={m.libraryNamed(library.name)}>
        {(close, confirm) => (
          <>
            <MenuItem
              disabled={!selection.canCopy}
              onSelect={() => {
                close()
                if (editor) void shelf.addSelection(editor, library.id)
              }}
            >
              {m.addSelection}
            </MenuItem>
            <MenuItem
              onSelect={() => {
                close()
                files.current?.click()
              }}
            >
              {m.addImages}
            </MenuItem>
            <MenuItem
              onSelect={() => {
                close()
                onRename()
              }}
            >
              {m.renameLibrary}
            </MenuItem>
            <MenuItem
              destructive
              onSelect={() =>
                confirm(
                  count === 0 ? m.deleteEmptyLibrary(library.name) : m.deleteLibraryOf(library.name, count),
                  () => void shelf.deleteLibrary(library.id),
                )
              }
            >
              {m.deleteLibrary}
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  )
}

function ComponentMenu({
  shelf,
  editor,
  library,
  component,
  selection,
  onRename,
}: {
  shelf: LibraryShelf
  editor: DiagramEditor | null
  library: ShapeLibrary
  component: LibraryComponentSummary
  selection: Selection
  onRename: () => void
}) {
  return (
    <Menu label={m.componentMenu(component.name)} title={m.componentNamed(component.name)}>
      {(close, confirm) => (
        <>
          <MenuItem
            onSelect={() => {
              close()
              onRename()
            }}
          >
            {m.rename}
          </MenuItem>
          <MenuItem
            disabled={!selection.canCopy}
            onSelect={() => {
              close()
              if (editor) void shelf.replaceWithSelection(editor, library.id, component.id)
            }}
          >
            {m.replaceWithSelection}
          </MenuItem>
          <MenuItem
            disabled={!selection.canTakeStyle}
            onSelect={() => {
              close()
              if (editor) void shelf.applyStyle(editor, library.id, component)
            }}
          >
            {m.applyStyle}
          </MenuItem>
          <MenuItem
            destructive
            onSelect={() =>
              confirm(m.deleteComponent(component.name), () =>
                void shelf.deleteComponent(library.id, component.id),
              )
            }
          >
            {m.delete}
          </MenuItem>
        </>
      )}
    </Menu>
  )
}
