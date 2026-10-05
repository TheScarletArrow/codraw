import { isNotFound, request } from './http.ts'

/** The live image of a page of a board. */
export interface Embed {
  /** The address of the image from the root of the site, e.g. `/api/embeds/….svg`. */
  path: string
  pageId: string
  /** When the picture was last published, `null` before the first one. */
  updatedAt: string | null
}

const embedPath = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}/embed`

/** The live image of the board, `null` when the owner has not turned it on. */
export async function fetchEmbed(boardId: string): Promise<Embed | null> {
  try {
    return await request<Embed>(embedPath(boardId))
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

/** Turns the live image of the page on, or makes it show another page; only the owner may. */
export function enableEmbed(boardId: string, pageId: string): Promise<Embed> {
  return request(embedPath(boardId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageId }),
  })
}

/** Turns the live image off: its address stops working. */
export function disableEmbed(boardId: string): Promise<void> {
  return request(embedPath(boardId), { method: 'DELETE' })
}

/** Publishes the picture of the page of the live image. */
export function publishEmbedImage(boardId: string, pageId: string, svg: string): Promise<void> {
  return request(`${embedPath(boardId)}/image?pageId=${encodeURIComponent(pageId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/svg+xml' },
    body: svg,
  })
}
