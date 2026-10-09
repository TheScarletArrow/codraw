import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor } from '../diagram/editor.ts'
import { DEFAULT_PAGE_ID, initializeDocument } from '../diagram/model.ts'
import { addPage } from '../diagram/pages.ts'
import type { ExportedImage } from '../diagram/svgExport.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { ImageExportMenu } from './ImageExportMenu.tsx'
import { imagesToPdf } from './pdf.ts'

// jsPDF and the fonts are tested on their own; here the PDF only has to be made of the right images.
vi.mock('./pdf.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pdf.ts')>()),
  imagesToPdf: vi.fn(async () => new Blob(['%PDF-1.3'], { type: 'application/pdf' })),
}))

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

  function open(pageCount = 1, doc = emptyBoard()) {
    render(<ImageExportMenu editor={editor} document={doc} boardTitle="Архитектура" pageName="Контейнеры" pageCount={pageCount} />)
    return userEvent.click(screen.getByRole('button', { name: 'Экспорт в изображение' }))
  }

  function emptyBoard() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    return doc
  }

  /** A board with the shape «Сервис» on its first page and an empty second page, the page of the editor. */
  function boardOfTwoPages() {
    const doc = emptyBoard()
    const second = addPage(doc, DEFAULT_PAGE_ID, 'Контейнеры')
    const container = document.createElement('div')
    document.body.append(container)
    const other = createDiagramEditor(container, doc)
    const builder = new DiagramBuilder()
    builder.shape('rectangle', 0, 0, { value: 'Сервис' })
    other.insertCells(builder.build())
    other.destroy()
    container.remove()
    editor = createFakeEditor({ pageId: second })
    vi.mocked(editor.exportSvg).mockReturnValue(IMAGE)
    return doc
  }

  it('has nothing to save on an empty page', async () => {
    await open()

    expect(screen.getByText('На странице нет объектов')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сохранить PNG' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Сохранить SVG' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Сохранить PDF' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Копировать PNG' })).toBeDisabled()
  })

  it('saves the page as SVG with its diagram, named after the board and the page', async () => {
    act(() => editor.setState({ hasCells: true }))
    await open(2)

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить SVG' }))

    expect(editor.exportSvg).toHaveBeenCalledWith({ selectionOnly: false, onlyVisible: false, transparent: false, links: true })
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

    expect(editor.exportSvg).toHaveBeenLastCalledWith({ selectionOnly: true, onlyVisible: false, transparent: true, links: true })

    // The selection is gone: the whole page is saved.
    act(() => editor.setState({ canCopy: false }))
    expect(screen.getByRole('checkbox', { name: 'Только выделенное' })).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить SVG' }))
    expect(editor.exportSvg).toHaveBeenLastCalledWith({ selectionOnly: false, onlyVisible: false, transparent: true, links: true })
  })

  it('offers only what is visible while the page is filtered', async () => {
    act(() => editor.setState({ hasCells: true }))
    await open()
    expect(screen.queryByRole('checkbox', { name: 'Только видимое' })).toBeNull()

    act(() => editor.setState({ filter: { matched: 2, total: 3, hide: false } }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Только видимое' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить SVG' }))
    expect(editor.exportSvg).toHaveBeenLastCalledWith({ selectionOnly: false, onlyVisible: true, transparent: false, links: true })

    // The filter is gone: the whole page is saved.
    act(() => editor.setState({ filter: null }))
    expect(screen.queryByRole('checkbox', { name: 'Только видимое' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить SVG' }))
    expect(editor.exportSvg).toHaveBeenLastCalledWith({ selectionOnly: false, onlyVisible: false, transparent: false, links: true })
  })

  it('offers PNG scales from 1× to 4×, 2× by default', async () => {
    act(() => editor.setState({ hasCells: true }))
    await open()

    const scale = screen.getByRole('combobox', { name: 'Масштаб PNG' })
    expect(scale).toHaveValue('2')
    expect(within(scale).getAllByRole('option').map((option) => option.textContent)).toEqual(['1×', '2×', '3×', '4×'])
  })

  it('saves the page as PDF, named after the board and the page', async () => {
    act(() => editor.setState({ hasCells: true }))
    await open(2)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Прозрачный фон' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить PDF' }))

    expect(editor.exportSvg).toHaveBeenLastCalledWith({ selectionOnly: false, onlyVisible: false, transparent: true, links: true })
    expect(imagesToPdf).toHaveBeenLastCalledWith([IMAGE])
    expect(saved.map(({ name, blob }) => [name, blob.type])).toEqual([['Архитектура — Контейнеры.pdf', 'application/pdf']])
  })

  it('has only the current page of a board of one page in a PDF', async () => {
    act(() => editor.setState({ hasCells: true }))
    await open(1)

    const pages = screen.getByRole('combobox', { name: 'Страницы PDF' })
    expect(pages).toBeDisabled()
    expect(pages).toHaveValue('current')
  })

  it('offers all pages of a board of several pages, but not with only the selection', async () => {
    act(() => editor.setState({ hasCells: true, canCopy: true }))
    await open(2)

    const pages = screen.getByRole('combobox', { name: 'Страницы PDF' })
    expect(within(pages).getAllByRole('option').map((option) => option.textContent)).toEqual(['Текущая страница', 'Все страницы'])
    await userEvent.selectOptions(pages, 'Все страницы')
    expect(pages).toHaveValue('all')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Только выделенное' }))
    expect(pages).toBeDisabled()
    expect(pages).toHaveValue('current')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить PDF' }))
    expect(editor.exportSvg).toHaveBeenLastCalledWith({ selectionOnly: true, onlyVisible: false, transparent: false, links: true })
    expect(saved.map(({ name }) => name)).toEqual(['Архитектура — Контейнеры.pdf'])
  })

  it('saves all pages with objects into one PDF named after the board, also from an empty page', async () => {
    const doc = boardOfTwoPages()
    await open(2, doc)
    expect(screen.getByRole('button', { name: 'Сохранить PDF' })).toBeDisabled()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Страницы PDF' }), 'Все страницы')
    expect(screen.getByRole('button', { name: 'Сохранить PNG' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить PDF' }))

    // The editor has nothing on its page: only the other page, drawn out of sight.
    const [images] = vi.mocked(imagesToPdf).mock.lastCall!
    expect(images.map((image) => image.svg.includes('Сервис'))).toEqual([true])
    expect(saved.map(({ name }) => name)).toEqual(['Архитектура.pdf'])
  })

  it('makes saving all pages possible once a page gets objects', async () => {
    const doc = emptyBoard()
    addPage(doc, DEFAULT_PAGE_ID, 'Контейнеры')
    await open(2, doc)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Страницы PDF' }), 'Все страницы')
    expect(screen.getByRole('button', { name: 'Сохранить PDF' })).toBeDisabled()

    act(() => {
      const container = document.createElement('div')
      document.body.append(container)
      const other = createDiagramEditor(container, doc)
      other.addShape('rectangle', { x: 0, y: 0 })
      other.destroy()
      container.remove()
    })

    expect(screen.getByRole('button', { name: 'Сохранить PDF' })).toBeEnabled()
  })

  it('tells while the PDF is made and when it could not be made', async () => {
    let fail: (error: Error) => void = () => {}
    vi.mocked(imagesToPdf).mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
    act(() => editor.setState({ hasCells: true }))
    await open()

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить PDF' }))

    expect(screen.getByText('PDF готовится…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сохранить PDF' })).toBeDisabled()
    await act(async () => fail(new Error('The font was not loaded')))
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось сохранить PDF')
    expect(screen.getByRole('button', { name: 'Сохранить PDF' })).toBeEnabled()
    expect(saved).toHaveLength(0)
  })

  it('tells when the browser does not let the image into the clipboard', async () => {
    vi.stubGlobal('ClipboardItem', class {})
    // user-event puts its own clipboard into jsdom, which has none.
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'write').mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    act(() => editor.setState({ hasCells: true }))
    await open()

    await user.click(screen.getByRole('button', { name: 'Копировать PNG' }))

    // A PNG has nothing to click: its image has no links.
    expect(editor.exportSvg).toHaveBeenLastCalledWith({ selectionOnly: false, onlyVisible: false, transparent: false, links: false })
    expect(write).toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось скопировать изображение')
    vi.unstubAllGlobals()
  })
})
