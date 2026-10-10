import type { Decision, DecisionContent, DecisionElement, DecisionStatus } from '../api/decisions.ts'
import type { StatusItem } from '../board/statusList.ts'
import { perLocale } from '../i18n/i18n.ts'
import { decisionsMessages as m } from './messages.ts'

export const decisionsKey = (boardId: string) => ['decisions', boardId] as const

/** The statuses in the order of the life of a decision. */
export const DECISION_STATUSES: DecisionStatus[] = ['proposed', 'accepted', 'rejected', 'superseded']

/** What the panel calls a status, in the language of the interface. */
export const statusLabel = (status: DecisionStatus): string => m.statuses[status]

export type DecisionSection = keyof Pick<DecisionContent, 'context' | 'options' | 'outcome' | 'consequences'>

/** The sections of a decision in the order of MADR. */
export const SECTIONS: DecisionSection[] = ['context', 'options', 'outcome', 'consequences']

/** What the panel calls a section, in the language of the interface. */
export const sectionTitle = (section: DecisionSection): string => m.sections[section]

/** The number of a decision as its file and the list name it: `ADR-0008`. */
export const decisionCode = (number: number) => `ADR-${String(number).padStart(4, '0')}`

/** The status as the list says it: a superseded decision names the decision that superseded it, while it is there. */
export function statusText(decision: Pick<Decision, 'status' | 'supersededBy'>, decisions: readonly Decision[]): string {
  const successor = decision.supersededBy && decisions.find((other) => other.id === decision.supersededBy)
  return successor ? m.supersededBy(decisionCode(successor.number)) : statusLabel(decision.status)
}

/** Which decisions the panel shows: all of them or those of one status. */
export type DecisionFilter = 'all' | DecisionStatus

/**
 * A request to show decisions: those of an element, e.g. from its badge on the canvas, or one decision, with a thread
 * of its discussion, e.g. from a notification.
 */
export type DecisionFocus = { pageId: string; cellId: string } | { decisionId: string; threadId?: string }

export const sameElement = (a: DecisionElement, b: DecisionElement) => a.pageId === b.pageId && a.cellId === b.cellId

export const isAbout = (decision: Decision, element: DecisionElement) =>
  decision.elements.some((other) => sameElement(other, element))

/** The decisions of the status of the filter; of an element in focus, only those about it. */
export function filterDecisions(
  decisions: readonly Decision[],
  filter: DecisionFilter,
  focus: DecisionFocus | null,
): Decision[] {
  return decisions.filter(
    (decision) =>
      (filter === 'all' || decision.status === filter) && (!focus || 'decisionId' in focus || isAbout(decision, focus)),
  )
}

/** How many decisions there are of each status. */
export function countByStatus(decisions: readonly Decision[]): Record<DecisionStatus, number> {
  const counts: Record<DecisionStatus, number> = { proposed: 0, accepted: 0, rejected: 0, superseded: 0 }
  for (const decision of decisions) counts[decision.status]++
  return counts
}

/** The number of decisions about each element of the page. */
export function decisionsByCell(decisions: readonly Decision[], pageId: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const decision of decisions) {
    for (const element of decision.elements) {
      if (element.pageId === pageId) counts.set(element.cellId, (counts.get(element.cellId) ?? 0) + 1)
    }
  }
  return counts
}

/** The elements with the elements added, each once, in their order. */
export function withElements(elements: readonly DecisionElement[], added: readonly DecisionElement[]): DecisionElement[] {
  const all = [...elements]
  for (const element of added) if (!all.some((other) => sameElement(other, element))) all.push(element)
  return all
}

/**
 * Elements marked «Нужно ревью» that a proposed decision is not about yet: they and the decision are often one change
 * waiting to be accepted, so the panel offers to link them.
 */
export function reviewSuggestions(decision: Decision, statuses: readonly StatusItem[]): StatusItem[] {
  if (decision.status !== 'proposed') return []
  return statuses.filter((item) => item.status === 'review' && !isAbout(decision, item))
}

/** What a new decision says: a proposal of today with nothing written yet. */
export const newContent = (title: string, decidedOn: string): DecisionContent => ({
  title,
  status: 'proposed',
  supersededBy: null,
  decidedOn,
  context: '',
  options: '',
  outcome: '',
  consequences: '',
})

/** What the decision says, for the form that edits it. */
export const contentOf = ({
  title,
  status,
  supersededBy,
  decidedOn,
  context,
  options,
  outcome,
  consequences,
}: DecisionContent): DecisionContent => ({ title, status, supersededBy, decidedOn, context, options, outcome, consequences })

/** The day of today in the time zone of the user, `YYYY-MM-DD`. */
export function today(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export const decisionDateFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeZone: 'UTC' }))

/** A day `YYYY-MM-DD` as the list shows it: «9 окт. 2026 г.». */
export const formatDay = (day: string) => decisionDateFormat().format(new Date(`${day}T00:00:00Z`))
