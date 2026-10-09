import { addDecision, updateDecision, type Decision } from '../api/decisions.ts'
import { HttpError } from '../api/http.ts'
import { contentOf } from './decisions.ts'
import { parseMadr, type ParsedDecision } from './madr.ts'

/** A file of a record to import: its name, with its folders when it comes from a folder, and its text. */
export interface RecordFile {
  name: string
  text: string
}

/** What an import did, file by file. */
export interface ImportReport {
  /** The decisions written down, by their numbers. */
  added: Decision[]
  /** Files whose number the board has already: a folder imported again adds nothing twice. */
  taken: string[]
  /** Files without a title, which are no records. */
  untitled: string[]
  /** Files the board refused, e.g. with a section too long. */
  failed: string[]
  /** The board has as many decisions as allowed: the files after it were not imported. */
  limit: number | null
}

const isConflict = (error: unknown): error is HttpError => error instanceof HttpError && error.status === 409

/**
 * Writes down the decisions of the files of MADR on the board, numbered ones first in the order of their numbers, then
 * the others with the next numbers of the board; then links each superseded decision to the decision that superseded
 * it, by the number its status names, when the board has that decision. Elements are linked by hand afterwards.
 */
export async function importDecisions(
  boardId: string,
  files: readonly RecordFile[],
  existing: readonly Decision[],
  api = { addDecision, updateDecision },
): Promise<ImportReport> {
  const report: ImportReport = { added: [], taken: [], untitled: [], failed: [], limit: null }
  const parsed: { file: RecordFile; decision: ParsedDecision }[] = []
  for (const file of files) {
    const decision = parseMadr(file.name, file.text)
    if (decision) parsed.push({ file, decision })
    else report.untitled.push(file.name)
  }
  parsed.sort((a, b) => (a.decision.number ?? Infinity) - (b.decision.number ?? Infinity))

  const successors = new Map<string, number>()
  for (const [index, { file, decision }] of parsed.entries()) {
    const { decidedOn, ...content } = decision.content
    try {
      const added = await api.addDecision(boardId, {
        ...content,
        ...(decidedOn && { decidedOn }),
        ...(decision.number !== null && { number: decision.number }),
      })
      report.added.push(added)
      if (decision.supersededByNumber !== null) successors.set(added.id, decision.supersededByNumber)
    } catch (error) {
      if (isConflict(error) && error.problem?.limit !== undefined) {
        report.limit = error.problem.limit
        report.failed.push(...parsed.slice(index).map((entry) => entry.file.name))
        break
      }
      if (isConflict(error)) report.taken.push(file.name)
      else report.failed.push(file.name)
    }
  }

  const all = [...existing, ...report.added]
  for (const [index, added] of report.added.entries()) {
    const number = successors.get(added.id)
    const successor = number !== undefined && all.find((decision) => decision.number === number && decision.id !== added.id)
    if (!successor) continue
    try {
      report.added[index] = await api.updateDecision(boardId, added.id, { ...contentOf(added), supersededBy: successor.id })
    } catch {
      // The decision stays superseded without its successor, which may be linked by hand.
    }
  }
  report.added.sort((a, b) => a.number - b.number)
  return report
}

/** The report as one line for the panel: «Импортировано: 3. Номер уже занят: 0001-kafka.md». */
export function reportText(report: ImportReport): string {
  const parts = [`Импортировано: ${report.added.length}`]
  if (report.taken.length > 0) parts.push(`Номер уже занят: ${report.taken.join(', ')}`)
  if (report.untitled.length > 0) parts.push(`Без заголовка: ${report.untitled.join(', ')}`)
  if (report.limit !== null) parts.push(`На доске уже ${report.limit} решений — больше нельзя`)
  else if (report.failed.length > 0) parts.push(`Не удалось: ${report.failed.join(', ')}`)
  return `${parts.join('. ')}.`
}
