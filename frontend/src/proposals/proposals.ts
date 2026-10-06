import type { Proposal, ProposalStatus } from '../api/proposals.ts'

/** Query key of the proposals of a board that the user sees. */
export const proposalsKey = (boardId: string) => ['boards', boardId, 'proposals'] as const

/** Query key of one proposal, within those of its board, so that a change of the list refreshes it too. */
export const proposalKey = (boardId: string, id: string) => [...proposalsKey(boardId), id] as const

/** Query key of the base of a proposal, which never changes. */
export const proposalBaseKey = (boardId: string, id: string) => ['boards', boardId, 'proposal-bases', id] as const

/** How often the page of a board asks for proposals made or decided by others, in milliseconds. */
export const PROPOSALS_POLL_INTERVAL = 30_000

export const isOpen = (proposal: Proposal) => proposal.status === 'open'

/** What became of a proposal, as the list and the review say it. */
export const STATUS_LABELS: Record<ProposalStatus, string> = {
  open: 'Открыто',
  accepted: 'Принято',
  declined: 'Отклонено',
  withdrawn: 'Отозвано',
}

/** The address of the draft of a proposal. */
export const draftPath = (boardId: string, id: string) =>
  `/boards/${encodeURIComponent(boardId)}/proposals/${encodeURIComponent(id)}`

/** The address of the board with the review of a proposal open. */
export const reviewPath = (boardId: string, id: string) =>
  `/boards/${encodeURIComponent(boardId)}?proposal=${encodeURIComponent(id)}`

/** Prefix of the name of the document of a draft in collab: `proposal:<proposal id>`. */
export const DRAFT_DOCUMENT_PREFIX = 'proposal:'
