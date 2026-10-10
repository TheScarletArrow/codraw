import type { ApiSource } from '../apiSpec/loadDocument.ts'
import type { C4Kind } from '../diagram/elementKinds.ts'
import { ArchitectureSyntaxError, readTags, webLink, type ArchitectureBuilder, type Place, type RelationDeclaration } from './importModel.ts'

/**
 * Structurizr DSL as an import of architecture reads it: the model of a workspace — people, software systems,
 * containers and components, groups, relationships and their properties — and nothing it would have to run or load.
 * The file is read in two passes: its statements first, so that an error of syntax keeps the whole file out of the model,
 * then what they declare.
 */

interface Token {
  text: string
  quoted: boolean
}

/** A line of the DSL: its words, and whether it opens a block; `}` closes one. */
type Statement = { line: number; close: true } | { line: number; close?: false; tokens: Token[]; opens: boolean }

const syntaxError = (line: number, message: string) => new ArchitectureSyntaxError(`строка ${line} — ${message}`)

/** The words of a line: strings in quotes with `\"` and `\\` in them, `"""` text blocks, and words between spaces. */
function tokenize(text: string, line: number): Token[] {
  const tokens: Token[] = []
  let at = 0
  while (at < text.length) {
    const char = text[at]!
    if (/\s/.test(char)) {
      at += 1
    } else if (text.startsWith('"""', at)) {
      const end = text.indexOf('"""', at + 3)
      if (end < 0) throw syntaxError(line, 'не закрыта кавычка')
      tokens.push({ text: dedent(text.slice(at + 3, end)), quoted: true })
      at = end + 3
    } else if (char === '"') {
      let value = ''
      let closed = false
      for (at += 1; at < text.length; at++) {
        const next = text[at]!
        if (next === '\\' && (text[at + 1] === '"' || text[at + 1] === '\\')) {
          value += text[at + 1]
          at += 1
        } else if (next === '"') {
          closed = true
          at += 1
          break
        } else {
          value += next
        }
      }
      if (!closed) throw syntaxError(line, 'не закрыта кавычка')
      tokens.push({ text: value, quoted: true })
    } else {
      let end = at
      while (end < text.length && !/\s/.test(text[end]!) && text[end] !== '"') end += 1
      // `a->b` and `model{` are read as they would be with spaces; braces inside a word, as in an address, stay.
      const word = text.slice(at, end)
      const arrow = /^([\w.-]+?)(-\/?>)([\w.-]+)$/.exec(word)
      const parts = arrow ? arrow.slice(1) : word.length > 1 && word.endsWith('{') ? [word.slice(0, -1), '{'] : [word]
      for (const part of parts) tokens.push({ text: part, quoted: false })
      at = end
    }
  }
  return tokens
}

/** A text block without the indent its lines share and without the blank lines around it. */
function dedent(text: string): string {
  const lines = text.replace(/^[ \t]*\n|\n[ \t]*$/g, '').split('\n')
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => /^[ \t]*/.exec(line)![0].length))
  return lines.map((line) => line.slice(Number.isFinite(indent) ? indent : 0)).join('\n')
}

/** The statements of a text: comments left out, continued lines and text blocks joined, blocks checked. */
function statements(text: string): Statement[] {
  const lines = text.replace(/^﻿/, '').split(/\r\n?|\n/)
  const result: Statement[] = []
  const open: number[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = index + 1
    let content = lines[index]!
    const trimmed = content.trim()
    if (trimmed.startsWith('/*')) {
      let end = trimmed.indexOf('*/', 2)
      while (end < 0 && index + 1 < lines.length) end = lines[++index]!.indexOf('*/')
      if (end < 0) throw syntaxError(line, 'не закрыт комментарий')
      continue
    }
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('//')) continue
    // A line that ends with `\` goes on in the next one; a text block goes on to its closing quotes.
    while (/\\\s*$/.test(content) && index + 1 < lines.length) content = content.replace(/\\\s*$/, ' ') + lines[++index]!
    while ((content.split('"""').length - 1) % 2 === 1 && index + 1 < lines.length) content += `\n${lines[++index]!}`
    const tokens = tokenize(content, line)
    if (tokens.length === 0) continue
    const braces = tokens.filter((token) => !token.quoted && (token.text === '{' || token.text === '}'))
    if (tokens.length === 1 && braces.length === 1 && tokens[0]!.text === '}') {
      if (open.pop() === undefined) throw syntaxError(line, 'лишняя }')
      result.push({ line, close: true })
      continue
    }
    if (braces.some((token) => token.text === '}')) throw syntaxError(line, '} должна быть одна на строке')
    const opens = braces.length > 0
    if (braces.length > 1 || (opens && tokens.at(-1) !== braces[0])) throw syntaxError(line, '{ должна быть последней на строке')
    if (opens) open.push(line)
    result.push({ line, tokens: opens ? tokens.slice(0, -1) : tokens, opens })
  }
  if (open.length > 0) throw new ArchitectureSyntaxError(`не закрыт блок, открытый в строке ${open[0]}`)
  return result
}

/** The area a block of the DSL is: what a statement in it declares, and what it belongs to. */
interface Area {
  kind: 'root' | 'workspace' | 'model' | 'element' | 'group' | 'relationship' | 'skip'
  /** The key of the node that elements and groups declared in it lie in. */
  parent: string | null
  /** The element that `this` and a relationship without a source name, with its path of identifiers. */
  element: { key: string; path: string } | null
  relation?: RelationDeclaration
}

const ELEMENT_KINDS: Readonly<Record<string, C4Kind>> = {
  person: 'person',
  softwaresystem: 'system',
  container: 'container',
  component: 'component',
}

/** Blocks that the import does not need and leaves out without a word: the layout is its own. */
const QUIET_BLOCKS: ReadonlySet<string> = new Set(['views', 'configuration', 'properties', 'perspectives', 'styles', 'themes', 'branding', 'terminology'])

/** Statements of deployment, which only an environment of deployment has. */
const DEPLOYMENT: ReadonlySet<string> = new Set([
  'deploymentenvironment',
  'deploymentnode',
  'infrastructurenode',
  'softwaresysteminstance',
  'containerinstance',
  'deploymentgroup',
  'healthcheck',
])

const INCLUDES: ReadonlySet<string> = new Set(['!include', '!script', '!plugin'])

/**
 * Reads the model of a workspace of Structurizr DSL, or of a fragment of a model that a workspace includes, into
 * `builder`. Throws {@link ArchitectureSyntaxError} before declaring anything when the syntax of the file is wrong.
 */
export function parseStructurizr({ name: file, text }: ApiSource, builder: ArchitectureBuilder) {
  const list = statements(text)
  let hierarchical = false
  const constants = new Map<string, string>()
  /** Identifiers of the file, by their path when they are hierarchical, and the keys of the elements they name. */
  const identifiers = new Map<string, string>()
  /** Identifiers of elements left out as unsupported: relationships with them need no warning of their own. */
  const skipped = new Set<string>()
  const place = (line: number): Place => ({ file, line })
  const substitute = (value: string) => value.replace(/\$\{([\w.-]+)\}/g, (whole, name: string) => constants.get(name) ?? whole)

  // A file without a workspace is a fragment of a model, as a workspace includes one.
  const first = list.find((statement) => !statement.close && !statement.tokens[0]?.text.startsWith('!'))
  const fragment = !(first && !first.close && first.tokens[0]?.text.toLowerCase() === 'workspace')
  const stack: Area[] = [{ kind: fragment ? 'model' : 'root', parent: null, element: null }]

  /** The key a reference names: an identifier of the file, of an enclosing element, or a key of the model. */
  const resolver =
    (paths: string[]) =>
    (reference: string): string | null | undefined => {
      const id = reference.toLowerCase()
      for (const candidate of [...paths.map((path) => `${path}.${id}`), id]) {
        const key = identifiers.get(candidate)
        if (key !== undefined) return builder.node(key) ? key : null
      }
      if (skipped.has(id)) return undefined
      return builder.node(id) ? id : null
    }
  /** The paths of identifiers of the elements a statement is in, the innermost first. */
  const enclosing = () => (hierarchical ? stack.flatMap((area) => (area.element ? [area.element.path] : [])).reverse() : [])

  const declareElement = (area: Area, identifier: string | null, kind: C4Kind, args: string[], line: number): Area | null => {
    const [name = '', description = '', ...rest] = args
    const [technology, tags] = kind === 'container' || kind === 'component' ? [rest[0] ?? '', rest[1] ?? ''] : ['', rest[0] ?? '']
    const owner = area.element
    const path = identifier ? (hierarchical && owner ? `${owner.path}.${identifier.toLowerCase()}` : identifier.toLowerCase()) : null
    const key = path ?? `${owner ? `${owner.key}/` : ''}${name.toLowerCase()}`
    const declared = builder.element({ key, kind, name, description, technology, ...readTags(tags.split(',')), parent: area.parent }, place(line))
    if (path && declared) identifiers.set(path, declared)
    return declared ? { kind: 'element', parent: declared, element: { key: declared, path: path ?? declared } } : null
  }

  const relationship = (area: Area, words: Token[], line: number): Area | null => {
    const arrow = words.findIndex((token) => !token.quoted && (token.text === '->' || token.text === '-/>'))
    const sourceName = arrow === 0 ? 'this' : (words[arrow - 1]?.text ?? '')
    const target = words[arrow + 1]?.text ?? ''
    const [description = '', technology = ''] = words.slice(arrow + 2).map((token) => token.text)
    if (arrow > 1 || !target) {
      builder.warn(place(line), 'не поддерживается: отношение без источника или цели')
      return null
    }
    const self = (name: string) => name.toLowerCase() === 'this'
    if ((self(sourceName) || self(target)) && !area.element) {
      builder.warn(place(line), 'this вне элемента: отношение пропущено')
      return null
    }
    const own = area.element?.key ?? ''
    const resolve = resolver(enclosing())
    const relation: RelationDeclaration = {
      source: self(sourceName) ? own : sourceName,
      target: self(target) ? own : target,
      description,
      technology,
      resolve: (reference) => (reference === own && own ? own : resolve(reference)),
      place: place(line),
    }
    builder.relation(relation)
    return { kind: 'relationship', parent: area.parent, element: area.element, relation }
  }

  /** The area a statement opens, `null` for a block left out; declares what the statement declares. */
  const statement = (area: Area, tokens: Token[], line: number): Area | null => {
    const words = tokens.map((token) => ({ ...token, text: substitute(token.text) }))
    const assigned = words.length >= 3 && !words[0]!.quoted && words[1]!.text === '=' && !words[1]!.quoted
    const identifier = assigned ? words[0]!.text : null
    const rest = assigned ? words.slice(2) : words
    const keyword = rest[0]?.quoted ? '' : (rest[0]?.text.toLowerCase() ?? '')
    const args = rest.slice(1).map((token) => token.text)
    const warn = (message: string) => builder.warn(place(line), message)

    if (area.kind === 'relationship') {
      const relation = area.relation!
      if (keyword === 'description') relation.description = args[0] ?? ''
      else if (keyword === 'technology') relation.technology = args[0] ?? ''
      else if (!['tags', 'url', 'properties', 'perspectives', 'interactionstyle'].includes(keyword)) warn(`не поддерживается: ${rest[0]?.text ?? ''}`)
      return null
    }
    // Directives and blocks the import leaves out, in every area.
    if (keyword === '!identifiers') {
      hierarchical = args[0]?.toLowerCase() === 'hierarchical'
      return null
    }
    if (keyword === '!const' || keyword === '!constant' || keyword === '!var') {
      if (args[0]) constants.set(args[0], args[1] ?? '')
      return null
    }
    if (keyword === '!impliedrelationships') return null
    if (INCLUDES.has(keyword)) {
      warn(keyword === '!include' ? `!include ${args[0] ?? ''} не выполняется: откройте этот файл вместе с остальными` : `${keyword} не выполняется`)
      return null
    }
    if (keyword === '!docs' || keyword === '!adrs') {
      warn('документация и решения (!docs, !adrs) не переносятся')
      return null
    }
    if (QUIET_BLOCKS.has(keyword) || keyword === 'name' || (area.kind !== 'element' && keyword === 'description')) return null

    if (area.kind === 'root') {
      if (keyword === 'workspace') {
        if (args[0]?.toLowerCase() === 'extends') warn(`базовое пространство ${args[1] ?? ''} не загружается: откройте его вместе с этим файлом`)
        return { kind: 'workspace', parent: null, element: null }
      }
      warn(`не поддерживается: ${rest[0]?.text ?? ''}`)
      return null
    }
    if (area.kind === 'workspace') {
      if (keyword === 'model') return { kind: 'model', parent: null, element: null }
      warn(`не поддерживается: ${rest[0]?.text ?? ''}`)
      return null
    }
    if (rest.some((token) => !token.quoted && (token.text === '->' || token.text === '-/>'))) return relationship(area, rest, line)
    if (area.kind === 'element' && area.element) {
      const key = area.element.key
      const value = args[0] ?? ''
      if (keyword === 'description' || keyword === 'technology') {
        builder.extend(key, { [keyword]: value })
        return null
      }
      if (keyword === 'tags') {
        builder.extend(key, { tags: args.flatMap((tag) => tag.split(',')) })
        return null
      }
      if (keyword === 'url') {
        builder.extend(key, { link: webLink(value) })
        return null
      }
    }
    const kind = ELEMENT_KINDS[keyword]
    if (kind) return declareElement(area, identifier, kind, args, line)
    if (keyword === 'group' || keyword === 'enterprise') {
      const name = args[0] ?? ''
      const key = builder.group({ key: `group:${area.parent ?? ''}/${name.toLowerCase()}`, kind: 'group', name, parent: area.parent }, place(line))
      return { kind: 'group', parent: key ?? area.parent, element: area.element }
    }
    if (keyword === '!element' || keyword === '!extend' || keyword === '!ref') {
      const key = resolver(enclosing())(args[0] ?? '')
      if (key && builder.node(key)?.type === 'element') return { kind: 'element', parent: key, element: { key, path: (args[0] ?? '').toLowerCase() } }
      if (key !== undefined) warn(`нет элемента ${args[0] ?? ''}: блок пропущен`)
      return null
    }
    if (keyword === 'element') {
      if (identifier) skipped.add(identifier.toLowerCase())
      warn('элементы произвольного вида (element) не переносятся')
      return null
    }
    if (DEPLOYMENT.has(keyword)) {
      if (identifier) skipped.add(identifier.toLowerCase())
      warn(keyword === 'deploymentenvironment' ? `развёртывание «${args[0] ?? ''}» не переносится` : `развёртывание не переносится: ${rest[0]!.text}`)
      return null
    }
    warn(`не поддерживается: ${rest[0]?.text ?? ''}`)
    return null
  }

  for (const item of list) {
    if (item.close) {
      stack.pop()
      continue
    }
    const area = stack.at(-1)!
    const next = area.kind === 'skip' ? null : statement(area, item.tokens, item.line)
    if (item.opens) stack.push(next ?? { kind: 'skip', parent: null, element: null })
  }
}
