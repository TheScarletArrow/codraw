import type { ErrorCode } from 'yaml'
import { documentMessages } from './messages.ts'

/** A document to import and where it came from: the name of its file, or «Текст». */
export interface ApiSource {
  name: string
  text: string
  /** The size of the file in bytes, when it is known without reading it: a file too large is not read at all. */
  size?: number
}

/** Why a document cannot be imported, with the name of its source, e.g. `petstore.yaml: строка 3, столбец 5 — …`. */
export class ApiSpecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiSpecError'
  }
}

/** The largest document read: larger ones take long to parse and give more than a board can show. */
export const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024

/** Aliases of YAML anchors in a document, against documents that expand into gigabytes («billion laughs»). */
const MAX_ALIASES = 100

let yaml: Promise<typeof import('yaml')> | null = null

/**
 * The YAML library is large next to the rest of the import: it is loaded with the first document it reads, as a chunk
 * of its own. A load that failed, e.g. without a connection, is tried again with the next document.
 */
const loadYaml = () =>
  (yaml ??= import('yaml').catch((error: unknown) => {
    yaml = null
    throw error
  }))

/** Reasons of the errors of YAML that people make most, in the words of the interface. */
const REASONS: Partial<Record<ErrorCode, keyof typeof documentMessages.yamlReasons>> = {
  BAD_INDENT: 'badIndent',
  TAB_AS_INDENT: 'tabAsIndent',
  DUPLICATE_KEY: 'duplicateKey',
  MISSING_CHAR: 'missingChar',
  MULTIPLE_DOCS: 'multipleDocs',
  BAD_ALIAS: 'badAlias',
  MULTILINE_IMPLICIT_KEY: 'multilineKey',
  BLOCK_AS_IMPLICIT_KEY: 'multilineKey',
  UNEXPECTED_TOKEN: 'unexpectedToken',
}

/** The line and the column, both from 1, of an offset in the text. */
export function position(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)))
  const lineStart = before.lastIndexOf('\n') + 1
  return { line: before.split('\n').length, column: before.length - lineStart + 1 }
}

/**
 * The value of a document of JSON or YAML. JSON is read without the YAML library; JSON that does not parse goes to it
 * too, since YAML 1.2 reads JSON and tells the line and the column of an error, which `JSON.parse` of Chrome does not.
 * Throws {@link ApiSpecError} for a document larger than `limit`, with an error of syntax or with too many aliases.
 */
export async function loadDocument({ name, text, size }: ApiSource, limit = MAX_DOCUMENT_SIZE): Promise<unknown> {
  if ((size ?? text.length) > limit) throw new ApiSpecError(documentMessages.tooLarge(name, limit / 1024 / 1024))
  const source = text.replace(/^\uFEFF/, '')
  if (/^\s*\{/.test(source)) {
    try {
      return JSON.parse(source) as unknown
    } catch {
      // The YAML library below finds where the error is.
    }
  }
  let parseDocument: typeof import('yaml').parseDocument
  try {
    ;({ parseDocument } = await loadYaml())
  } catch {
    throw new ApiSpecError(documentMessages.yamlUnavailable(name))
  }
  return documentValue(name, source, parseDocument(source, { prettyErrors: false, uniqueKeys: true }))
}

/** The value of a parsed document of YAML, or the error of its syntax with its line and column in the text. */
function documentValue(name: string, source: string, document: import('yaml').Document.Parsed): unknown {
  const error = document.errors[0]
  if (error) {
    const { line, column } = position(source, error.pos[0])
    throw new ApiSpecError(documentMessages.syntaxError(name, line, column, documentMessages.yamlReasons[REASONS[error.code] ?? 'other']))
  }
  try {
    return document.toJS({ maxAliasCount: MAX_ALIASES }) as unknown
  } catch {
    throw new ApiSpecError(documentMessages.tooManyAliases(name))
  }
}

/**
 * The values of the documents of a file of JSON or YAML, which may hold several documents separated by `---`, as
 * manifests of Kubernetes do; empty documents are left out. Throws {@link ApiSpecError} as {@link loadDocument} does.
 */
export async function loadDocuments({ name, text, size }: ApiSource): Promise<unknown[]> {
  if ((size ?? text.length) > MAX_DOCUMENT_SIZE) throw new ApiSpecError(documentMessages.tooLarge(name, MAX_DOCUMENT_SIZE / 1024 / 1024))
  const source = text.replace(/^﻿/, '')
  if (/^\s*[{[]/.test(source)) {
    try {
      return [JSON.parse(source) as unknown]
    } catch {
      // The YAML library below finds where the error is.
    }
  }
  let parseAllDocuments: typeof import('yaml').parseAllDocuments
  try {
    ;({ parseAllDocuments } = await loadYaml())
  } catch {
    throw new ApiSpecError(documentMessages.yamlUnavailable(name))
  }
  return Array.from(parseAllDocuments(source, { prettyErrors: false, uniqueKeys: true }), (document) =>
    documentValue(name, source, document),
  ).filter((value) => value !== null && value !== undefined)
}
