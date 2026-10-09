import * as Y from 'yjs'
import { architectureModel, labelLines, type ArchNode, type BoundaryKind } from '../architecture/model.ts'
import type { C4Kind, C4Variant, ElementProperties } from '../diagram/elementKinds.ts'
import { elementProperties, kindLabel, labelFormat } from '../diagram/elementProps.ts'
import { elementIdOf, getCells, readCell, type CellData } from '../diagram/model.ts'
import { listPages } from '../diagram/pages.ts'
import { readingOrder } from '../diagram/readingOrder.ts'
import type { CellRef } from '../diagram/sharedElements.ts'
import { findShape } from '../diagram/shapes.ts'
import { listElements } from '../elements/elementList.ts'

/**
 * Checks of the architecture of a board: what a review of a diagram finds again and again — an edge without a label, a
 * container without a technology, two services that use one database — as remarks on the elements of all pages, each
 * with the cells it is about. They are hints and forbid nothing: a remark may be hidden for its element, a rule turned
 * off for the board. Every participant works them out from the document as it changes; the document keeps only the
 * rules turned off and the remarks hidden, so that all participants share them.
 *
 * The checks see the architecture as its export does (see `architecture/model.ts`): the elements of a kind, the frames
 * they lie in, the edges between them. The cells of one shared element on several pages are one element.
 */

/** A rule of the checks. */
export type CheckRule =
  | 'edge-label'
  | 'edge-technology'
  | 'technology'
  | 'description'
  | 'owner'
  | 'isolated'
  | 'nesting'
  | 'cycle'
  | 'shared-database'
  | 'duplicate'

/** A remark tells what is missing; a warning, a case that may be meant so. */
export type CheckLevel = 'remark' | 'warning'

export interface CheckRuleInfo {
  title: string
  level: CheckLevel
  /** What the rule asks for and why. */
  reason: string
  /** A board that has not turned it on or off checks it: only a team that keeps owners on its boards wants the owner. */
  byDefault: boolean
}

/** The rules, in the order of the list of remarks: the completeness of the elements and edges first, the structure after. */
export const CHECK_RULES: Readonly<Record<CheckRule, CheckRuleInfo>> = {
  'edge-label': {
    title: 'Связь без подписи',
    level: 'remark',
    reason: 'Подпись говорит, зачем один элемент обращается к другому: «Читает заказы», «Отправляет события».',
    byDefault: true,
  },
  'edge-technology': {
    title: 'Связь без технологии',
    level: 'remark',
    reason: 'У связи указывают протокол или способ обмена: HTTPS, gRPC, Kafka, JDBC.',
    byDefault: true,
  },
  technology: {
    title: 'Без технологии',
    level: 'remark',
    reason: 'У контейнера и компонента C4 указывают технологию: Kotlin, Spring Boot, PostgreSQL.',
    byDefault: true,
  },
  description: {
    title: 'Элемент C4 без описания',
    level: 'remark',
    reason: 'Нотация C4 требует у элемента короткое описание его ответственности.',
    byDefault: true,
  },
  owner: {
    title: 'Без владельца',
    level: 'remark',
    reason: 'За систему и контейнер отвечает команда: без владельца непонятно, к кому идти с вопросом.',
    byDefault: false,
  },
  isolated: {
    title: 'Элемент без связей',
    level: 'remark',
    reason: 'Элемент ни с чем не связан ни на одной странице: возможно, связь забыли нарисовать.',
    byDefault: true,
  },
  nesting: {
    title: 'Вне границы',
    level: 'remark',
    reason: 'В C4 контейнер лежит внутри границы своей системы, а компонент — внутри границы своего контейнера.',
    byDefault: true,
  },
  cycle: {
    title: 'Цикл зависимостей',
    level: 'warning',
    reason: 'Сервисы зависят друг от друга по кругу: их трудно менять и выкатывать по отдельности.',
    byDefault: true,
  },
  'shared-database': {
    title: 'Общая база данных',
    level: 'warning',
    reason: 'В одну базу ходят разные сервисы: схема базы связывает их изменения.',
    byDefault: true,
  },
  duplicate: {
    title: 'Вероятные дубли',
    level: 'warning',
    reason: 'На разных страницах есть разные элементы с одним именем. Если это одно и то же, объедините их — свойства станут общими.',
    byDefault: true,
  },
}

export const CHECK_RULE_ORDER = Object.keys(CHECK_RULES) as CheckRule[]

const pluralRules = new Intl.PluralRules('ru')

/** «1 замечание», «3 замечания», «5 замечаний». */
export function issuesLabel(count: number): string {
  const words: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'замечание', few: 'замечания', many: 'замечаний' }
  return `${count} ${words[pluralRules.select(count)] ?? 'замечания'}`
}

/** A cell a remark is about, with the name of its page. */
export interface CheckPlace extends CellRef {
  pageName: string
}

/** An element that duplicates may be merged into: one of its cells, its properties and on how many pages it is. */
export interface MergeChoice {
  ref: CellRef
  properties: ElementProperties
  pages: number
}

/** A remark of a rule. */
export interface CheckIssue {
  /** The rule and what the remark is about: the same for the same case while the board changes, to hide it by. */
  key: string
  rule: CheckRule
  /** What the remark is about: an element, an edge «A» → «B», a cycle. */
  subject: string
  /** What of the case the rule found, when the title of the rule does not tell it all; empty otherwise. */
  detail: string
  /** The cells to go to, the first one first. */
  places: CheckPlace[]
  /** Duplicates: the elements to merge. */
  choices?: MergeChoice[]
}

/** An element of the architecture of the board: its cells on all pages, as the export of a page sees each. */
interface BoardElement {
  /** The shared element, or `pageId/cellId` of a shape that is no shared element; as the list of elements keys them. */
  key: string
  name: string
  kind: C4Kind
  variant: C4Variant
  external: boolean
  technology: string
  description: string
  owner: string
  /** Some cell of it has a label of C4. */
  c4: boolean
  places: CheckPlace[]
}

/** An edge between two elements. */
interface BoardLink {
  place: CheckPlace
  source: string
  target: string
  labelled: boolean
  technology: string
}

const named = (name: string) => `«${name || 'Без имени'}»`

/** A name as duplicates are found by: no case, no extra spaces, `ё` as `е`. */
const nameKey = (name: string) => name.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')

/** The name a shape of a kind has when it is put from the palette, and the name of the kind: such names are no names. */
function defaultNames(kind: ElementProperties['kind']): string[] {
  if (kind === null) return []
  const value = findShape(kind)?.value ?? ''
  return [value.split('\n')[0] ?? '', kindLabel(kind)].map(nameKey)
}

/** A service: an element that calls others, not a person, a store of data or a channel of messages. */
const isService = (element: BoardElement | undefined) => element !== undefined && element.variant === 'plain' && element.kind !== 'person'

/** The remarks of all rules on the board, rules turned off and remarks hidden too; see {@link visibleIssues}. */
export function boardChecks(doc: Y.Doc): CheckIssue[] {
  const elements = new Map<string, BoardElement>()
  const links: BoardLink[] = []
  const nesting: CheckIssue[] = []
  // The elements whose cells some edge ends at, the cell itself or a cell in it.
  const connected = new Set<string>()

  for (const page of listPages(doc)) {
    const entries = getCells(doc, page.id)
    // The layers of the page, so that the elements of each count as the elements of the page; then the elements in the
    // order of reading.
    const cells: CellData[] = []
    entries.forEach((entry, id) => {
      if (entry instanceof Y.Map && entry.get('kind') === 'layer') cells.push(readCell(id, entry))
    })
    for (const node of readingOrder(entries)) {
      const entry = entries.get(node.id)
      if (entry instanceof Y.Map) cells.push(readCell(node.id, entry))
    }
    const byId = new Map(cells.map((cell) => [cell.id, cell]))
    const keyOf = (cellId: string) => elementIdOf(byId.get(cellId)?.style) ?? `${page.id}/${cellId}`
    const placeOf = (cellId: string): CheckPlace => ({ pageId: page.id, pageName: page.name, cellId })
    const model = architectureModel(cells, page.name)

    const visit = (nodes: ArchNode[], frames: readonly BoundaryKind[]) => {
      for (const node of nodes) {
        if (node.type === 'boundary') {
          visit(node.children, [...frames, node.kind])
          continue
        }
        const cell = byId.get(node.cellId)!
        const properties = elementProperties(cell.style, cell.value)
        const c4 = labelFormat(cell.style, properties.kind) === 'c4'
        const key = keyOf(node.cellId)
        const known = elements.get(key)
        if (known) {
          known.places.push(placeOf(node.cellId))
          known.c4 ||= c4
        } else {
          elements.set(key, {
            key,
            name: node.name,
            kind: node.kind,
            variant: node.variant,
            external: node.external,
            technology: properties.technology,
            description: properties.description,
            owner: properties.owner,
            c4,
            places: [placeOf(node.cellId)],
          })
        }
        // The frame each element of C4 lies in, on this page.
        const detail =
          c4 && node.kind === 'container' && !frames.includes('system')
            ? 'Контейнер вне границы системы'
            : c4 && node.kind === 'component' && !frames.includes('container')
              ? 'Компонент вне границы контейнера'
              : null
        if (detail) {
          nesting.push({ key: `nesting:${page.id}/${node.cellId}`, rule: 'nesting', subject: named(node.name), detail, places: [placeOf(node.cellId)] })
        }
      }
    }
    visit(model.roots, [])

    for (const cell of cells) {
      if (cell.kind !== 'edge') continue
      for (let id = cell.source; id; id = byId.get(id)?.parent ?? null) connected.add(keyOf(id))
      for (let id = cell.target; id; id = byId.get(id)?.parent ?? null) connected.add(keyOf(id))
    }
    // An edge may also have labels of their own on it.
    const withLabels = new Set(
      cells.filter((cell) => cell.kind === 'vertex' && cell.parent && byId.get(cell.parent)?.kind === 'edge' && labelLines(cell).length > 0).map((cell) => cell.parent),
    )
    for (const relation of model.relations) {
      links.push({
        place: placeOf(relation.edgeId),
        source: keyOf(relation.source.cellId),
        target: keyOf(relation.target.cellId),
        labelled: relation.description !== '' || withLabels.has(relation.edgeId),
        technology: relation.technology,
      })
    }
  }

  const issues: CheckIssue[] = []
  const nameOf = (key: string) => named(elements.get(key)?.name ?? '')

  for (const link of links) {
    const subject = `${nameOf(link.source)} → ${nameOf(link.target)}`
    const at = `${link.place.pageId}/${link.place.cellId}`
    if (!link.labelled) issues.push({ key: `edge-label:${at}`, rule: 'edge-label', subject, detail: '', places: [link.place] })
    if (!link.technology) issues.push({ key: `edge-technology:${at}`, rule: 'edge-technology', subject, detail: '', places: [link.place] })
  }

  for (const element of elements.values()) {
    const subject = named(element.name)
    const issue = (rule: CheckRule, detail = ''): CheckIssue => ({ key: `${rule}:${element.key}`, rule, subject, detail, places: element.places })
    if ((element.kind === 'container' || element.kind === 'component') && !element.technology) {
      issues.push(issue('technology', element.kind === 'component' ? 'Компонент' : 'Контейнер'))
    }
    if (element.c4 && !element.description) issues.push(issue('description'))
    if (((element.kind === 'system' && !element.external) || element.kind === 'container') && !element.owner) issues.push(issue('owner'))
    if (!connected.has(element.key)) issues.push(issue('isolated'))
  }

  issues.push(...nesting)
  issues.push(...cycles(elements, links))

  // A database that services of different elements use.
  for (const element of elements.values()) {
    if (element.variant !== 'database') continue
    const users = new Set<string>()
    for (const link of links) {
      const other = link.source === element.key ? link.target : link.target === element.key ? link.source : null
      if (other !== null && other !== element.key && isService(elements.get(other))) users.add(other)
    }
    if (users.size < 2) continue
    issues.push({
      key: `shared-database:${element.key}`,
      rule: 'shared-database',
      subject: named(element.name),
      detail: `В неё ходят ${[...users].map(nameOf).join(', ')}`,
      places: element.places,
    })
  }

  issues.push(...duplicates(doc))

  const order = new Map(CHECK_RULE_ORDER.map((rule, index) => [rule, index]))
  // A stable sort: the remarks of a rule stay in the order of the pages.
  return issues.sort((a, b) => order.get(a.rule)! - order.get(b.rule)!)
}

/** Cycles of dependencies between services: each set of services that depend on one another, with one cycle of it. */
function cycles(elements: ReadonlyMap<string, BoardElement>, links: readonly BoardLink[]): CheckIssue[] {
  const next = new Map<string, string[]>()
  for (const link of links) {
    if (link.source === link.target || !isService(elements.get(link.source)) || !isService(elements.get(link.target))) continue
    const list = next.get(link.source)
    if (list) list.push(link.target)
    else next.set(link.source, [link.target])
  }
  // Strongly connected components of Tarjan, in the order of the elements.
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const components: string[][] = []
  const connect = (node: string) => {
    index.set(node, index.size)
    low.set(node, index.get(node)!)
    stack.push(node)
    onStack.add(node)
    for (const target of next.get(node) ?? []) {
      if (!index.has(target)) {
        connect(target)
        low.set(node, Math.min(low.get(node)!, low.get(target)!))
      } else if (onStack.has(target)) {
        low.set(node, Math.min(low.get(node)!, index.get(target)!))
      }
    }
    if (low.get(node) !== index.get(node)) return
    const component: string[] = []
    for (let member = stack.pop()!; ; member = stack.pop()!) {
      onStack.delete(member)
      component.push(member)
      if (member === node) break
    }
    if (component.length > 1) components.push(component)
  }
  for (const key of elements.keys()) if (next.has(key) && !index.has(key)) connect(key)

  const keys = [...elements.keys()]
  return components.map((component) => {
    const members = new Set(component)
    const sorted = keys.filter((key) => members.has(key))
    const start = sorted[0]!
    // The shortest way from the first service back to it among the services of the set.
    const from = new Map<string, string>()
    const queue = [start]
    while (queue.length > 0 && !from.has(start)) {
      const node = queue.shift()!
      for (const target of next.get(node) ?? []) {
        if (!members.has(target) || from.has(target)) continue
        from.set(target, node)
        queue.push(target)
      }
    }
    const path = [start]
    for (let node = from.get(start)!; node !== start; node = from.get(node)!) path.unshift(node)
    path.unshift(start)
    const names = path.map((key) => named(elements.get(key)!.name))
    return {
      key: `cycle:${[...sorted].sort().join(',')}`,
      rule: 'cycle' as const,
      subject: names.join(' → '),
      detail: sorted.length > path.length - 1 ? `Сервисов в циклах: ${sorted.length}` : '',
      places: sorted.map((key) => elements.get(key)!.places[0]!),
    }
  })
}

/** Elements of one name on different pages that are not one shared element; names of the palette left as they are skipped. */
function duplicates(doc: Y.Doc): CheckIssue[] {
  const groups = new Map<string, ReturnType<typeof listElements>>()
  for (const item of listElements(doc)) {
    const key = nameKey(item.properties.name)
    if (!key || defaultNames(item.properties.kind).includes(key)) continue
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  const issues: CheckIssue[] = []
  // In the order of the pages: the list of elements sorts them by name.
  const pageIndex = new Map(listPages(doc).map((page, index) => [page.id, index]))
  for (const [key, items] of groups) {
    if (items.length < 2 || new Set(items.flatMap((item) => item.places.map((place) => place.pageId))).size < 2) continue
    const first = (item: (typeof items)[number]) => pageIndex.get(item.places[0]!.pageId) ?? 0
    const sorted = [...items].sort((a, b) => first(a) - first(b))
    issues.push({
      key: `duplicate:${key}`,
      rule: 'duplicate',
      subject: named(sorted[0]!.properties.name),
      detail: `Разные элементы на страницах ${[...new Set(sorted.flatMap((item) => item.places.map((place) => `«${place.pageName}»`)))].join(', ')}`,
      places: sorted.map((item) => ({ pageId: item.places[0]!.pageId, pageName: item.places[0]!.pageName, cellId: item.places[0]!.cellIds[0]! })),
      choices: sorted.map((item) => ({
        ref: { pageId: item.places[0]!.pageId, cellId: item.places[0]!.cellIds[0]! },
        properties: item.properties,
        pages: item.places.length,
      })),
    })
  }
  return issues
}

/** Origin of the changes of the settings of the checks: no history undoes them. */
export const CHECKS_ORIGIN = 'codraw:checks'

/** The settings of the checks of a board: `rule:<rule>` whether a rule is on, `hidden:<key>` for a remark hidden. */
export function getCheckSettings(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('checks')
}

const RULE = 'rule:'
const HIDDEN = 'hidden:'

export interface CheckSettings {
  disabled: ReadonlySet<CheckRule>
  hidden: ReadonlySet<string>
}

export function readCheckSettings(doc: Y.Doc): CheckSettings {
  const disabled = new Set<CheckRule>()
  const hidden = new Set<string>()
  const settings = getCheckSettings(doc)
  for (const rule of CHECK_RULE_ORDER) {
    const on = settings.get(RULE + rule)
    if (!(typeof on === 'boolean' ? on : CHECK_RULES[rule].byDefault)) disabled.add(rule)
  }
  settings.forEach((value, key) => {
    if (value === true && key.startsWith(HIDDEN)) hidden.add(key.slice(HIDDEN.length))
  })
  return { disabled, hidden }
}

/** Turns a rule on or off for the board. */
export function setRuleEnabled(doc: Y.Doc, rule: CheckRule, enabled: boolean) {
  doc.transact(() => getCheckSettings(doc).set(RULE + rule, enabled), CHECKS_ORIGIN)
}

/** Hides a remark for its case, or shows it again. */
export function setIssueHidden(doc: Y.Doc, key: string, hidden: boolean) {
  doc.transact(() => {
    if (hidden) getCheckSettings(doc).set(HIDDEN + key, true)
    else getCheckSettings(doc).delete(HIDDEN + key)
  }, CHECKS_ORIGIN)
}

/** The remarks of the rules that are on: those shown, and those hidden. */
export function visibleIssues(issues: readonly CheckIssue[], settings: CheckSettings): { shown: CheckIssue[]; hidden: CheckIssue[] } {
  const on = issues.filter((issue) => !settings.disabled.has(issue.rule))
  return { shown: on.filter((issue) => !settings.hidden.has(issue.key)), hidden: on.filter((issue) => settings.hidden.has(issue.key)) }
}
