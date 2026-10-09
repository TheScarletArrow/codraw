import type { Person } from './comments.ts'
import { request } from './http.ts'

/** The tracker whose issues are linked: GitHub, or GitHub Enterprise Server of the installation. */
export type Tracker = 'github'

export type IssueState = 'open' | 'closed'

/** Why an issue is in its state, as GitHub says. */
export type IssueStateReason = 'completed' | 'not-planned' | 'duplicate' | 'reopened'

/**
 * What CoDraw knows of whether a link is up to date: `no-access` — the token of the user who linked it no longer reaches
 * the issue; `disconnected` — nobody's connection keeps it up to date.
 */
export type LinkSync = 'ok' | 'no-access' | 'deleted' | 'disconnected'

/** An element of a page, or a thread of comments, that issues are linked to. */
export type IssueTarget = { pageId: string; cellId: string } | { threadId: string }

/** An issue linked to an element or a thread of a board, as CoDraw last saw it in the tracker. */
export interface IssueLink {
  id: string
  pageId: string | null
  cellId: string | null
  threadId: string | null
  tracker: Tracker
  /** `owner/name`. */
  repository: string
  number: number
  title: string
  state: IssueState
  stateReason: IssueStateReason | null
  /** The page of the issue in the tracker. */
  url: string
  /** The repository is private: the user who linked the issue chose to show it to the participants of the board. */
  private: boolean
  sync: LinkSync
  /** When CoDraw last learned of the issue from the tracker. */
  syncedAt: string
  /** Whose connection keeps the link up to date; `null` once they are deleted. */
  linkedBy: Person | null
  /** The issue was created from CoDraw. */
  createdHere: boolean
  createdAt: string
}

/** The connection of the user to the tracker, without its token. */
export interface TrackerConnection {
  login: string
  connectedAt: string
  /** `false` once the tracker refused the token, e.g. it expired or was revoked. */
  working: boolean
  rejectedAt: string | null
}

export interface TrackerSettings {
  /** Whether the installation links issues. */
  available: boolean
  tracker: Tracker
  /** The site of the tracker, where tokens are created. */
  webUrl: string | null
  connection: TrackerConnection | null
}

export interface TrackerRepository {
  /** `owner/name`. */
  fullName: string
  private: boolean
}

/** An issue found in the tracker, before it is linked. */
export interface FoundIssue {
  repository: string
  number: number
  title: string
  state: IssueState
  stateReason: IssueStateReason | null
  url: string
  /** Whether the repository is private; `null` among results of a search. */
  private: boolean | null
  updatedAt: string
}

const TRACKER_PATH = '/api/issue-tracker'
const boardPath = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}`
const linksPath = (boardId: string) => `${boardPath(boardId)}/issue-links`

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function fetchTrackerSettings(): Promise<TrackerSettings> {
  return request(TRACKER_PATH)
}

/** Connects the user with a token, which the tracker has to take: 400 with `invalid-token` otherwise. */
export function connectTracker(token: string): Promise<TrackerConnection> {
  return request(`${TRACKER_PATH}/connection`, json('PUT', { token }))
}

export function disconnectTracker(): Promise<void> {
  return request(`${TRACKER_PATH}/connection`, { method: 'DELETE' })
}

/** The repositories that the token of the user reaches, recently changed first. */
export function fetchRepositories(): Promise<TrackerRepository[]> {
  return request(`${TRACKER_PATH}/repositories`)
}

/** The issue as the user would link it, with whether its repository is private. */
export function findIssue(repository: string, number: number): Promise<FoundIssue> {
  const params = new URLSearchParams({ repository, number: String(number) })
  return request(`${TRACKER_PATH}/issues?${params}`)
}

/** Issues of the repository whose text has the words of the query. */
export function searchIssues(repository: string, query: string): Promise<FoundIssue[]> {
  const params = new URLSearchParams({ repository, query })
  return request(`${TRACKER_PATH}/issues?${params}`)
}

export function fetchIssueLinks(boardId: string): Promise<IssueLink[]> {
  return request(linksPath(boardId))
}

export function linkIssue(boardId: string, target: IssueTarget, repository: string, number: number): Promise<IssueLink> {
  return request(linksPath(boardId), json('POST', { ...target, repository, number }))
}

export interface NewIssue {
  /** Chosen once per issue: a repeated request with it creates nothing. */
  requestId: string
  repository: string
  title: string
  description: string
  /** The label of the element, which the link back from the issue names. */
  elementLabel?: string
}

/** Creates an issue in the tracker with a link back to the target, and links it there. */
export function createIssue(boardId: string, target: IssueTarget, issue: NewIssue): Promise<IssueLink> {
  return request(`${boardPath(boardId)}/issues`, json('POST', { ...target, ...issue }))
}

/** Brings the links up to date with the tracker, those not asked about for a minute. */
export function refreshIssueLinks(boardId: string, ids: string[]): Promise<IssueLink[]> {
  return request(`${linksPath(boardId)}/refresh`, json('POST', { ids }))
}

/** Makes the link the user's own: their connection keeps it up to date since. */
export function takeOverIssueLink(boardId: string, linkId: string): Promise<IssueLink> {
  return request(`${linksPath(boardId)}/${encodeURIComponent(linkId)}/take-over`, { method: 'POST' })
}

/** Deletes the link; the issue stays in the tracker. */
export function unlinkIssue(boardId: string, linkId: string): Promise<void> {
  return request(`${linksPath(boardId)}/${encodeURIComponent(linkId)}`, { method: 'DELETE' })
}
