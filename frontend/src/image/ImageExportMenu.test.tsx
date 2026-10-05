import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { initializeDocument } from '../diagram/model.ts'
import type { ExportedImage } from '../diagram/svgExport.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { ImageExportMenu } from './ImageExportMenu.tsx'

const IMAGE: ExportedImage = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><text>Сервис</text></svg>',
  width: 120,
  height: 80,
  cellIds: null,
}

describe('ImageExportMenu', () => {
  let editor: FakeEditor
  let saved: { name: string; blob: Blob }[]

  beforeEach(() => {
    editor = createFakeEditor()
    vi.mocked(editor.exportSvg).mockReturnValue(IMAGE)
    saved = []
    // The download link gets the blob through its URL.
    const blobs = new Map<string, Blob>()
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      const url = `blob:${blobs.size}`
      blobs.set(url, blob as Blob)
      return url
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, blob: blobs.get(this.href)! })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function open(pageCount = 1) {
    const doc = new Y.Doc()
    initializeDocument(doc)
    render(<ImageExportMenu editor={editor} document={doc} boardTitle="Архитектура" pageName="Контейнеры" pageCount={pageCount} />)
    return userEvent.click(screen.getByRole('button', { name: 'Экспорт в изображение' }))
  }

  it('has nothing to save on an empty page', async () => {
    await open()

    expect(screen.getByText('На странице нет объектов')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сохранить PNG' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Сохранить SVG' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Копировать PNG' })).toBeDisabled()
  })

  it('saves the page as SVG with its diagram, named after the board and the page', async () => {
    act(() => editor.setState({ hasCells: true }))
    await open(2)

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить SVG' }))

    expect(editor.exportSvg).toHaveBeenCalledWith({ selectionOnly: false, transparent: false })
    expect(saved).toHaveLength(1)
    expect(saved[0]!.name).toBe('Архитектура — Контейнеры.svg')
    const svg = await saved[0]!.blob.text()
    expect(svg).toContain('Сервис')
    expect(svg).toMatch(/content="&lt;mxfile/)
  })

  it('offers only the selection while shapes are selected, and a transparent background', async () => {
    act(() => editor.setState({ hasCells: true }))
    await open()
    expect(screen.getByRole('checkbox', { name: 'Только выделенное' })).toBeDisabled()

    act(() => editor.setState({ canCopy: true }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Только выделенное' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Прозрачный фон' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить SVG' }))

    expect(editor.exportSvg).toHaveBeenLastCalledWith({ selectionOnly: true, transparent: true })

    // The selection is gone: the whole page is saved.
    act(() => editor.setState({ canCopy: false }))
    expect(screen.getByRole('checkbox', { name: 'Только выделенное' })).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить SVG' }))
    expect(editor.exportSvg).toHaveBeenLastCalledWith({ selectionOnly: false, transparent: true })
  })

  it('offers PNG scales from 1× to 4×, 2× by default', async () => {
    act(() => editor.setState({ hasCells: true }))
    await open()

    const scale = screen.getByRole('combobox', { name: 'Масштаб PNG' })
    expect(scale).toHaveValue('2')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['1×', '2×', '3×', '4×'])
  })

  it('tells when the browser does not let the image into the clipboard', async () => {
    vi.stubGlobal('ClipboardItem', class {})
    // user-event puts its own clipboard into jsdom, which has none.
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'write').mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    act(() => editor.setState({ hasCells: true }))
    await open()

    await user.click(screen.getByRole('button', { name: 'Копировать PNG' }))

    expect(write).toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось скопировать изображение')
    vi.unstubAllGlobals()
  })
})
