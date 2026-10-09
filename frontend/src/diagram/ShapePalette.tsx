import { ChevronDown, ImagePlus, Search } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ComponentButton, LibrarySections } from '../libraries/LibrarySections.tsx'
import { searchComponents } from '../libraries/search.ts'
import type { LibraryShelf } from '../libraries/useLibraries.ts'
import type { DiagramEditor } from './editor.ts'
import { IMAGE_FILE_TYPES } from './images.ts'
import { ShapeIcon } from './ShapeIcon.tsx'
import { searchShapes } from './shapeSearch.ts'
import { SHAPE_DRAG_TYPE, SHAPE_SECTIONS, type ShapePreset } from './shapes.ts'
import { useEditorState } from './useEditorState.ts'

/** Words of a search that mean pictures rather than shapes: the search offers «Изображение» for them. */
const IMAGE_WORDS = ['изображение', 'картинка', 'рисунок', 'фото', 'скриншот', 'логотип', 'image', 'picture', 'png', 'jpeg']

const searchesImage = (query: string) => {
  const words = query.trim().toLowerCase().split(/\s+/)
  return words.every((word) => IMAGE_WORDS.some((candidate) => candidate.startsWith(word)))
}

/**
 * Shapes that can be dragged onto the canvas or added to the middle of the view with a click, and a search for them.
 * With `libraries`, the libraries of the user come first, and the search finds their components too.
 */
export function ShapePalette({ editor, libraries = null }: { editor: DiagramEditor | null; libraries?: LibraryShelf | null }) {
  const [query, setQuery] = useState('')
  const searching = query.trim() !== ''
  const found = searching ? searchShapes(query) : []
  const foundComponents = searching && libraries ? searchComponents(query, libraries.libraries ?? []) : []
  const imageFound = searching && searchesImage(query)

  return (
    <aside aria-label="Фигуры" className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r p-2">
      <label className="relative flex items-center">
        <Search aria-hidden className="pointer-events-none absolute left-2 size-4 text-muted-foreground" />
        <input
          type="search"
          aria-label="Поиск фигур"
          placeholder="Поиск фигур"
          className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setQuery('')
            } else if (event.key === 'Enter' && foundComponents[0] && libraries && editor) {
              event.preventDefault()
              void libraries.insert(editor, foundComponents[0].library.id, foundComponents[0].component)
            } else if (event.key === 'Enter' && found[0]) {
              event.preventDefault()
              editor?.addShape(found[0].id)
            }
          }}
        />
      </label>
      {searching ? (
        found.length > 0 || foundComponents.length > 0 || imageFound ? (
          <div role="group" aria-label="Найденные фигуры" className="flex flex-col gap-1">
            {libraries && foundComponents.length > 0 && (
              <>
                <h2 className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Из библиотек</h2>
                {foundComponents.map(({ library, component }) => (
                  <ComponentButton key={component.id} shelf={libraries} editor={editor} library={library} component={component} />
                ))}
                {(found.length > 0 || imageFound) && (
                  <h2 className="mt-1 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Фигуры</h2>
                )}
              </>
            )}
            {imageFound && <ImageButton editor={editor} />}
            {found.map((shape) => (
              <ShapeButton key={shape.id} shape={shape} editor={editor} />
            ))}
          </div>
        ) : (
          <p className="px-2 text-sm text-muted-foreground">Ничего не найдено</p>
        )
      ) : (
        <>
          {libraries && <LibrarySections shelf={libraries} editor={editor} />}
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
                  <ShapeButton key={shape.id} shape={shape} editor={editor} />
                ))}
                {section.group === 'basic' && <ImageButton editor={editor} />}
              </div>
            </details>
          ))}
        </>
      )}
    </aside>
  )
}

function ShapeButton({ shape, editor }: { shape: ShapePreset; editor: DiagramEditor | null }) {
  return (
    <Button
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
  )
}

/** «Изображение»: picks image files and adds them in the middle of the visible part of the canvas. */
function ImageButton({ editor }: { editor: DiagramEditor | null }) {
  const input = useRef<HTMLInputElement>(null)
  const { canAddImages } = useEditorState(editor)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={IMAGE_FILE_TYPES.join(',')}
        multiple
        aria-label="Файлы изображений"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length > 0) void editor?.addImages(files)
        }}
      />
      <Button
        type="button"
        variant="ghost"
        className="h-auto justify-start py-1.5 text-left whitespace-normal"
        title="Изображение PNG, JPEG, GIF или WebP с компьютера; картинку можно и вставить (Ctrl+V), и перетащить на холст"
        disabled={!canAddImages}
        onClick={() => input.current?.click()}
      >
        <ImagePlus aria-hidden className="size-5 text-foreground" strokeWidth={1.5} />
        Изображение
      </Button>
    </>
  )
}
