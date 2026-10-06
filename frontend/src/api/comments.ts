import { request } from './http.ts'

/** A user as comments show them: the author, who resolved a thread, who is mentioned. */
export interface Person {
  id: string
  name: string
  avatarUrl: string | null
}

/** A reaction to a comment, one of a fixed set. */
export type Reaction = 'thumbs-up' | 'heart' | 'party' | 'smile' | 'eyes' | 'check'

/** One reaction to a comment and who put it, in the order they did. */
export interface CommentReaction {
  reaction: Reaction
  people: Person[]
}

export interface Comment {
  id: string
  /** `null` once the author is deleted, e.g. a guest who did not come back. */
  author: Person | null
  body: string
  /** The participants of the board that the comment mentions. */
  mentions: Person[]
  /** The reactions put on the comment, in the order of the set. */
  reactions: CommentReaction[]
  createdAt: string
  /** When the author last changed the text, `null` when they never did. */
  editedAt: string | null
}

/** A point of a page in the coordinates of its diagram, like the positions of the shapes. */
export interface ThreadPoint {
  x: number
  y: number
}

/**
 * Comments about one element of a page, about a point of it, or about the whole page when neither `cellId` nor `point`
 * is set; never about both.
 */
export interface CommentThread {
  id: string
  pageId: string
  /** The id of the cell in the document of the board; the cell may be deleted since. */
  cellId: string | null
  /** Where the thread stands on the page. */
  point: ThreadPoint | null
  createdAt: string
  /** When the thread was marked resolved, `null` while it is open. */
  resolvedAt: string | null
  resolvedBy: Person | null
  /** Who takes care of the thread; `null` while nobody does or once they are deleted. */
  assignee: Person | null
  /** The first comment starts the thread, the others answer it, oldest first. */
  comments: Comment[]
}

/** The text of a comment and the ids of the participants it mentions. */
export interface CommentText {
  body: string
  mentions: string[]
}

const boardPath = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}`
const threadPath = (boardId: string, threadId: string) => `${boardPath(boardId)}/threads/${encodeURIComponent(threadId)}`

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** All threads of the board, oldest first. */
export function fetchThreads(boardId: string): Promise<CommentThread[]> {
  return request(`${boardPath(boardId)}/threads`)
}

/** Who may be mentioned on the board: the owner first, then those who opened it through its link. */
export function fetchPeople(boardId: string): Promise<Person[]> {
  return request(`${boardPath(boardId)}/people`)
}

/** Starts a thread about an element of the page, at a point of it, or about the page when neither is set. */
export function startThread(
  boardId: string,
  thread: { pageId: string; cellId: string | null; point: ThreadPoint | null } & CommentText,
): Promise<CommentThread> {
  return request(`${boardPath(boardId)}/threads`, json('POST', thread))
}

export function replyToThread(boardId: string, threadId: string, text: CommentText): Promise<CommentThread> {
  return request(`${threadPath(boardId, threadId)}/comments`, json('POST', text))
}

export function resolveThread(boardId: string, threadId: string, resolved: boolean): Promise<CommentThread> {
  return request(threadPath(boardId, threadId), json('PATCH', { resolved }))
}

/** Moves a thread that stands at a point to another point of its page; its author or the owner of the board may. */
export function moveThread(boardId: string, threadId: string, point: ThreadPoint): Promise<CommentThread> {
  return request(threadPath(boardId, threadId), json('PATCH', { point }))
}

/** Assigns the thread to a participant whom comments may mention, in place of anybody before. */
export function assignThread(boardId: string, threadId: string, userId: string): Promise<CommentThread> {
  return request(`${threadPath(boardId, threadId)}/assignee`, json('PUT', { userId }))
}

/** Leaves the thread without an assignee. */
export function unassignThread(boardId: string, threadId: string): Promise<CommentThread> {
  return request(`${threadPath(boardId, threadId)}/assignee`, { method: 'DELETE' })
}

const reactionPath = (boardId: string, threadId: string, commentId: string, reaction: Reaction) =>
  `${threadPath(boardId, threadId)}/comments/${encodeURIComponent(commentId)}/reactions/${reaction}`

/** Puts the reaction of the current user on the comment; putting it again changes nothing. */
export function addReaction(
  boardId: string,
  threadId: string,
  commentId: string,
  reaction: Reaction,
): Promise<CommentThread> {
  return request(reactionPath(boardId, threadId, commentId, reaction), { method: 'PUT' })
}

/** Takes the reaction of the current user away from the comment. */
export function removeReaction(
  boardId: string,
  threadId: string,
  commentId: string,
  reaction: Reaction,
): Promise<CommentThread> {
  return request(reactionPath(boardId, threadId, commentId, reaction), { method: 'DELETE' })
}

export function editComment(boardId: string, threadId: string, commentId: string, text: CommentText): Promise<CommentThread> {
  return request(`${threadPath(boardId, threadId)}/comments/${encodeURIComponent(commentId)}`, json('PATCH', text))
}

/** Deletes the comment; the first comment of a thread takes the whole thread with it. */
export function deleteComment(boardId: string, threadId: string, commentId: string): Promise<void> {
  return request(`${threadPath(boardId, threadId)}/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' })
}
