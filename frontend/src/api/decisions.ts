import type { Person } from './comments.ts'
import { request } from './http.ts'

/** Where a decision stands, as MADR names it. */
export type DecisionStatus = 'proposed' | 'accepted' | 'rejected' | 'superseded'

/** An element of a page of the board document a decision is about; the cell may be deleted since. */
export interface DecisionElement {
  pageId: string
  cellId: string
}

/** What a decision says, apart from its number, author and elements: what the form edits and a file of MADR holds. */
export interface DecisionContent {
  title: string
  status: DecisionStatus
  /** The decision of the board that superseded it, for a superseded decision; `null` otherwise or once it is gone. */
  supersededBy: string | null
  /** The day it was decided on, `YYYY-MM-DD`. */
  decidedOn: string
  /** Sections of Markdown. */
  context: string
  /** The options considered. */
  options: string
  /** The option chosen and why. */
  outcome: string
  consequences: string
}

/** An architecture decision of the board in the format of MADR. */
export interface Decision extends DecisionContent {
  id: string
  /** The number of the decision on the board, as in the name of its file: `0008-….md`. */
  number: number
  /** Who wrote it down; `null` once they are deleted. */
  author: Person | null
  /** The elements it is about, by page and cell. */
  elements: DecisionElement[]
  createdAt: string
  updatedAt: string
}

const decisionsPath = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}/decisions`
const decisionPath = (boardId: string, decisionId: string) => `${decisionsPath(boardId)}/${encodeURIComponent(decisionId)}`

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** All decisions of the board, by their numbers. */
export function fetchDecisions(boardId: string): Promise<Decision[]> {
  return request(decisionsPath(boardId))
}

/**
 * Writes down a decision with the next number of the board, or with `number`, e.g. of a file of MADR; a number the
 * board has already gets 409. Without `decidedOn` it is dated today.
 */
export function addDecision(
  boardId: string,
  decision: Partial<DecisionContent> & { title: string; number?: number; elements?: DecisionElement[] },
): Promise<Decision> {
  return request(decisionsPath(boardId), json('POST', decision))
}

/** Changes what the decision says; its number, author and elements stay. */
export function updateDecision(boardId: string, decisionId: string, content: DecisionContent): Promise<Decision> {
  return request(decisionPath(boardId, decisionId), json('PUT', content))
}

/** Makes the decision be about exactly the `elements`. */
export function linkDecision(boardId: string, decisionId: string, elements: DecisionElement[]): Promise<Decision> {
  return request(`${decisionPath(boardId, decisionId)}/elements`, json('PUT', { elements }))
}

/** Deletes the decision with its discussion; decisions it superseded no longer name it. */
export function deleteDecision(boardId: string, decisionId: string): Promise<void> {
  return request(decisionPath(boardId, decisionId), { method: 'DELETE' })
}
