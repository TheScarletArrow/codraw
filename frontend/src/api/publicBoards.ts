import { request, requestBytes } from './http.ts'

/** A board that its link shows to anybody, as a reader without a sign-in gets it. */
export interface PublicBoard {
  id: string
  title: string
  updatedAt: string
}

const publicBoardPath = (id: string) => `/api/public/boards/${encodeURIComponent(id)}`

/** The board, which answers 404 unless its link shows it to anybody without a sign-in. */
export function fetchPublicBoard(id: string): Promise<PublicBoard> {
  return request(publicBoardPath(id))
}

/**
 * The stored state of the document of the board, empty before its first store. The browser keeps the state and asks
 * again with its tag, so that the state of a board that did not change comes from the cache.
 */
export function fetchPublicDocument(id: string): Promise<Uint8Array> {
  return requestBytes(`${publicBoardPath(id)}/document`, { cache: 'no-cache' })
}
