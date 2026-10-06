import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DEFAULT_PAGE_ID, initializeDocument } from '../diagram/model.ts'
import { renamePage } from '../diagram/pages.ts'
import { findLocalCopy, openLocalCopy, setUnsentEdits } from './localCopies.ts'
import { UnsentCopy } from './UnsentCopy.tsx'

const userId = '0199a000-0000-7000-8000-0000000000a1'
const boardId = '0199a000-0000-7000-8000-000000000001'

/** Keeps a copy of the board with one page named `page` in the browser. */
async function storeCopy({ pending, title = 'Склад', page = 'Без связи' }: { pending: boolean; title?: string; page?: string }) {
  const document = new Y.Doc()
  const persistence = openLocalCopy(userId, boardId, title, document)!
  await persistence.whenSynced
  initializeDocument(document)
  renamePage(document, DEFAULT_PAGE_ID, page)
  await persistence.destroy()
  setUnsentEdits(userId, boardId, pending)
}

/** Stubs the download of a file and returns the files the component saves. */
function captureDownloads() {
  const files: { name: string; blob: Blob }[] = []
  let blob: Blob | null = null
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn((created: Blob) => ((blob = created), 'blob:test')), revokeObjectURL: vi.fn() }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    files.push({ name: this.download, blob: blob! })
  })
  return files
}

describe('UnsentCopy', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows nothing when the copy holds no unsent edits', async () => {
    await storeCopy({ pending: false })

    const { container } = render(<UnsentCopy userId={userId} boardId={boardId} reason="kept" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('tells why the edits were not sent', async () => {
    await storeCopy({ pending: true })

    const { unmount } = render(<UnsentCopy userId={userId} boardId={boardId} reason="no-edit-right" role="alert" />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Правки, сделанные без связи, не отправлены: у вас больше нет права правки',
    )
    unmount()

    render(<UnsentCopy userId={userId} boardId={boardId} reason="kept" />)
    expect(screen.getByText('Неотправленные правки остались в копии доски на этом устройстве')).toBeInTheDocument()
  })

  it('downloads the copy as a draw.io file named after the board', async () => {
    await storeCopy({ pending: true, title: 'Склад', page: 'Без связи' })
    const files = captureDownloads()
    const { unmount } = render(<UnsentCopy userId={userId} boardId={boardId} title="Склад и доставка" reason="kept" />)

    await userEvent.click(screen.getByRole('button', { name: 'Скачать копию (.drawio)' }))

    await waitFor(() => expect(files).toHaveLength(1))
    expect(files[0]!.name).toBe('Склад и доставка.drawio')
    expect(await files[0]!.blob.text()).toMatch(/<diagram [^>]*name="Без связи"/)
    expect(findLocalCopy(userId, boardId)).not.toBeNull()
    unmount()

    // A board the page could not fetch is named as the copy recorded it.
    render(<UnsentCopy userId={userId} boardId={boardId} reason="kept" />)
    await userEvent.click(screen.getByRole('button', { name: 'Скачать копию (.drawio)' }))
    await waitFor(() => expect(files).toHaveLength(2))
    expect(files[1]!.name).toBe('Склад.drawio')
  })

  it('deletes the copy once the deletion is confirmed', async () => {
    await storeCopy({ pending: true })
    const onDeleted = vi.fn()
    const { container } = render(<UnsentCopy userId={userId} boardId={boardId} reason="kept" onDeleted={onDeleted} />)

    await userEvent.click(screen.getByRole('button', { name: 'Удалить копию с устройства' }))
    expect(screen.getByText('Удалить копию? Правки из неё пропадут.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(findLocalCopy(userId, boardId)).not.toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Удалить копию с устройства' }))
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(findLocalCopy(userId, boardId)).toBeNull()
    expect((await indexedDB.databases()).map((database) => database.name)).toEqual([])
    expect(container).toBeEmptyDOMElement()
  })

  it('deletes at once a copy without unsent edits of a board that can no longer be opened', async () => {
    await storeCopy({ pending: false })

    render(<UnsentCopy userId={userId} boardId={boardId} reason="kept" dropSent />)

    await waitFor(() => expect(findLocalCopy(userId, boardId)).toBeNull())
  })

  it('keeps a copy with unsent edits of a board that can no longer be opened until it is deleted', async () => {
    await storeCopy({ pending: true })

    render(<UnsentCopy userId={userId} boardId={boardId} reason="kept" dropSent />)

    expect(screen.getByRole('button', { name: 'Скачать копию (.drawio)' })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(findLocalCopy(userId, boardId)).not.toBeNull()
  })
})
