import { request } from './http.ts'

/**
 * Asks the owner of the board to review an element of a page, which the current user marked «Нужно ревью». The owner
 * gets a notification, unless they asked themselves or got one about the element a short while ago; a user who asked
 * too often in the last hour gets 429.
 */
export function requestReview(boardId: string, pageId: string, cellId: string): Promise<void> {
  return request(`/api/boards/${encodeURIComponent(boardId)}/review-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageId, cellId }),
  })
}
