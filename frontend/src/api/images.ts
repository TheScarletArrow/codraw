import { csrfHeader, HttpError, parseProblem, request } from './http.ts'

/** An image of a board, as the backend stores it. */
export interface BoardImage {
  id: string
  /** The address of the image from the root of the site, which image shapes refer to. */
  url: string
  contentType: string
  size: number
  /** The size of the picture in pixels. */
  width: number
  height: number
}

/** Room for images of a board, in bytes: what its images take, how much they may take, and the largest file. */
export interface ImageUsage {
  used: number
  quota: number
  imageSize: number
}

/** Where an image goes: a board, or the draft of an open proposal of the user, whose images are those of its board. */
export interface ImageTarget {
  boardId: string
  proposalId?: string | null
}

const imagesPath = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}/images`

/** Query key of the room for images of a board. */
export const imageUsageKey = (boardId: string) => ['boards', boardId, 'images', 'usage'] as const

export function fetchImageUsage(boardId: string): Promise<ImageUsage> {
  return request(`${imagesPath(boardId)}/usage`)
}

/**
 * Uploads an image file to the board, telling `onProgress` the share of its bytes sent, 0 to 1. Resolves to the stored
 * image, the same for a file the board has; rejects with {@link HttpError} when the backend refuses it, and with another
 * error without a connection. `fetch` tells no progress of an upload, so this is `XMLHttpRequest`.
 */
export async function uploadImage(target: ImageTarget, file: Blob, onProgress?: (share: number) => void): Promise<BoardImage> {
  const query = target.proposalId ? `?proposal=${encodeURIComponent(target.proposalId)}` : ''
  const headers = await csrfHeader()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${imagesPath(target.boardId)}${query}`)
    xhr.setRequestHeader('Accept', 'application/json')
    // The backend reads the format from the bytes, whatever the type says.
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total)
    }
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        resolve(JSON.parse(xhr.responseText) as BoardImage)
        return
      }
      reject(new HttpError(xhr.status, parseProblem(xhr.getResponseHeader('Content-Type'), xhr.responseText)))
    }
    xhr.onerror = () => reject(new Error('The image could not be uploaded'))
    xhr.onabort = xhr.onerror
    xhr.send(file)
  })
}
