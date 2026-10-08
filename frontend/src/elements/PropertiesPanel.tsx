import { Eye, EyeOff, ListTree, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DiagramEditor, ElementPropertiesChange, SelectionProperties } from '../diagram/editor.ts'
import {
  INTERACTION_LABELS,
  parseTags,
  type EdgeProperties,
  type ElementProperties,
  type Interaction,
} from '../diagram/elementKinds.ts'
import { EDGE_TECHNOLOGIES, KIND_SECTIONS, kindLabel, technologySuggestions, usedProperties } from '../diagram/elementProps.ts'
import type { ShapeId } from '../diagram/shapes.ts'
import { useEditorState } from '../diagram/useEditorState.ts'

/** The button of the header of the board that shows and hides the panel of properties. */
export function PropertiesButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Свойства"
      aria-pressed={open}
      title="Свойства элемента"
      className="shrink-0"
      onClick={onToggle}
    >
      <ListTree />
    </Button>
  )
}

/** The panels at the right of the canvas, one under another: the description of a call, the properties. */
export function SidePanels({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-2 right-2 z-20 flex max-h-[calc(100%-1rem)] w-[400px] max-w-[calc(100%-1rem)] flex-col items-end gap-2">
      {children}
    </div>
  )
}

/** A request of the page to show the properties of an element, e.g. from its menu; a new object for every request. */
export interface PropertiesRequest {
  cellId: string
}

/**
 * The properties of the selected shape or edge, at the right of the canvas while it is open: name, kind, technology,
 * description, owner and tags of a shape, technology and interaction of an edge. Who edits the board changes them field
 * by field, each change an undo step; viewers and locked elements show them only. A new `request`, e.g. of the menu,
 * gives the keyboard to the panel.
 */
export function PropertiesPanel({
  editor,
  document,
  request = null,
  onClose,
}: {
  editor: DiagramEditor | null
  document: Y.Doc | null
  request?: PropertiesRequest | null
  onClose: () => void
}) {
  const { properties } = useEditorState(editor)
  // Read when a field with suggestions takes the keyboard, not on every change of the board.
  const [used, setUsed] = useState<{ technologies: string[]; owners: string[] }>({ technologies: [], owners: [] })
  const readUsed = () => document && setUsed(usedProperties(document))
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!request) return
    const field = panel.current?.querySelector<HTMLElement>('input, select, textarea')
    ;(field ?? panel.current)?.focus()
  }, [request])

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label="Свойства"
      className="pointer-events-auto flex min-h-0 w-[320px] max-w-full flex-col overflow-hidden rounded-md border bg-background text-foreground shadow-lg outline-none"
    >
      <header className="flex items-center gap-1 border-b px-3 py-2">
        <h2 className="mr-auto text-sm font-semibold">
          {properties?.target === 'edge' ? 'Свойства связи' : properties?.target === 'legend' ? 'Легенда' : 'Свойства'}
        </h2>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть" title="Закрыть" onClick={onClose}>
          <X />
        </Button>
      </header>
      <div className="overflow-y-auto p-3">
        {!editor || !properties ? (
          <p className="text-sm text-muted-foreground">Выделите фигуру или связь</p>
        ) : properties.target === 'legend' ? (
          <LegendForm key={properties.cellId} editor={editor} selection={properties} />
        ) : properties.target === 'edge' ? (
          properties.canChange ? (
            <EdgeForm key={properties.cellId} editor={editor} cellId={properties.cellId} properties={properties.properties} used={used} onUsed={readUsed} />
          ) : (
            <EdgeView properties={properties.properties} />
          )
        ) : properties.canChange ? (
          <ShapeForm key={properties.cellId} editor={editor} selection={properties} used={used} onUsed={readUsed} />
        ) : (
          <ShapeView selection={properties} />
        )}
      </div>
    </aside>
  )
}

type ShapeSelection = Extract<SelectionProperties, { target: 'shape' }>
type LegendSelection = Extract<SelectionProperties, { target: 'legend' }>

const fieldClass = 'w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground'

function Field({ label, children, htmlFor }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

/**
 * A field of text that applies its value by Enter, or by Ctrl+Enter or Cmd+Enter when it has lines, and when it loses
 * the keyboard or goes away, e.g. when another element is selected; Escape brings back the value of the element. While
 * it is being changed, a change of the element by someone else does not replace what is typed.
 */
function TextField({
  id,
  value,
  onCommit,
  multiline = false,
  list,
  placeholder,
  onFocus,
}: {
  id: string
  value: string
  onCommit: (value: string) => void
  multiline?: boolean
  list?: string
  placeholder?: string
  onFocus?: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  // What is typed and not applied yet, with how to apply it, for when the field goes away.
  const pending = useRef<{ draft: string | null; value: string; onCommit: (value: string) => void }>({ draft, value, onCommit })
  useLayoutEffect(() => {
    pending.current = { draft, value, onCommit }
  })
  useEffect(
    () => () => {
      const { draft: typed, value: current, onCommit: commit } = pending.current
      if (typed !== null && typed !== current) commit(typed)
    },
    [],
  )
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft)
    setDraft(null)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(null)
    } else if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      commit()
    }
  }
  const common = {
    id,
    value: draft ?? value,
    placeholder,
    onFocus,
    onBlur: commit,
    onKeyDown,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
  }
  return multiline ? (
    <textarea {...common} rows={3} className={cn(fieldClass, 'resize-y py-1')} />
  ) : (
    <input {...common} type="text" list={list} autoComplete="off" className={cn(fieldClass, 'h-8')} />
  )
}

function Suggestions({ id, values }: { id: string; values: readonly string[] }) {
  return (
    <datalist id={id}>
      {values.map((value) => (
        <option key={value} value={value} />
      ))}
    </datalist>
  )
}

function ShapeForm({
  editor,
  selection,
  used,
  onUsed,
}: {
  editor: DiagramEditor
  selection: ShapeSelection
  used: { technologies: string[]; owners: string[] }
  onUsed: () => void
}) {
  const id = useId()
  const { cellId, properties, defaultKind } = selection
  const change = (changes: ElementPropertiesChange) => editor.setElementProperties(cellId, changes)
  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => event.preventDefault()}>
      <Field label="Имя" htmlFor={`${id}-name`}>
        <TextField id={`${id}-name`} value={properties.name} onCommit={(name) => change({ name })} />
      </Field>
      <Field label="Тип" htmlFor={`${id}-kind`}>
        <KindSelect id={`${id}-kind`} value={properties.kind} defaultKind={defaultKind} onChange={(kind) => change({ kind })} />
      </Field>
      <Field label="Технология" htmlFor={`${id}-technology`}>
        <TextField
          id={`${id}-technology`}
          value={properties.technology}
          list={`${id}-technologies`}
          placeholder="Kotlin, Spring Boot"
          onFocus={onUsed}
          onCommit={(technology) => change({ technology })}
        />
        <Suggestions id={`${id}-technologies`} values={technologySuggestions(properties.kind, used.technologies)} />
      </Field>
      {selection.format === 'plain' && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selection.showTechnology}
            onChange={(event) => change({ showTechnology: event.target.checked })}
          />
          Технология на схеме
        </label>
      )}
      <Field label="Описание" htmlFor={`${id}-description`}>
        <TextField id={`${id}-description`} multiline value={properties.description} onCommit={(description) => change({ description })} />
      </Field>
      <Field label="Владелец" htmlFor={`${id}-owner`}>
        <TextField
          id={`${id}-owner`}
          value={properties.owner}
          list={`${id}-owners`}
          placeholder="Команда или человек"
          onFocus={onUsed}
          onCommit={(owner) => change({ owner })}
        />
        <Suggestions id={`${id}-owners`} values={used.owners} />
      </Field>
      <Field label="Теги" htmlFor={`${id}-tags`}>
        <TextField
          id={`${id}-tags`}
          value={properties.tags.join(' ')}
          placeholder="Слова через пробел"
          onCommit={(tags) => change({ tags: parseTags(tags) })}
        />
      </Field>
    </form>
  )
}

/**
 * The items of a legend, hidden ones too: a field of the name of each, with the name the legend gives it by default
 * as the placeholder, and a button that hides or shows it. Viewers and a locked legend show the names only.
 */
function LegendForm({ editor, selection }: { editor: DiagramEditor; selection: LegendSelection }) {
  const id = useId()
  const { cellId, items, canChange } = selection
  if (items.length === 0) return <p className="text-sm text-muted-foreground">На странице нет фигур и связей</p>
  return (
    <form className="flex flex-col gap-2" onSubmit={(event) => event.preventDefault()}>
      {canChange && <p className="text-xs text-muted-foreground">Пустое имя — название по умолчанию</p>}
      <ul aria-label="Пункты легенды" className="flex flex-col gap-1.5">
        {items.map((item, index) => {
          const shown = item.name || item.defaultName
          const toggle = item.hidden ? `Показать «${shown}»` : `Скрыть «${shown}»`
          return (
            <li key={item.key} className={cn('flex items-center gap-1', item.hidden && 'opacity-60')}>
              {canChange ? (
                <>
                  <label htmlFor={`${id}-${index}`} className="sr-only">
                    {`Имя пункта «${item.defaultName}»`}
                  </label>
                  <TextField
                    id={`${id}-${index}`}
                    value={item.name}
                    placeholder={item.defaultName}
                    onCommit={(name) => editor.setLegendItem(cellId, item.key, { name })}
                  />
                </>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm">{shown}</span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={toggle}
                title={item.hidden ? 'Показать' : 'Скрыть'}
                aria-pressed={item.hidden}
                disabled={!canChange}
                onClick={() => editor.setLegendItem(cellId, item.key, { hidden: !item.hidden })}
              >
                {item.hidden ? <EyeOff /> : <Eye />}
              </Button>
            </li>
          )
        })}
      </ul>
    </form>
  )
}

/** The kinds of elements by the sections of the palette; the kind of the shape is marked. */
function KindSelect({
  id,
  value,
  defaultKind,
  onChange,
}: {
  id: string
  value: ShapeId | null
  defaultKind: ShapeId | null
  onChange: (kind: ShapeId | null) => void
}) {
  return (
    <select
      id={id}
      value={value ?? ''}
      className={cn(fieldClass, 'h-8')}
      onChange={(event) => onChange((event.target.value || null) as ShapeId | null)}
    >
      <option value="">Без типа</option>
      {KIND_SECTIONS.map((section) => (
        <optgroup key={section.title} label={section.title}>
          {section.kinds.map((shape) => (
            <option key={shape.id} value={shape.id}>
              {shape.id === defaultKind ? `${shape.label} (по фигуре)` : shape.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function EdgeForm({
  editor,
  cellId,
  properties,
  used,
  onUsed,
}: {
  editor: DiagramEditor
  cellId: string
  properties: EdgeProperties
  used: { technologies: string[]; owners: string[] }
  onUsed: () => void
}) {
  const id = useId()
  const change = (changes: Partial<EdgeProperties>) => editor.setEdgeProperties(cellId, changes)
  const choices: [Interaction | null, string][] = [
    [null, 'Не указан'],
    ['sync', INTERACTION_LABELS.sync],
    ['async', INTERACTION_LABELS.async],
  ]
  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => event.preventDefault()}>
      <Field label="Технология / протокол" htmlFor={`${id}-technology`}>
        <TextField
          id={`${id}-technology`}
          value={properties.technology}
          list={`${id}-technologies`}
          placeholder="HTTPS, gRPC, Kafka"
          onFocus={onUsed}
          onCommit={(technology) => change({ technology })}
        />
        <Suggestions id={`${id}-technologies`} values={[...new Set([...EDGE_TECHNOLOGIES, ...used.technologies])]} />
      </Field>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs font-medium text-muted-foreground">Вид</legend>
        {choices.map(([interaction, label]) => (
          <label key={label} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${id}-interaction`}
              checked={properties.interaction === interaction}
              onChange={() => change({ interaction })}
            />
            {label}
          </label>
        ))}
      </fieldset>
    </form>
  )
}

function Entry({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{term}</dt>
      <dd className="text-sm break-words whitespace-pre-wrap">{children}</dd>
    </div>
  )
}

const shown = (value: string) => value || '—'

function ShapeView({ selection }: { selection: ShapeSelection }) {
  const { properties } = selection
  return (
    <dl className="flex flex-col gap-3">
      <Entry term="Имя">{shown(properties.name)}</Entry>
      <Entry term="Тип">{properties.kind ? kindLabel(properties.kind) : '—'}</Entry>
      <Entry term="Технология">{shown(properties.technology)}</Entry>
      <Entry term="Описание">{shown(properties.description)}</Entry>
      <Entry term="Владелец">{shown(properties.owner)}</Entry>
      <Entry term="Теги">
        <Tags tags={properties.tags} />
      </Entry>
    </dl>
  )
}

function Tags({ tags }: { tags: ElementProperties['tags'] }) {
  if (tags.length === 0) return '—'
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {tag}
        </span>
      ))}
    </span>
  )
}

function EdgeView({ properties }: { properties: EdgeProperties }) {
  return (
    <dl className="flex flex-col gap-3">
      <Entry term="Технология / протокол">{shown(properties.technology)}</Entry>
      <Entry term="Вид">{properties.interaction ? INTERACTION_LABELS[properties.interaction] : 'Не указан'}</Entry>
    </dl>
  )
}
