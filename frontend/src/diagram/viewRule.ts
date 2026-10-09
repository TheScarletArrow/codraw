/**
 * The rule of a page that is a view of the model of the board (see `modelViews.ts`): what it shows — the landscape, a
 * system and what is around it, the containers of a system, the components of a container, the deployment of an
 * environment — and the slice of it by teams, tags and technologies. The rule is data of the page; this module only
 * reads and names it, without the document.
 */

/** What a view shows. */
export type ViewKind = 'landscape' | 'context' | 'containers' | 'components' | 'deployment'

export const VIEW_KINDS: readonly ViewKind[] = ['landscape', 'context', 'containers', 'components', 'deployment']

/** The names of the kinds of views, as the window of the rule offers them. */
export const VIEW_KIND_LABELS: Readonly<Record<ViewKind, string>> = {
  landscape: 'Ландшафт',
  context: 'Система и её окружение',
  containers: 'Контейнеры системы',
  components: 'Компоненты контейнера',
  deployment: 'Развёртывание окружения',
}

/** The values of the slice of a view: an element is in it when it has one of the values of each facet with values. */
export interface ViewSlice {
  /** Teams: owners of elements. */
  owners: string[]
  tags: string[]
  technologies: string[]
}

export type SliceFacet = keyof ViewSlice

export const SLICE_FACETS: readonly SliceFacet[] = ['owners', 'tags', 'technologies']

export const SLICE_LABELS: Readonly<Record<SliceFacet, string>> = { owners: 'Команды', tags: 'Теги', technologies: 'Технологии' }

export interface ViewRule extends ViewSlice {
  kind: ViewKind
  /** The element the view is about: the system of `context` and `containers`, the container of `components`. */
  scope: string | null
  /** The environment of `deployment`; `''` for the nodes of none. */
  environment: string | null
}

/** Style key of a cell that a view computed rather than somebody drew: the key of what it shows. */
export const COMPUTED_KEY = 'codrawComputed'

/** The kind needs an element it is about. */
export const hasScope = (kind: ViewKind) => kind === 'context' || kind === 'containers' || kind === 'components'

const isViewKind = (value: unknown): value is ViewKind => typeof value === 'string' && (VIEW_KINDS as readonly string[]).includes(value)

const words = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))] : []

/** The rule of a value of the document, e.g. of another version of the app; `null` for anything that is none. */
export function readViewRule(value: unknown): ViewRule | null {
  if (typeof value !== 'object' || value === null) return null
  const data = value as Record<string, unknown>
  if (!isViewKind(data.kind)) return null
  const scope = typeof data.scope === 'string' && data.scope !== '' ? data.scope : null
  const environment = typeof data.environment === 'string' ? data.environment.trim() : null
  return {
    kind: data.kind,
    scope: hasScope(data.kind) ? scope : null,
    environment: data.kind === 'deployment' ? (environment ?? '') : null,
    owners: words(data.owners),
    tags: words(data.tags),
    technologies: words(data.technologies),
  }
}

/** The rule as the document keeps it: a plain object without empty fields. */
export function viewRuleData(rule: ViewRule): Record<string, string | string[]> {
  const data: Record<string, string | string[]> = { kind: rule.kind }
  if (hasScope(rule.kind) && rule.scope) data.scope = rule.scope
  if (rule.kind === 'deployment') data.environment = rule.environment ?? ''
  for (const facet of SLICE_FACETS) if (rule[facet].length > 0) data[facet] = [...rule[facet]]
  return data
}

export const sameViewRule = (a: ViewRule, b: ViewRule) => JSON.stringify(viewRuleData(a)) === JSON.stringify(viewRuleData(b))

/** The slice has values. */
export const isSliced = (slice: ViewSlice) => SLICE_FACETS.some((facet) => slice[facet].length > 0)

/** What is written about an environment: its name, or «без окружения». */
export const environmentLabel = (environment: string) => environment || 'без окружения'

/**
 * The name of a new page of the view: «Ландшафт», «Магазин: окружение», «Магазин: контейнеры», «API: компоненты»,
 * «Развёртывание: prod»; `scopeName` is the name of the element it is about.
 */
export function viewPageName(rule: ViewRule, scopeName: string): string {
  const name = scopeName.trim() || 'Без имени'
  switch (rule.kind) {
    case 'landscape':
      return 'Ландшафт'
    case 'context':
      return `${name}: окружение`
    case 'containers':
      return `${name}: контейнеры`
    case 'components':
      return `${name}: компоненты`
    case 'deployment':
      return `Развёртывание: ${environmentLabel(rule.environment ?? '')}`
  }
}

/** What the view shows, for its bar: «Контейнеры системы Магазин», «Развёртывание окружения prod». */
export function viewTitle(rule: ViewRule, scopeName: string): string {
  const name = scopeName.trim() || 'без имени'
  switch (rule.kind) {
    case 'landscape':
      return 'Ландшафт'
    case 'context':
      return `Система ${name} и её окружение`
    case 'containers':
      return `Контейнеры системы ${name}`
    case 'components':
      return `Компоненты контейнера ${name}`
    case 'deployment':
      return rule.environment ? `Развёртывание окружения ${rule.environment}` : 'Развёртывание узлов без окружения'
  }
}

/** The slice of a rule as text: «Команды: Платежи · Теги: pci»; `''` without one. */
export function sliceLabel(slice: ViewSlice): string {
  return SLICE_FACETS.filter((facet) => slice[facet].length > 0)
    .map((facet) => `${SLICE_LABELS[facet]}: ${slice[facet].join(', ')}`)
    .join(' · ')
}
