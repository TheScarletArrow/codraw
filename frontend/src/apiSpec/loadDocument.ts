import type { ErrorCode } from 'yaml'

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
const REASONS: Partial<Record<ErrorCode, string>> = {
  BAD_INDENT: 'неверный отступ',
  TAB_AS_INDENT: 'табуляция в отступе',
  DUPLICATE_KEY: 'ключ повторяется',
  MISSING_CHAR: 'не хватает закрывающего символа',
  MULTIPLE_DOCS: 'в файле несколько документов',
  BAD_ALIAS: 'ссылка на неизвестный якорь',
  MULTILINE_IMPLICIT_KEY: 'ключ на нескольких строках',
  BLOCK_AS_IMPLICIT_KEY: 'ключ на нескольких строках',
  UNEXPECTED_TOKEN: 'неожиданный символ',
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
 * Throws {@link ApiSpecError} for a document too large, with an error of syntax or with too many aliases.
 */
export async function loadDocument({ name, text, size }: ApiSource): Promise<unknown> {
  if ((size ?? text.length) > MAX_DOCUMENT_SIZE) throw new ApiSpecError(`${name}: файл больше ${MAX_DOCUMENT_SIZE / 1024 / 1024} МБ`)
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
    throw new ApiSpecError(`${name}: не удалось загрузить разбор YAML — проверьте подключение к сети`)
  }
  return documentValue(name, source, parseDocument(source, { prettyErrors: false, uniqueKeys: true }))
}

/** The value of a parsed document of YAML, or the error of its syntax with its line and column in the text. */
function documentValue(name: string, source: string, document: import('yaml').Document.Parsed): unknown {
  const error = document.errors[0]
  if (error) {
    const { line, column } = position(source, error.pos[0])
    throw new ApiSpecError(`${name}: строка ${line}, столбец ${column} — ${REASONS[error.code] ?? 'ошибка синтаксиса'}`)
  }
  try {
    return document.toJS({ maxAliasCount: MAX_ALIASES }) as unknown
  } catch {
    throw new ApiSpecError(`${name}: слишком много ссылок на якоря YAML`)
  }
}

/**
 * The values of the documents of a file of JSON or YAML, which may hold several documents separated by `---`, as
 * manifests of Kubernetes do; empty documents are left out. Throws {@link ApiSpecError} as {@link loadDocument} does.
 */
export async function loadDocuments({ name, text, size }: ApiSource): Promise<unknown[]> {
  if ((size ?? text.length) > MAX_DOCUMENT_SIZE) throw new ApiSpecError(`${name}: файл больше ${MAX_DOCUMENT_SIZE / 1024 / 1024} МБ`)
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
    throw new ApiSpecError(`${name}: не удалось загрузить разбор YAML — проверьте подключение к сети`)
  }
  return Array.from(parseAllDocuments(source, { prettyErrors: false, uniqueKeys: true }), (document) =>
    documentValue(name, source, document),
  ).filter((value) => value !== null && value !== undefined)
}
