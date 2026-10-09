import { ChevronRight } from 'lucide-react'
import { useState, useSyncExternalStore, type DragEvent, type ReactNode } from 'react'
import type * as Y from 'yjs'
import { cn } from '@/lib/utils'
import { environments, type BoardModel, type ModelElement, type ModelLevel } from '../diagram/boardModel.ts'
import { searchText } from '../diagram/canvasSearch.ts'
import { kindLabel } from '../diagram/elementProps.ts'
import type { CellRef } from '../diagram/sharedElements.ts'
import { ELEMENT_DRAG_TYPE, type ElementDrag } from '../diagram/sharedElements.ts'
import { environmentLabel } from '../diagram/viewRule.ts'
import { elementDetails, elementName, modelStore } from './modelStore.ts'

/** A row of the tree: an element, or an element running on a node. */
interface TreeNode {
  key: string
  element: ModelElement
  /** The cell a click goes to. */
  cell: CellRef | undefined
  details: string
  children: TreeNode[]
}

const LEVEL_ORDER: Readonly<Record<ModelLevel, number>> = { person: 0, system: 1, container: 2, component: 3, node: 4 }

const byLevelAndName = (a: ModelElement, b: ModelElement) =>
  LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || elementName(a).localeCompare(elementName(b), 'ru')

/** What an element is found by: its name, kind, technology, description, owner and tags. */
function elementText(element: ModelElement): string {
  const { name, kind, technology, description, owner, tags } = element.properties
  return searchText([name, kind ? kindLabel(kind) : '', technology, description, owner, ...tags].join(' '))
}

/** The people and systems with their containers and components, the elements of no system after them. */
function logicalTree(model: BoardModel): TreeNode[] {
  const node = (element: ModelElement): TreeNode => ({
    key: `e:${element.id}`,
    element,
    cell: element.cells[0],
    details: elementDetails(element),
    children: (model.children.get(element.id) ?? [])
      .map((id) => model.elements.get(id)!)
      .filter((child) => child.level !== 'node')
      .sort(byLevelAndName)
      .map(node),
  })
  return (model.children.get('') ?? [])
    .map((id) => model.elements.get(id)!)
    .filter((element) => element.level !== 'node')
    .sort(byLevelAndName)
    .map(node)
}

/** The environments with their nodes, the nodes in them and what runs on them. */
function deploymentTree(model: BoardModel): { environment: string; nodes: TreeNode[] }[] {
  const running = (nodeId: string): TreeNode[] =>
    model.instances
      .filter((instance) => instance.node === nodeId)
      .map((instance) => model.elements.get(instance.element)!)
      .sort(byLevelAndName)
      .map((element) => ({
        key: `i:${nodeId}~${element.id}`,
        element,
        cell: model.instances.find((instance) => instance.node === nodeId && instance.element === element.id)?.cell,
        details: elementDetails(element),
        children: [],
      }))
  const node = (element: ModelElement): TreeNode => ({
    key: `n:${element.id}`,
    element,
    cell: element.cells[0],
    details: elementDetails(element),
    children: [
      ...(model.children.get(element.id) ?? [])
        .map((id) => model.elements.get(id)!)
        .filter((child) => child.level === 'node')
        .sort(byLevelAndName)
        .map(node),
      ...running(element.id),
    ],
  })
  return environments(model).map((environment) => ({
    environment,
    nodes: [...model.elements.values()]
      .filter((element) => element.level === 'node' && element.environment === environment)
      .filter((element) => element.parent === null || model.elements.get(element.parent)?.environment !== environment)
      .sort(byLevelAndName)
      .map(node),
  }))
}

/** The nodes that match every word of the query or hold one that does, with what they hold that does. */
function found(nodes: TreeNode[], words: readonly string[]): TreeNode[] {
  if (words.length === 0) return nodes
  return nodes.flatMap((node) => {
    const children = found(node.children, words)
    const text = elementText(node.element)
    const matches = words.every((word) => text.includes(word))
    return matches || children.length > 0 ? [{ ...node, children: matches && children.length === 0 ? [] : children }] : []
  })
}

/**
 * The model of the board as a tree (see `boardModel.ts`): the people and the systems with their containers and
 * components, and the environments of deployment with their nodes and what runs on them. A click on an element goes to
 * its first cell; who edits the board drags an element onto the canvas to add another cell of it. `query` keeps the
 * elements that match it with those above them.
 */
export function ModelTree({
  document,
  query,
  canPlace,
  onShow,
}: {
  document: Y.Doc
  query: string
  canPlace: boolean
  onShow: (pageId: string, cellId: string) => void
}) {
  const store = modelStore(document)
  const model = useSyncExternalStore(store.subscribe, store.get)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const words = searchText(query).trim().split(' ').filter(Boolean)
  const logical = found(logicalTree(model), words)
  const deployment = deploymentTree(model)
    .map((environment) => ({ ...environment, nodes: found(environment.nodes, words) }))
    .filter((environment) => environment.nodes.length > 0)
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  // While searching, everything found is open.
  const isOpen = (key: string) => words.length > 0 || !collapsed.has(key)
  const rows = (nodes: TreeNode[], depth: number): ReactNode =>
    nodes.map((node) => (
      <ModelRow key={node.key} node={node} depth={depth} open={isOpen(node.key)} canPlace={canPlace} onToggle={() => toggle(node.key)} onShow={onShow}>
        {node.children.length > 0 && isOpen(node.key) && (
          <ul role="group" className="flex flex-col">
            {rows(node.children, depth + 1)}
          </ul>
        )}
      </ModelRow>
    ))

  if (model.elements.size === 0) return <p className="p-2 text-sm text-muted-foreground">В модели нет элементов</p>
  if (logical.length === 0 && deployment.length === 0) return <p className="p-2 text-sm text-muted-foreground">Ничего не найдено</p>
  return (
    <div className="flex flex-col gap-2">
      {logical.length > 0 && (
        <section aria-label="Люди и системы">
          <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground">Люди и системы</h3>
          <ul role="tree" aria-label="Люди и системы" className="flex flex-col">
            {rows(logical, 0)}
          </ul>
        </section>
      )}
      {deployment.map(({ environment, nodes }) => (
        <section key={environment} aria-label={`Развёртывание: ${environmentLabel(environment)}`}>
          <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground">Развёртывание: {environmentLabel(environment)}</h3>
          <ul role="tree" aria-label={`Развёртывание: ${environmentLabel(environment)}`} className="flex flex-col">
            {rows(nodes, 0)}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ModelRow({
  node,
  depth,
  open,
  canPlace,
  onToggle,
  onShow,
  children,
}: {
  node: TreeNode
  depth: number
  open: boolean
  canPlace: boolean
  onToggle: () => void
  onShow: (pageId: string, cellId: string) => void
  children: ReactNode
}) {
  const { element, cell } = node
  const name = element.properties.name
  const handleDragStart = (event: DragEvent) => {
    const drag: ElementDrag = element.stored ? { elementId: element.id } : { cell: element.cells[0]! }
    event.dataTransfer.setData(ELEMENT_DRAG_TYPE, JSON.stringify(drag))
    event.dataTransfer.effectAllowed = 'copy'
  }
  const parentable = node.children.length > 0
  return (
    <li role="treeitem" aria-expanded={parentable ? open : undefined} aria-label={name || 'Без имени'} className="flex flex-col">
      <div className="flex items-center" style={{ paddingLeft: depth * 14 }}>
        <button
          type="button"
          aria-label={open ? `Свернуть ${name || 'элемент'}` : `Развернуть ${name || 'элемент'}`}
          tabIndex={parentable ? 0 : -1}
          className={cn('rounded p-1 text-muted-foreground hover:bg-accent', !parentable && 'invisible')}
          onClick={onToggle}
        >
          <ChevronRight aria-hidden className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        </button>
        <button
          type="button"
          draggable={canPlace}
          onDragStart={canPlace ? handleDragStart : undefined}
          title={canPlace ? 'Щелчок — к ячейке, перетаскивание на холст — ещё одна ячейка элемента' : 'К ячейке элемента'}
          className={cn('flex min-w-0 flex-1 flex-col rounded px-1.5 py-1 text-left text-sm hover:bg-accent', canPlace && 'cursor-grab active:cursor-grabbing')}
          onClick={() => cell && onShow(cell.pageId, cell.cellId)}
        >
          <span className={cn('truncate', !name && 'text-muted-foreground italic')}>{name || 'Без имени'}</span>
          {node.details && <span className="truncate text-xs text-muted-foreground">{node.details}</span>}
        </button>
      </div>
      {children}
    </li>
  )
}
