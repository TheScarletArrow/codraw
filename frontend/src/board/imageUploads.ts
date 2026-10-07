import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { HttpError } from '../api/http.ts'
import { fetchImageUsage, imageUsageKey, uploadImage, type ImageTarget, type ImageUsage } from '../api/images.ts'
import { boardImageOf, IMAGE_FILE_TYPES, type ImageHost, type StoredImage } from '../diagram/images.ts'

/** How the uploads of images of a page go, as the lines under its header show them. */
export interface ImageUploadState {
  /** Images being uploaded; 0 without uploads. */
  count: number
  /** The share of the bytes of the images being uploaded that went, 0 to 1. */
  progress: number
  /** Why the last image was not added, in words, until the participant dismisses it; `null` without one. */
  error: string | null
}

const IDLE: ImageUploadState = { count: 0, progress: 0, error: null }

const MEGABYTE = 1024 * 1024

/** A size in megabytes as people read it: `10 МБ`, `1,5 МБ`, and kilobytes below a megabyte. */
export function megabytes(bytes: number): string {
  if (bytes < MEGABYTE) return `${Math.max(1, Math.round(bytes / 1024))} КБ`
  const value = bytes / MEGABYTE
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  return `${String(rounded).replace('.', ',')} МБ`
}

export const UNSUPPORTED_IMAGE = 'Формат файла не поддерживается: PNG, JPEG, GIF или WebP'
export const IMAGE_FAILED = 'Не удалось загрузить изображение'
export const IMAGE_FORBIDDEN = 'Нет права добавлять изображения на эту доску'

export const imageTooLarge = (limit: number) => `Изображение больше ${megabytes(limit)}`

/** Why the backend did not store an image, in words. */
export function imageUploadError(error: unknown): string {
  if (!(error instanceof HttpError)) return IMAGE_FAILED
  const { limit, scope, used } = error.problem ?? {}
  switch (error.status) {
    case 403:
      return IMAGE_FORBIDDEN
    case 409:
      return limit !== undefined && used !== undefined
        ? `На доске нет места для изображений: занято ${megabytes(used)} из ${megabytes(limit)}`
        : 'На доске нет места для изображений'
    case 413:
      if (scope === 'pixels') return `Изображение больше ${Math.round((limit ?? 50_000_000) / 1_000_000)} мегапикселей`
      return limit !== undefined ? imageTooLarge(limit) : 'Изображение слишком большое'
    case 415:
      return UNSUPPORTED_IMAGE
    default:
      return IMAGE_FAILED
  }
}

/**
 * Uploads of images of a page of a board or of a draft: the host that the canvas stores images with, which checks a file
 * before it goes, and how the uploads go.
 */
export class ImageUploads {
  readonly host: ImageHost
  private state = IDLE
  private readonly listeners = new Set<() => void>()
  private readonly uploads = new Map<number, { sent: number; total: number }>()
  private nextUpload = 0
  private readonly target: ImageTarget
  /** The room for images of the board, or `null` when it cannot be read: the backend checks again anyway. */
  private readonly usage: () => Promise<ImageUsage | null>

  constructor(target: ImageTarget, usage: () => Promise<ImageUsage | null>) {
    this.target = target
    this.usage = usage
    const boardId = target.boardId.toLowerCase()
    this.host = {
      store: (image) => this.store(image),
      holds: (url) => boardImageOf(url)?.boardId === boardId,
    }
  }

  getState = () => this.state

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  dismiss = () => this.update({ error: null })

  private async store(image: Blob): Promise<StoredImage | null> {
    if (!IMAGE_FILE_TYPES.includes(image.type)) return this.fail(UNSUPPORTED_IMAGE)
    const limit = (await this.usage())?.imageSize
    if (limit !== undefined && image.size > limit) return this.fail(imageTooLarge(limit))
    const id = this.nextUpload++
    this.uploads.set(id, { sent: 0, total: image.size })
    this.changed()
    try {
      const stored = await uploadImage(this.target, image, (share) => {
        this.uploads.set(id, { sent: share * image.size, total: image.size })
        this.changed()
      })
      return { url: stored.url, width: stored.width, height: stored.height }
    } catch (error) {
      return this.fail(imageUploadError(error))
    } finally {
      this.uploads.delete(id)
      this.changed()
    }
  }

  private fail(error: string): null {
    this.update({ error })
    return null
  }

  private changed() {
    const uploads = [...this.uploads.values()]
    const total = uploads.reduce((sum, upload) => sum + upload.total, 0)
    const sent = uploads.reduce((sum, upload) => sum + upload.sent, 0)
    this.update({ count: uploads.length, progress: total > 0 ? sent / total : 0 })
  }

  private update(change: Partial<ImageUploadState>) {
    this.state = { ...this.state, ...change }
    this.listeners.forEach((listener) => listener())
  }
}

/** The room for images of the board, read once in a while. */
function usageOf(queryClient: QueryClient, boardId: string): () => Promise<ImageUsage | null> {
  return () =>
    queryClient
      .fetchQuery({ queryKey: imageUsageKey(boardId), queryFn: () => fetchImageUsage(boardId), staleTime: 60_000 })
      .catch(() => null)
}

/**
 * The host of images of a page where the participant adds them, `null` for `target` `null` (e.g. a participant who only
 * views), with how its uploads go. A new host only for another board or draft: a new host makes a new canvas.
 */
export function useImageUploads(target: ImageTarget | null) {
  const queryClient = useQueryClient()
  const boardId = target?.boardId ?? null
  const proposalId = target?.proposalId ?? null
  const uploads = useMemo(
    () => (boardId ? new ImageUploads({ boardId, proposalId }, usageOf(queryClient, boardId)) : null),
    [boardId, proposalId, queryClient],
  )
  const subscribe = useCallback((listener: () => void) => uploads?.subscribe(listener) ?? (() => {}), [uploads])
  const state = useSyncExternalStore(subscribe, () => uploads?.getState() ?? IDLE)
  // A dismissed or replaced page leaves no message behind.
  useEffect(() => () => uploads?.dismiss(), [uploads])
  return { host: uploads?.host ?? null, state, dismiss: uploads?.dismiss ?? (() => {}) }
}
