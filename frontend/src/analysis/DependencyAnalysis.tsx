import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import type { DiagramEditor } from '../diagram/editor.ts'
import { dependencies, dependencyGraph, placeKey, shortestPaths, type DependencyGraph, type Reachable } from './dependencies.ts'

export interface AnalysisRequest { pageId: string; cellIds: string[] }
const noSubscription = () => () => {}
const COLORS = { outgoing: '#d97706', incoming: '#0284c7', both: '#9333ea', source: '#9333ea' }

/** Personal analysis: only the React state and an overlay change, never the shared document or cell styles. */
export function DependencyAnalysis({ document, editor, request, onShow }: {
  document: Y.Doc
  editor: DiagramEditor
  request: AnalysisRequest | null
  onShow: (pageId: string, cellId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const [scope, setScope] = useState<'board' | 'page'>('board')
  const [depth, setDepth] = useState(1)
  const [bothWays, setBothWays] = useState(true)
  const [mode, setMode] = useState<'dependencies' | 'path'>('dependencies')
  const [start, setStart] = useState('')
  const [finish, setFinish] = useState('')
  const [selection, setSelection] = useState<string[]>([])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const changed = () => { timer ??= setTimeout(() => { timer = undefined; setRevision((value) => value + 1) }, 200) }
    document.on('update', changed)
    return () => { clearTimeout(timer); document.off('update', changed) }
  }, [document])
  useEffect(() => editor.onSelectionChange(setSelection), [editor])
  const graph = useMemo(() => dependencyGraph(document, scope === 'page' ? editor.pageId : undefined, bothWays), [document, editor.pageId, scope, bothWays, revision])
  useEffect(() => {
    if (!request) return
    const all = dependencyGraph(document)
    const keys = [...new Set(request.cellIds.flatMap((id) => all.cells.get(placeKey(request.pageId, id)) ?? []))]
    setScope('board')
    setStart(keys[0] ?? '')
    setFinish(keys[1] ?? '')
    setMode(keys.length > 1 ? 'path' : 'dependencies')
    setOpen(true)
  }, [document, request])
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])
  const outgoing = useMemo(() => dependencies(graph, start, depth), [graph, start, depth])
  const incoming = useMemo(() => dependencies(graph, start, depth, true), [graph, start, depth])
  const path = useMemo(() => shortestPaths(graph, start, finish), [graph, start, finish])
  const valid = graph.nodes.has(start)
  const shown = mode === 'path' ? path.nodes : new Set([...outgoing.nodes, ...incoming.nodes, ...(valid ? [start] : [])])
  const selectedKeys = [...new Set(selection.flatMap((id) => graph.cells.get(placeKey(editor.pageId, id)) ?? []))]
  const selectCurrent = () => {
    // A new import may precede the throttled graph refresh; resolve the selection from the current document.
    const current = dependencyGraph(document, scope === 'page' ? editor.pageId : undefined, bothWays)
    const ids = editor.graph?.getSelectionCells().flatMap((cell) => cell.id ? [cell.id] : []) ?? selection
    const keys = [...new Set(ids.flatMap((id) => current.cells.get(placeKey(editor.pageId, id)) ?? []))]
    setStart(keys[0] ?? selectedKeys[0] ?? '')
    setFinish(keys[1] ?? selectedKeys[1] ?? '')
    setMode(keys.length > 1 ? 'path' : 'dependencies')
    setOpen(true)
  }
  const nodes = [...graph.nodes.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const choose = (label: string, value: string, update: (key: string) => void) => (
    <label className="block text-sm">{label}
      <select aria-label={label} className="mt-1 w-full rounded border bg-background p-1.5" value={graph.nodes.has(value) ? value : ''} onChange={(event) => update(event.target.value)}>
        <option value="">Выберите элемент</option>
        {nodes.map((node) => <option key={node.key} value={node.key}>{node.name} · {node.places[0]?.pageName}</option>)}
      </select>
    </label>
  )
  return (
    <>
      {open && valid && <DependencyMarks editor={editor} graph={graph} start={start} shown={shown} outgoing={outgoing} incoming={incoming} path={mode === 'path' ? path : null} />}
      <div className="absolute right-3 top-3 z-20" onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
        <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => open ? setOpen(false) : selectCurrent()}>Анализ зависимостей</Button>
      </div>
      {open && (
        <aside aria-label="Анализ зависимостей" onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} className="absolute bottom-3 right-3 top-14 z-20 flex w-80 max-w-[calc(100%-1.5rem)] flex-col gap-3 overflow-y-auto rounded-lg border bg-background p-3 shadow-lg">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Анализ зависимостей</h3><Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Закрыть</Button></div>
          <label className="text-sm">Режим<select aria-label="Режим анализа" className="ml-2 rounded border bg-background p-1" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="dependencies">Зависимости</option><option value="path">Путь между</option></select></label>
          <label className="text-sm">Область<select aria-label="Область анализа" className="ml-2 rounded border bg-background p-1" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="board">Вся доска</option><option value="page">Текущая страница</option></select></label>
          {choose('Начальный элемент', start, setStart)}
          {mode === 'path' ? choose('Конечный элемент', finish, setFinish) : <label className="text-sm">Глубина<select aria-label="Глубина зависимостей" className="ml-2 rounded border bg-background p-1" value={depth === Infinity ? 'all' : depth} onChange={(event) => setDepth(event.target.value === 'all' ? Infinity : Number(event.target.value))}><option value="1">1 шаг</option><option value="2">2 шага</option><option value="all">Все шаги</option></select></label>}
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={bothWays} onChange={(event) => setBothWays(event.target.checked)} />Связи с очередями и топиками в обе стороны</label>
          <p className="text-xs text-muted-foreground">Стрелка означает: начало зависит от конца. Для очередей и топиков учитываются обе стороны, потому что стрелки импорта могут показывать поток данных. Выключите эту опцию для анализа строго по стрелкам.</p>
          {!valid ? <p role="status">Выберите элемент схемы.</p> : mode === 'path' && path.nodes.size === 0 ? <p role="status">{finish ? 'Путь не найден' : 'Выберите конечный элемент.'}</p> : <>
            {mode === 'dependencies' && <p className="text-sm"><span style={{ color: COLORS.outgoing }}>Зависит от: {outgoing.nodes.size}</span><br /><span style={{ color: COLORS.incoming }}>От него зависят: {incoming.nodes.size}</span><br /><span style={{ color: COLORS.both }}>В обе стороны — фиолетовый</span></p>}
            {mode === 'path' && <p className="text-sm">Подсвечены все кратчайшие пути по направлению зависимостей.</p>}
            <ul className="space-y-2">{nodes.filter((node) => shown.has(node.key)).map((node) => <li key={node.key}>
              <p className="text-sm font-medium">{node.name}{node.key === start ? ' · начало' : mode === 'path' ? '' : ` · ${outgoing.nodes.has(node.key) ? 'зависит от' : ''}${outgoing.nodes.has(node.key) && incoming.nodes.has(node.key) ? ' / ' : ''}${incoming.nodes.has(node.key) ? 'зависят от него' : ''}`}</p>
              {node.places.map((place) => <button type="button" className="mr-2 text-xs text-primary underline" key={placeKey(place.pageId, place.cellId)} onClick={() => onShow(place.pageId, place.cellId)}>{place.pageName}</button>)}
            </li>)}</ul>
          </>}
        </aside>
      )}
    </>
  )
}

export function DependencyMarks({ editor, graph, start, shown, outgoing, incoming, path }: {
  editor: DiagramEditor; graph: DependencyGraph; start: string; shown: Set<string>; outgoing: Reachable; incoming: Reachable; path: Reachable | null
}) {
  useSyncExternalStore(editor.onViewChange ?? noSubscription, () => editor.getViewVersion())
  const selectedEdges = path?.edges ?? new Set([...outgoing.edges, ...incoming.edges])
  const color = (key: string) => key === start || path || (outgoing.nodes.has(key) && incoming.nodes.has(key)) ? COLORS.both : outgoing.nodes.has(key) ? COLORS.outgoing : COLORS.incoming
  const edges = [...new Map(graph.edges.filter((edge) => edge.pageId === editor.pageId).map((edge) => [edge.key, edge])).values()]
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden data-testid="dependency-marks">
      <svg className="absolute inset-0 size-full">{edges.map((edge) => {
        const points = editor.edgePoints(edge.cellId)?.map((point) => `${point.x},${point.y}`).join(' ')
        if (!points) return null
        const selected = selectedEdges.has(edge.key)
        return <polyline key={edge.key} data-cell={edge.cellId} fill="none" points={points} stroke={selected ? (path ? COLORS.both : outgoing.edges.has(edge.key) ? COLORS.outgoing : COLORS.incoming) : 'var(--canvas)'} strokeOpacity={selected ? 0.85 : 0.8} strokeWidth={selected ? 4 : 6} strokeDasharray={selected && incoming.edges.has(edge.key) ? '7 4' : undefined} />
      })}</svg>
      {[...graph.nodes.values()].flatMap((node) => node.places.filter((place) => place.pageId === editor.pageId).map((place) => {
        const box = editor.cellBounds(place.cellId)
        if (!box) return null
        const selected = shown.has(node.key)
        return <div key={place.cellId} data-cell={place.cellId} data-highlight={selected ? 'selected' : 'dimmed'} className="absolute rounded-sm" style={{ left: box.x - 3, top: box.y - 3, width: box.width + 6, height: box.height + 6, border: selected ? `3px ${incoming.nodes.has(node.key) && !outgoing.nodes.has(node.key) ? 'dashed' : 'solid'} ${color(node.key)}` : undefined, background: selected ? undefined : 'var(--canvas)', opacity: selected ? 1 : 0.7 }} />
      }))}
    </div>
  )
}
