import { identifier, modelBoundaries, modelElements, type ArchBoundary, type ArchElement, type ArchModel, type ArchNode } from './model.ts'

/** A string of Structurizr DSL: backslashes and quotes escaped, lines joined. */
const quote = (text: string) => `"${text.replace(/\s+/g, ' ').replace(/[\\"]/g, (char) => `\\${char}`)}"`

/** Arguments without the empty ones at the end, which Structurizr DSL lets out. */
const args = (...values: string[]) => {
  let end = values.length
  while (end > 0 && values[end - 1] === '') end -= 1
  return values.slice(0, end).map(quote).join(' ')
}

/** The model area an element or a frame is declared in: the model, a software system or a container. */
type Scope = string

const MODEL: Scope = 'model'
/** The software system named after the board, for containers outside any system frame. */
const BOARD_SYSTEM: Scope = '#system'
/** The container named after the board in a system, for components outside any container frame. */
const boardContainer = (system: Scope): Scope => `#container:${system}`

function tags(element: ArchElement): string {
  return [element.variant === 'database' ? 'Database' : element.variant === 'queue' ? 'Queue' : '', element.external ? 'External' : '']
    .filter(Boolean)
    .join(',')
}

function declaration(element: ArchElement): string {
  const { id, name, description, technology } = element
  if (element.kind === 'person') return `${id} = person ${args(name, description, tags(element))}`
  if (element.kind === 'system') return `${id} = softwareSystem ${args(name, description, tags(element))}`
  return `${id} = ${element.kind} ${args(name, description, technology, tags(element))}`
}

/**
 * The model as a workspace of Structurizr DSL. Structurizr declares a container in a software system and a component in
 * a container: a container outside any system frame goes into a system named after the board, a component outside
 * any container frame into a container named after the board in its system. People and systems are declared in the
 * model, groups follow the frames of no kind within each area that has elements of them.
 */
export function structurizrDsl(model: ArchModel): string {
  const scopes = new Map<ArchNode, Scope>()
  const walk = (nodes: ArchNode[], system: ArchBoundary | null, container: ArchBoundary | null) => {
    for (const node of nodes) {
      const systemScope = system?.id ?? BOARD_SYSTEM
      if (node.type === 'element') {
        scopes.set(node, node.kind === 'person' || node.kind === 'system' ? MODEL : node.kind === 'container' ? systemScope : (container?.id ?? boardContainer(systemScope)))
      } else if (node.kind === 'system') {
        scopes.set(node, MODEL)
        walk(node.children, node, null)
      } else if (node.kind === 'container') {
        scopes.set(node, systemScope)
        walk(node.children, system, node)
      } else {
        walk(node.children, system, container)
      }
    }
  }
  walk(model.roots, null, null)
  const used = new Set([...modelElements(model), ...modelBoundaries(model)].map((node) => node.id))
  const named = (base: string) => {
    let id = base
    for (let index = 2; used.has(id); index++) id = `${base}_${index}`
    used.add(id)
    return id
  }
  const has = (scope: Scope) => [...scopes.values()].includes(scope)
  const boardIds = new Map<Scope, string>()
  const boardId = (scope: Scope) => {
    let id = boardIds.get(scope)
    if (!id) {
      id = named(identifier(model.title, 'system'))
      boardIds.set(scope, id)
    }
    return id
  }

  const block = (head: string, body: string[]) => (body.length > 0 ? [`${head} {`, ...body.map((line) => (line ? `    ${line}` : '')), '}'] : [head])

  /** The declarations of an area within `nodes`: its elements, its frames of systems and containers, its groups. */
  const declarations = (scope: Scope, nodes: ArchNode[]): string[] =>
    nodes.flatMap((node): string[] => {
      if (node.type === 'element') return scopes.get(node) === scope ? [declaration(node)] : []
      if (node.kind === 'group') {
        const inner = declarations(scope, node.children)
        return inner.length > 0 ? block(`group ${quote(node.name)}`, inner) : []
      }
      // People and systems drawn in a frame of a system or a container are declared in the model all the same.
      if (scopes.get(node) !== scope) return scope === MODEL ? declarations(MODEL, node.children) : []
      if (node.kind === 'system') {
        return [...block(`${node.id} = softwareSystem ${quote(node.name)}`, systemBody(node.id, node.children)), ...declarations(MODEL, node.children)]
      }
      return block(`${node.id} = container ${quote(node.name)}`, declarations(node.id, node.children))
    })
  /** The containers of a system and, when some components have no container frame, the container of the board. */
  const systemBody = (scope: Scope, nodes: ArchNode[]) => [
    ...declarations(scope, nodes),
    ...(has(boardContainer(scope)) ? block(`${boardId(boardContainer(scope))} = container ${quote(model.title)}`, declarations(boardContainer(scope), nodes)) : []),
  ]

  const lines = declarations(MODEL, model.roots)
  if (has(BOARD_SYSTEM) || has(boardContainer(BOARD_SYSTEM))) {
    lines.push(...block(`${boardId(BOARD_SYSTEM)} = softwareSystem ${quote(model.title)}`, systemBody(BOARD_SYSTEM, model.roots)))
  }
  for (const relation of model.relations) {
    lines.push(`${relation.source.id} -> ${relation.target.id}${relation.description || relation.technology ? ` ${args(relation.description, relation.technology)}` : ''}`)
  }

  const view = (head: string) => block(head, ['include *', 'autolayout lr'])
  const idOf = (scope: Scope) => (scope.startsWith('#') ? boardId(scope) : scope)
  const views = view('systemLandscape "landscape"')
  const systemScopes = [...new Set([...scopes.entries()].filter(([node]) => node.type === 'element' && node.kind === 'container').map(([, scope]) => scope))]
  for (const scope of systemScopes) views.push(...view(`container ${idOf(scope)} "containers_${idOf(scope)}"`))
  const containerScopes = [...new Set([...scopes.entries()].filter(([node]) => node.type === 'element' && node.kind === 'component').map(([, scope]) => scope))]
  for (const scope of containerScopes) views.push(...view(`component ${idOf(scope)} "components_${idOf(scope)}"`))
  views.push(
    ...block('styles', [
      ...block('element "Person"', ['shape Person']),
      ...block('element "Database"', ['shape Cylinder']),
      ...block('element "Queue"', ['shape Pipe']),
      ...block('element "External"', ['background #999999', 'color #ffffff']),
    ]),
  )

  // The model and the views keep their braces even empty: Structurizr DSL wants the blocks.
  const section = (head: string, body: string[]) => (body.length > 0 ? block(head, body) : [`${head} {`, '}'])
  return [...block(`workspace ${quote(model.title)}`, [...section('model', lines), '', ...section('views', views)]), ''].join('\n')
}
