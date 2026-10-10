import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '../api/http.ts'
import { uploadImage, type ImageUsage } from '../api/images.ts'
import { boardImageUrl } from '../diagram/images.ts'
import { setLocale } from '../i18n/i18n.ts'
import { imageMessages } from './board.messages.ts'
import { ImageUploads, imageUploadError, megabytes } from './imageUploads.ts'

const { failed: IMAGE_FAILED, forbidden: IMAGE_FORBIDDEN, unsupported: UNSUPPORTED_IMAGE } = imageMessages

vi.mock('../api/images.ts', () => ({ uploadImage: vi.fn() }))

const BOARD = '0199a000-0000-7000-8000-000000000001'
const MB = 1024 * 1024
const usage: ImageUsage = { used: 0, quota: 100 * MB, imageSize: 10 * MB }

const file = (size: number, type = 'image/png') => new File([new Uint8Array(size)], 'shot.png', { type })

afterEach(() => vi.mocked(uploadImage).mockReset())

describe('uploads of images', () => {
  it('upload a picture of the board and tell how much of it went', async () => {
    let progress: (share: number) => void = () => {}
    let finish: () => void = () => {}
    vi.mocked(uploadImage).mockImplementation(async (_target, _file, onProgress) => {
      progress = onProgress!
      await new Promise<void>((resolve) => (finish = resolve))
      return { id: 'i', url: boardImageUrl(BOARD, 'i'), contentType: 'image/png', size: 100, width: 40, height: 20 }
    })
    const uploads = new ImageUploads({ boardId: BOARD, proposalId: 'p' }, async () => usage)

    const stored = uploads.host.store(file(100))
    await vi.waitFor(() => expect(uploads.getState().count).toBe(1))
    progress(0.4)
    expect(uploads.getState()).toEqual({ count: 1, progress: 0.4, error: null })
    finish()

    expect(await stored).toEqual({ url: boardImageUrl(BOARD, 'i'), width: 40, height: 20 })
    expect(uploads.getState()).toEqual({ count: 0, progress: 0, error: null })
    expect(uploadImage).toHaveBeenCalledWith({ boardId: BOARD, proposalId: 'p' }, expect.any(File), expect.any(Function))
  })

  it('refuse other formats and files above the limit before they go', async () => {
    const uploads = new ImageUploads({ boardId: BOARD }, async () => usage)

    expect(await uploads.host.store(file(10, 'image/svg+xml'))).toBeNull()
    expect(uploads.getState().error).toBe(UNSUPPORTED_IMAGE)
    expect(await uploads.host.store(file(10 * MB + 1))).toBeNull()
    expect(uploads.getState().error).toBe('Изображение больше 10 МБ')
    expect(uploadImage).not.toHaveBeenCalled()

    uploads.dismiss()
    expect(uploads.getState().error).toBeNull()
  })

  it('tell why the backend did not take a picture, and go without knowing the limit', async () => {
    vi.mocked(uploadImage).mockRejectedValue(new HttpError(409, { limit: 100 * MB, used: 99 * MB }))
    const uploads = new ImageUploads({ boardId: BOARD }, async () => null)

    expect(await uploads.host.store(file(2 * MB))).toBeNull()
    expect(uploads.getState()).toEqual({ count: 0, progress: 0, error: 'На доске нет места для изображений: занято 99 МБ из 100 МБ' })
  })

  it('hold the images of their board only', () => {
    const uploads = new ImageUploads({ boardId: BOARD }, async () => usage)

    expect(uploads.host.holds(boardImageUrl(BOARD, '0199a000-0000-7000-8000-0000000000aa'))).toBe(true)
    expect(uploads.host.holds(boardImageUrl('0199a000-0000-7000-8000-000000000002', '0199a000-0000-7000-8000-0000000000aa'))).toBe(false)
    expect(uploads.host.holds('https://example.com/a.png')).toBe(false)
  })
})

describe('messages about images', () => {
  it('name sizes in megabytes, and kilobytes below a megabyte', () => {
    expect(megabytes(10 * MB)).toBe('10 МБ')
    expect(megabytes(1.5 * MB)).toBe('1,5 МБ')
    expect(megabytes(99.6 * MB)).toBe('100 МБ')
    expect(megabytes(2048)).toBe('2 КБ')
  })

  it('name sizes in English', () => {
    setLocale('en')
    expect(megabytes(1.5 * MB)).toBe('1.5 MB')
    expect(megabytes(2048)).toBe('2 KB')
    expect(imageUploadError(new HttpError(413, { limit: 1_000_000, scope: 'pixels' }))).toBe('The image is larger than 1 megapixel')
  })

  it('tell why the backend refused a picture', () => {
    expect(imageUploadError(new HttpError(403))).toBe(IMAGE_FORBIDDEN)
    expect(imageUploadError(new HttpError(413, { limit: 10 * MB }))).toBe('Изображение больше 10 МБ')
    expect(imageUploadError(new HttpError(413, { limit: 50_000_000, scope: 'pixels' }))).toBe('Изображение больше 50 мегапикселей')
    expect(imageUploadError(new HttpError(415))).toBe(UNSUPPORTED_IMAGE)
    expect(imageUploadError(new HttpError(409))).toBe('На доске нет места для изображений')
    expect(imageUploadError(new HttpError(503))).toBe(IMAGE_FAILED)
    expect(imageUploadError(new Error('offline'))).toBe(IMAGE_FAILED)
  })
})
