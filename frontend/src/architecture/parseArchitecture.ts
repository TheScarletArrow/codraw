import type { ApiSource } from '../apiSpec/loadDocument.ts'
import { documentMessages } from '../apiSpec/messages.ts'
import { ArchitectureBuilder, ArchitectureSyntaxError, type ImportedArchitecture } from './importModel.ts'
import { parseC4Macros } from './parseC4Macros.ts'
import { parseStructurizr } from './parseStructurizr.ts'
import { architectureMessages as m } from './messages.ts'

/** The largest file read: architecture as code is text, a larger file is no description of architecture. */
export const MAX_ARCHITECTURE_SIZE = 1024 * 1024

export type ArchitectureFormat = 'structurizr' | 'plantuml' | 'mermaid'

/** Diagrams of Mermaid that are not of C4, which «Импорт Mermaid…» or nothing imports. */
const OTHER_MERMAID =
  /^(flowchart|graph|erDiagram|sequenceDiagram|classDiagram|stateDiagram(-v2)?|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|sankey(-beta)?|xychart(-beta)?|block(-beta)?|packet(-beta)?|architecture(-beta)?|kanban|zenuml)\b/

const C4_MERMAID = /^C4(Context|Container|Component|Dynamic|Deployment)\b/

/** The first line of a text that is no comment of any of the formats. */
function firstLine(text: string): string {
  for (const line of text.replace(/^﻿/, '').split(/\r\n?|\n/)) {
    const trimmed = line.trim()
    if (trimmed && !/^('|%%|\/\/|#|\/\*|\/')/.test(trimmed)) return trimmed
  }
  return ''
}

const extension = (name: string) => /\.([^./\\]+)$/.exec(name)?.[1]?.toLowerCase() ?? ''

/** Why a text is none of the formats. */
export class ArchitectureFormatError extends Error {}

/**
 * The format of a file: by its first line — `workspace`, `@startuml`, `C4Context` and the other diagrams of Mermaid C4 —
 * then by its extension, then by a macro of C4 or a declaration of Structurizr in it. Throws
 * {@link ArchitectureFormatError} for another diagram of Mermaid and for a text of none of the formats.
 */
export function detectFormat({ name, text }: ApiSource): ArchitectureFormat {
  const first = firstLine(text)
  if (/^workspace\b/i.test(first)) return 'structurizr'
  if (/^@start/i.test(first)) return 'plantuml'
  if (C4_MERMAID.test(first)) return 'mermaid'
  const notC4 = new ArchitectureFormatError(m.notC4Mermaid)
  if (OTHER_MERMAID.test(first)) throw notC4
  const type = extension(name)
  if (type === 'dsl') return 'structurizr'
  if (['puml', 'plantuml', 'iuml', 'pu', 'wsd'].includes(type)) return 'plantuml'
  if (type === 'mmd' || type === 'mermaid') throw notC4
  if (/^\s*!include\b.*C4|^\s*(Person|System|Container|Component|Rel|BiRel|Boundary|Enterprise_Boundary|Deployment_Node|Node)\w*\s*\(/m.test(text)) {
    return 'plantuml'
  }
  if (/^\s*(?:[\w.-]+\s*=\s*)?(person|softwareSystem|container|component)\s+\S/im.test(text) || /^\s*model\s*\{/im.test(text)) return 'structurizr'
  throw new ArchitectureFormatError(m.unknownFormat)
}

/**
 * The model of the files and of the text, read together, and the errors of those it leaves out: a file too large, of
 * no format, with an error of syntax or with nothing of C4. Nothing is loaded, included or run.
 */
export function parseArchitectureFiles(sources: ApiSource[]): { model: ImportedArchitecture; errors: string[] } {
  const builder = new ArchitectureBuilder()
  const errors: string[] = []
  for (const source of sources) {
    if ((source.size ?? source.text.length) > MAX_ARCHITECTURE_SIZE) {
      errors.push(documentMessages.tooLarge(source.name, MAX_ARCHITECTURE_SIZE / 1024 / 1024))
      continue
    }
    try {
      const format = detectFormat(source)
      if (format === 'structurizr') parseStructurizr(source, builder)
      else parseC4Macros(source, builder)
      if (builder.declarations(source.name) === 0) errors.push(m.noElements(source.name))
    } catch (error) {
      if (!(error instanceof ArchitectureSyntaxError || error instanceof ArchitectureFormatError)) throw error
      errors.push(`${source.name}: ${error.message}`)
    }
  }
  return { model: builder.build(), errors }
}
