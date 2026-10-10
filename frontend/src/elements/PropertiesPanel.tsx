import { Eye, EyeOff, ListTree, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import type * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { environments, parentCandidates } from '../diagram/boardModel.ts'
import type { DiagramEditor, ElementPropertiesChange, SelectionProperties, ViewRelation } from '../diagram/editor.ts'
import {
  INTERACTION_LABELS,
  parseTags,
  type EdgeProperties,
  type ElementProperties,
  type Interaction,
} from '../diagram/elementKinds.ts'
import { EDGE_TECHNOLOGIES, KIND_SECTIONS, kindLabel, technologySuggestions, usedProperties } from '../diagram/elementProps.ts'
import { cellElementId, getCells } from '../diagram/model.ts'
import type { ShapeId } from '../diagram/shapes.ts'
import { useEditorState } from '../diagram/useEditorState.ts'
import { environmentLabel } from '../diagram/viewRule.ts'
import { elementName, modelStore } from '../views/modelStore.ts'
import { IconField, IconView } from './IconField.tsx'
import { elementsMessages as m } from './messages.ts'

/** The button of the header of the board that shows and hides the panel of properties. */
export function PropertiesButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={m.properties}
      aria-pressed={open}
      title={m.elementProperties}
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
  onShow,
  onClose,
}: {
  editor: DiagramEditor | null
  document: Y.Doc | null
  request?: PropertiesRequest | null
  /** Goes to a cell of another page, e.g. a relation of the model that an edge of a view shows. */
  onShow?: (pageId: string, cellId: string) => void
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
      aria-label={m.properties}
      className="pointer-events-auto flex min-h-0 w-[320px] max-w-full flex-col overflow-hidden rounded-md border bg-background text-foreground shadow-lg outline-none"
    >
      <header className="flex items-center gap-1 border-b px-3 py-2">
        <h2 className="mr-auto text-sm font-semibold">
          {properties?.target === 'edge'
            ? properties.relations !== null
              ? m.viewEdge
              : m.edgeProperties
            : properties?.target === 'legend'
              ? m.legend
              : m.properties}
        </h2>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={m.close} title={m.close} onClick={onClose}>
          <X />
        </Button>
      </header>
      <div className="overflow-y-auto p-3">
        {!editor || !properties ? (
          <p className="text-sm text-muted-foreground">{m.selectShape}</p>
        ) : properties.target === 'legend' ? (
          <LegendForm key={properties.cellId} editor={editor} selection={properties} />
        ) : properties.target === 'edge' ? (
          properties.relations !== null ? (
            <ViewEdgeView relations={properties.relations} onShow={onShow} />
          ) : properties.canChange ? (
            <EdgeForm key={properties.cellId} editor={editor} cellId={properties.cellId} properties={properties.properties} used={used} onUsed={readUsed} />
          ) : (
            <EdgeView properties={properties.properties} />
          )
        ) : properties.canChange ? (
          <ShapeForm key={properties.cellId} editor={editor} document={document} selection={properties} used={used} onUsed={readUsed} />
        ) : (
          <ShapeView editor={editor} document={document} selection={properties} />
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
  document,
  selection,
  used,
  onUsed,
}: {
  editor: DiagramEditor
  document: Y.Doc | null
  selection: ShapeSelection
  used: { technologies: string[]; owners: string[] }
  onUsed: () => void
}) {
  const id = useId()
  const { cellId, properties, defaultKind } = selection
  const change = (changes: ElementPropertiesChange) => editor.setElementProperties(cellId, changes)
  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => event.preventDefault()}>
      <Field label={m.name} htmlFor={`${id}-name`}>
        <TextField id={`${id}-name`} value={properties.name} onCommit={(name) => change({ name })} />
      </Field>
      <Field label={m.kind} htmlFor={`${id}-kind`}>
        <KindSelect id={`${id}-kind`} value={properties.kind} defaultKind={defaultKind} onChange={(kind) => change({ kind })} />
      </Field>
      <Field label={m.technology} htmlFor={`${id}-technology`}>
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
      <Field label={m.icon} htmlFor={`${id}-icon`}>
        <IconField id={`${id}-icon`} icon={selection.icon} technology={properties.technology} onChange={(icon) => change({ icon })} />
      </Field>
      {selection.format === 'plain' && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selection.showTechnology}
            onChange={(event) => change({ showTechnology: event.target.checked })}
          />
          {m.technologyOnDiagram}
        </label>
      )}
      <Field label={m.description} htmlFor={`${id}-description`}>
        <TextField id={`${id}-description`} multiline value={properties.description} onCommit={(description) => change({ description })} />
      </Field>
      <Field label={m.owner} htmlFor={`${id}-owner`}>
        <TextField
          id={`${id}-owner`}
          value={properties.owner}
          list={`${id}-owners`}
          placeholder={m.ownerPlaceholder}
          onFocus={onUsed}
          onCommit={(owner) => change({ owner })}
        />
        <Suggestions id={`${id}-owners`} values={used.owners} />
      </Field>
      <Field label={m.tags} htmlFor={`${id}-tags`}>
        <TextField
          id={`${id}-tags`}
          value={properties.tags.join(' ')}
          placeholder={m.tagsPlaceholder}
          onCommit={(tags) => change({ tags: parseTags(tags) })}
        />
      </Field>
      {document && <ModelFields editor={editor} document={document} cellId={cellId} canChange />}
    </form>
  )
}

/**
 * The place of the element of a shape in the model of the board (see `boardModel.ts`): what a container or a component is
 * a part of — by the field, or by the frame it is drawn in when the field is empty —, and the environment of a node of
 * deployment, of its own or of the node it lies in. Nothing for other elements.
 */
function ModelFields({ editor, document, cellId, canChange }: { editor: DiagramEditor; document: Y.Doc; cellId: string; canChange: boolean }) {
  const id = useId()
  const store = modelStore(document)
  const model = useSyncExternalStore(store.subscribe, store.get)
  const key = cellElementId(getCells(document, editor.pageId).get(cellId)) ?? cellId
  const element = model.elements.get(key)
  if (!element) return null
  if (element.level === 'container' || element.level === 'component') {
    const drawn = element.drawnParent !== null ? model.elements.get(element.drawnParent) : undefined
    const byDrawing = m.byDrawing(drawn ? elementName(drawn) : null)
    const explicit = element.explicitParent !== null ? model.elements.get(element.explicitParent) : undefined
    if (!canChange) return <Entry term={m.partOf}>{explicit ? elementName(explicit) : byDrawing}</Entry>
    return (
      <Field label={m.partOf} htmlFor={`${id}-parent`}>
        <select
          id={`${id}-parent`}
          value={element.explicitParent ?? ''}
          className={cn(fieldClass, 'h-8')}
          onChange={(event) => editor.setModelField(cellId, 'parent', event.target.value)}
        >
          <option value="">{byDrawing}</option>
          {parentCandidates(model, element.level, element.id).map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {elementName(candidate)}
            </option>
          ))}
        </select>
      </Field>
    )
  }
  if (element.level !== 'node') return null
  const above = element.parent !== null ? model.elements.get(element.parent)?.environment : ''
  if (!canChange) return <Entry term={m.environment}>{element.environment ? environmentLabel(element.environment) : '—'}</Entry>
  return (
    <Field label={m.environment} htmlFor={`${id}-environment`}>
      <TextField
        id={`${id}-environment`}
        value={element.ownEnvironment}
        list={`${id}-environments`}
        placeholder={above || 'prod, stage, dev'}
        onCommit={(environment) => editor.setModelField(cellId, 'environment', environment)}
      />
      <Suggestions id={`${id}-environments`} values={environments(model).filter(Boolean)} />
    </Field>
  )
}

/** The relations of the model an edge of a view shows: where they are drawn, which a click opens. */
function ViewEdgeView({ relations, onShow }: { relations: ViewRelation[]; onShow?: (pageId: string, cellId: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {m.viewEdgeHint}
      </p>
      <ul aria-label={m.modelRelations} className="flex flex-col gap-1">
        {relations.map((relation) => (
          <li key={`${relation.pageId}/${relation.cellId}`}>
            <button
              type="button"
              className="flex w-full flex-col rounded px-2 py-1 text-left text-sm hover:bg-accent"
              onClick={() => onShow?.(relation.pageId, relation.cellId)}
            >
              <span className="truncate">
                {relation.source || m.unnamed} → {relation.target || m.unnamed}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {[relation.label, relation.technology, relation.pageName].filter(Boolean).join(' · ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The items of a legend, hidden ones too: a field of the name of each, with the name the legend gives it by default
 * as the placeholder, and a button that hides or shows it. Viewers and a locked legend show the names only.
 */
function LegendForm({ editor, selection }: { editor: DiagramEditor; selection: LegendSelection }) {
  const id = useId()
  const { cellId, items, canChange } = selection
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{m.noLegendItems}</p>
  return (
    <form className="flex flex-col gap-2" onSubmit={(event) => event.preventDefault()}>
      {canChange && <p className="text-xs text-muted-foreground">{m.legendHint}</p>}
      <ul aria-label={m.legendItems} className="flex flex-col gap-1.5">
        {items.map((item, index) => {
          const shown = item.name || item.defaultName
          const toggle = item.hidden ? m.showItem(shown) : m.hideItem(shown)
          return (
            <li key={item.key} className={cn('flex items-center gap-1', item.hidden && 'opacity-60')}>
              {canChange ? (
                <>
                  <label htmlFor={`${id}-${index}`} className="sr-only">
                    {m.itemName(item.defaultName)}
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
                title={item.hidden ? m.show : m.hide}
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
      <option value="">{m.noKind}</option>
      {KIND_SECTIONS.map((section) => (
        <optgroup key={section.title} label={section.title}>
          {section.kinds.map((shape) => (
            <option key={shape.id} value={shape.id}>
              {shape.id === defaultKind ? m.byShape(shape.label) : shape.label}
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
    [null, m.notSpecified],
    ['sync', INTERACTION_LABELS.sync],
    ['async', INTERACTION_LABELS.async],
  ]
  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => event.preventDefault()}>
      <Field label={m.edgeTechnology} htmlFor={`${id}-technology`}>
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
        <legend className="mb-1 text-xs font-medium text-muted-foreground">{m.interaction}</legend>
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

function ShapeView({ editor, document, selection }: { editor: DiagramEditor; document: Y.Doc | null; selection: ShapeSelection }) {
  const { properties } = selection
  return (
    <dl className="flex flex-col gap-3">
      <Entry term={m.name}>{shown(properties.name)}</Entry>
      <Entry term={m.kind}>{properties.kind ? kindLabel(properties.kind) : '—'}</Entry>
      <Entry term={m.technology}>{shown(properties.technology)}</Entry>
      <Entry term={m.icon}>
        <IconView icon={selection.icon} technology={properties.technology} />
      </Entry>
      <Entry term={m.description}>{shown(properties.description)}</Entry>
      <Entry term={m.owner}>{shown(properties.owner)}</Entry>
      <Entry term={m.tags}>
        <Tags tags={properties.tags} />
      </Entry>
      {document && <ModelFields editor={editor} document={document} cellId={selection.cellId} canChange={false} />}
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
      <Entry term={m.edgeTechnology}>{shown(properties.technology)}</Entry>
      <Entry term={m.interaction}>{properties.interaction ? INTERACTION_LABELS[properties.interaction] : m.notSpecified}</Entry>
    </dl>
  )
}
