import { HttpError, request, requestBytes } from './http.ts'
import type { CollabToken } from './boards.ts'

/** Where a proposal of changes stands: its author edits it while it is open, and a reviewer accepts or declines it. */
export type ProposalStatus = 'open' | 'accepted' | 'declined' | 'withdrawn'

/** A user as proposals show them: the author and who decided. */
export interface ProposalUser {
  id: string
  name: string
  avatarUrl: string | null
}

/** A proposal of changes of a board, made in a draft of the board that its author edits. */
export interface Proposal {
  id: string
  boardId: string
  title: string
  description: string | null
  status: ProposalStatus
  author: ProposalUser
  createdAt: string
  /** When it was accepted, declined or withdrawn; `null` while it is open. */
  decidedAt: string | null
  /** Who accepted, declined or withdrew it; `null` while it is open and once they are deleted. */
  decidedBy: ProposalUser | null
  /** What the reviewer wrote to the author when declining it. */
  comment: string | null
}

/** The longest title of a proposal the backend accepts. */
export const PROPOSAL_TITLE_MAX_LENGTH = 120

/** The longest description of a proposal, and the longest comment of a declined one. */
export const PROPOSAL_TEXT_MAX_LENGTH = 2000

/** Whose open proposals reached their limit: those of the board or those of the author on it. */
export interface ProposalLimit {
  limit: number
  scope: 'board' | 'author'
}

const proposalsPath = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}/proposals`
const proposalPath = (boardId: string, id: string) => `${proposalsPath(boardId)}/${encodeURIComponent(id)}`

/** The proposals of the board that the user sees: all of them for the owner and the editors, else their own. */
export function fetchProposals(boardId: string): Promise<Proposal[]> {
  return request(proposalsPath(boardId))
}

/** Proposes changes of the board in a new draft that starts as the board. */
export function createProposal(boardId: string, title: string, description: string): Promise<Proposal> {
  return request(proposalsPath(boardId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description }),
  })
}

export function fetchProposal(boardId: string, id: string): Promise<Proposal> {
  return request(proposalPath(boardId, id))
}

/** The board when the proposal was made: the state of its document, empty for a board that had none. */
export function fetchProposalBase(boardId: string, id: string): Promise<Uint8Array> {
  return requestBytes(`${proposalPath(boardId, id)}/base`)
}

/** Token to connect to the draft of the proposal in collab. */
export function fetchProposalToken(boardId: string, id: string): Promise<CollabToken> {
  return request(`${proposalPath(boardId, id)}/collab-token`, { method: 'POST' })
}

/** Accepts the proposal; the backend keeps `state`, the board about to get it, as a version first. */
export function acceptProposal(boardId: string, id: string, state: Uint8Array): Promise<Proposal> {
  return request(`${proposalPath(boardId, id)}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    // A copy backed by a plain ArrayBuffer, which is what fetch accepts as a body.
    body: new Uint8Array(state),
  })
}

/** Declines the proposal, with what the author reads about why, if anything. */
export function declineProposal(boardId: string, id: string, comment: string): Promise<Proposal> {
  return request(`${proposalPath(boardId, id)}/decline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  })
}

/** Takes back an own proposal. */
export function withdrawProposal(boardId: string, id: string): Promise<Proposal> {
  return request(`${proposalPath(boardId, id)}/withdraw`, { method: 'POST' })
}

/** The limit of open proposals that creating one ran into; `null` for any other failure. */
export function proposalLimitOf(error: unknown): ProposalLimit | null {
  if (!(error instanceof HttpError) || error.status !== 409 || error.problem?.limit === undefined) return null
  return { limit: error.problem.limit, scope: error.problem.scope === 'author' ? 'author' : 'board' }
}
