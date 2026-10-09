import type { ApiSource } from '../apiSpec/loadDocument.ts'
import type { C4Kind, C4Variant } from '../diagram/elementKinds.ts'
import { ArchitectureSyntaxError, readTags, webLink, type ArchitectureBuilder, type Place } from './importModel.ts'

/**
 * The macros of C4-PlantUML and of Mermaid C4, which are the same: elements, boundaries, nodes of deployment and
 * relations, with their arguments by place and by name. Nothing of the preprocessor of PlantUML runs and nothing is
 * included: the macros of the library of C4 are known as they are. The file is read in two passes, as Structurizr DSL is:
 * its statements first, so that an error of syntax keeps the whole file out of the model.
 */

/** An argument of a macro: `"API"`, `api`, or `$tags="core"`. */
interface Argument {
  name: string | null
  value: string
}

type Statement =
  | { line: number; type: 'close' }
  | { line: number; type: 'macro'; name: string; args: Argument[]; opens: boolean }
  | { line: number; type: 'directive'; directive: string; argument: string }
  | { line: number; type: 'other'; text: string; opens: boolean }

const syntaxError = (line: number, message: string) => new ArchitectureSyntaxError(`строка ${line} — ${message}`)

/** How deep the parentheses of a text are, outside its strings; `null` when a string is not closed. */
function depth(text: string): number | null {
  let quoted = false
  let level = 0
  for (const char of text) {
    if (char === '"') quoted = !quoted
    else if (!quoted && char === '(') level += 1
    else if (!quoted && char === ')') level -= 1
  }
  return quoted ? null : level
}

/** The arguments of a macro: split by the commas outside strings and parentheses; a string without its quotes. */
function splitArguments(text: string): Argument[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  let level = 0
  for (const char of text) {
    if (char === '"') quoted = !quoted
    if (!quoted && char === '(') level += 1
    if (!quoted && char === ')') level -= 1
    if (!quoted && level === 0 && char === ',') {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim() !== '' || parts.length > 0) parts.push(current)
  return parts.map((part) => {
    const named = /^\s*\$(\w+)\s*=\s*([\s\S]*)$/.exec(part)
    const raw = (named ? named[2]! : part).trim()
    const value = /^"[\s\S]*"$/.test(raw) ? raw.slice(1, -1) : raw
    return { name: named ? named[1]!.toLowerCase() : null, value }
  })
}

/** Directives of the preprocessor whose body runs to their end: the body is left out with them. */
const BODIES: Readonly<Record<string, string>> = {
  '!procedure': '!endprocedure',
  '!function': '!endfunction',
  '!definelong': '!enddefinelong',
  '!startsub': '!endsub',
}

/** Lines that say how a diagram looks, which the import leaves out without a word. */
const QUIET_LINE = /^(@start\w*|@end\w*|title\b|caption\b|header\b|footer\b|scale\b|hide\b|show\b|skinparam\b|left to right direction|top to bottom direction|C4(Context|Container|Component|Dynamic|Deployment)\b)/i

/** The statements of a text: comments left out, macros on several lines joined, blocks checked. */
function statements(text: string): Statement[] {
  const lines = text.replace(/^﻿/, '').split(/\r\n?|\n/)
  const result: Statement[] = []
  const open: number[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = index + 1
    let content = lines[index]!
    // A comment of PlantUML between `/'` and `'/`, on one line or several.
    const comment = content.indexOf("/'")
    if (comment >= 0) {
      let end = content.indexOf("'/", comment + 2)
      let rest = ''
      if (end >= 0) rest = content.slice(end + 2)
      else {
        while (end < 0 && index + 1 < lines.length) end = lines[++index]!.indexOf("'/")
        if (end < 0) throw syntaxError(line, 'не закрыт комментарий')
        rest = lines[index]!.slice(end + 2)
      }
      content = content.slice(0, comment) + rest
    }
    let trimmed = content.trim()
    if (trimmed === '' || trimmed.startsWith("'") || trimmed.startsWith('%%')) continue
    // A macro whose arguments go on to the next lines.
    let level = depth(trimmed)
    while (level !== null && level > 0 && index + 1 < lines.length) {
      trimmed += ` ${lines[++index]!.trim()}`
      level = depth(trimmed)
    }
    if (level === null) throw syntaxError(line, 'не закрыта кавычка')
    if (level > 0) throw syntaxError(line, 'не закрыта скобка')

    if (trimmed === '}') {
      if (open.pop() === undefined) throw syntaxError(line, 'лишняя }')
      result.push({ line, type: 'close' })
      continue
    }
    if (trimmed === '{') {
      // The block of the boundary on the line before.
      const previous = result.at(-1)
      if (previous && (previous.type === 'macro' || previous.type === 'other') && !previous.opens) {
        previous.opens = true
        open.push(line)
        continue
      }
      throw syntaxError(line, '{ должна быть последней на строке')
    }
    const directive = /^(!\$?[\w]+)\s*(.*)$/.exec(trimmed)
    if (directive) {
      const name = directive[1]!.toLowerCase()
      const ending = BODIES[name] ?? (name === '!unquoted' ? BODIES[`!${directive[2]!.split(/\s/)[0]!.toLowerCase()}`] : undefined)
      if (ending) while (index + 1 < lines.length && !lines[index + 1]!.trim().toLowerCase().startsWith(ending)) index += 1
      if (ending && index + 1 < lines.length) index += 1
      result.push({ line, type: 'directive', directive: directive[1]!, argument: directive[2]!.trim() })
      continue
    }
    if (/^(legend|note)\b/i.test(trimmed) && !/^note\b.*:/i.test(trimmed)) {
      // A legend or a note on several lines, to its end.
      const ending = /^legend/i.test(trimmed) ? /^end\s*legend\b/i : /^end\s*note\b/i
      while (index + 1 < lines.length && !ending.test(lines[index + 1]!.trim())) index += 1
      if (index + 1 < lines.length) index += 1
      result.push({ line, type: 'other', text: trimmed, opens: false })
      continue
    }
    const macro = /^([A-Za-z_]\w*)\s*\(([\s\S]*)\)\s*(\{)?$/.exec(trimmed)
    if (macro) {
      const opens = macro[3] !== undefined
      if (opens) open.push(line)
      result.push({ line, type: 'macro', name: macro[1]!, args: splitArguments(macro[2]!), opens })
      continue
    }
    // A block of a line that is no macro, as `skinparam rectangle {` or `package "Ядро" {`; braces inside a line are text.
    if (trimmed.startsWith('}')) throw syntaxError(line, '} должна быть одна на строке')
    const opens = trimmed.endsWith('{')
    if (opens) open.push(line)
    result.push({ line, type: 'other', text: opens ? trimmed.slice(0, -1).trim() : trimmed, opens })
  }
  if (open.length > 0) throw new ArchitectureSyntaxError(`не закрыт блок, открытый в строке ${open[0]}`)
  return result
}

/** The names of the arguments of the macros by their place. */
const SIGNATURES = {
  context: ['alias', 'label', 'descr', 'sprite', 'tags', 'link', 'type'],
  container: ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link', 'baseshape'],
  boundary: ['alias', 'label', 'tags', 'link', 'descr'],
  group: ['alias', 'label', 'type', 'tags', 'link', 'descr'],
  node: ['alias', 'label', 'type', 'descr', 'sprite', 'tags', 'link'],
  relation: ['from', 'to', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'],
} as const

/** The values of the arguments by their names: those given by place, and those given by name over them. */
function bind(args: Argument[], names: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {}
  let at = 0
  for (const arg of args) {
    if (arg.name) values[arg.name] = arg.value
    else if (at < names.length) values[names[at++]!] = arg.value
  }
  return values
}

/** `\n` of C4 is a new line of a description, and a space in a name or a technology. */
const line = (value: string | undefined) => (value ?? '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
const lines = (value: string | undefined) => (value ?? '').replace(/\\n/g, '\n').trim()

const ELEMENT = /^(Person|System|Container|Component)(Db|Queue)?(_Ext)?$/
const RELATION = /^(Bi)?Rel(Index)?(?:_(U|Up|D|Down|L|Left|R|Right|Back|Neighbor|Back_Neighbor))?$/
const NODE = /^(Deployment_Node|Node)(_L|_R)?$/
/** Macros of the look and the layout, which the layout of CoDraw replaces. */
const STYLE = /^(Add|Update|Set|Show|Hide|SHOW_|HIDE_|LAYOUT_|Layout|Lay_|Without|increment$|setIndex$|LastIndex$|Index$)/

/** The library of C4, whose macros the import knows: `<C4/C4_Container>`, or a file of C4-PlantUML on the web. */
const isC4Library = (target: string) => /^<C4\/|C4-PlantUML|C4_(Context|Container|Component|Deployment|Dynamic|Sequence)(\.puml)?>?$/i.test(target.trim())

/**
 * Reads the elements, boundaries and relations of a diagram of C4-PlantUML or Mermaid C4 into `builder`. Throws
 * {@link ArchitectureSyntaxError} before declaring anything when the syntax of the file is wrong.
 */
export function parseC4Macros({ name: file, text }: ApiSource, builder: ArchitectureBuilder) {
  const list = statements(text)
  /** The keys of the aliases of the file: an alias of another file's element of the same name is that element. */
  const keys = new Map<string, string>()
  const place = (at: number): Place => ({ file, line: at })
  const resolve = (alias: string) => keys.get(alias) ?? (builder.node(alias) ? alias : null)
  /** The blocks the statement is in: the node of each, and whether it says only how the diagram looks, as `skinparam`. */
  const stack: { parent: string | null; quiet: boolean }[] = [{ parent: null, quiet: false }]

  for (const statement of list) {
    const { parent, quiet } = stack.at(-1)!
    const at = place(statement.line)
    if (statement.type === 'close') {
      stack.pop()
      continue
    }
    if (quiet) {
      if (statement.type !== 'directive' && statement.opens) stack.push({ parent, quiet })
      continue
    }
    if (statement.type === 'directive') {
      const name = statement.directive.toLowerCase()
      if (['!include', '!includeurl', '!include_many', '!include_once', '!import'].includes(name)) {
        if (!isC4Library(statement.argument)) {
          builder.warn(at, `${statement.directive} ${statement.argument} не выполняется: откройте этот файл вместе с остальными`)
        }
      } else if (name !== '!theme' && name !== '!pragma') {
        builder.warn(at, `препроцессор PlantUML не выполняется: ${statement.directive}`)
      }
      continue
    }
    if (statement.type === 'other') {
      const known = QUIET_LINE.test(statement.text) || /^legend\b/i.test(statement.text)
      if (!known) builder.warn(at, /^note\b/i.test(statement.text) ? 'заметки не переносятся' : `строка не разобрана: ${statement.text.slice(0, 40)}`)
      // The parameters of the look in a block of `skinparam` are left out with it; macros in other blocks are read.
      if (statement.opens) stack.push({ parent, quiet: /^skinparam\b/i.test(statement.text) })
      continue
    }

    const { name, args } = statement
    let opened: string | null = parent
    const element = ELEMENT.exec(name)
    const relation = RELATION.exec(name)
    const node = NODE.exec(name)
    if (element) {
      const kind = element[1]!.toLowerCase() as C4Kind
      const values = bind(args, kind === 'person' || kind === 'system' ? SIGNATURES.context : SIGNATURES.container)
      const variant: C4Variant | undefined = element[2] === 'Db' ? 'database' : element[2] === 'Queue' ? 'queue' : undefined
      const alias = values.alias ?? ''
      const tags = readTags((values.tags ?? '').split('+'))
      const key = builder.element(
        {
          key: alias,
          kind,
          name: line(values.label),
          technology: line(values.techn),
          description: lines(values.descr),
          link: webLink(values.link),
          parent,
          ...tags,
          variant: variant ?? tags.variant,
          external: element[3] !== undefined || tags.external,
        },
        at,
      )
      if (key) keys.set(alias, key)
      opened = key ?? parent
    } else if (name === 'System_Boundary' || name === 'Container_Boundary') {
      const values = bind(args, SIGNATURES.boundary)
      const alias = values.alias ?? ''
      const key = builder.element(
        {
          key: alias,
          kind: name === 'System_Boundary' ? 'system' : 'container',
          name: line(values.label),
          description: lines(values.descr),
          link: webLink(values.link),
          parent,
          ...readTags((values.tags ?? '').split('+')),
        },
        at,
      )
      if (key) keys.set(alias, key)
      opened = key ?? parent
    } else if (name === 'Boundary' || name === 'Enterprise_Boundary' || node) {
      const values = bind(args, node ? SIGNATURES.node : name === 'Boundary' ? SIGNATURES.group : SIGNATURES.boundary)
      const alias = values.alias ?? ''
      const key = builder.group(
        { key: alias, kind: node ? 'deployment' : 'group', name: line(values.label), technology: node ? line(values.type) : '', description: lines(values.descr), parent },
        at,
      )
      if (key) keys.set(alias, key)
      opened = key ?? parent
    } else if (relation) {
      const values = bind(relation[2] ? args.slice(1) : args, SIGNATURES.relation)
      const back = relation[3] === 'Back' || relation[3] === 'Back_Neighbor'
      const [source, target] = back ? [values.to ?? '', values.from ?? ''] : [values.from ?? '', values.to ?? '']
      const description = line(values.label) || line(values.descr)
      const technology = line(values.techn)
      builder.relation({ source, target, description, technology, resolve, place: at })
      if (relation[1]) builder.relation({ source: target, target: source, description, technology, resolve, place: at })
    } else if (!STYLE.test(name)) {
      builder.warn(at, `не поддерживается: ${name}(…)`)
    }
    if (statement.opens) stack.push({ parent: opened, quiet: false })
  }
}
