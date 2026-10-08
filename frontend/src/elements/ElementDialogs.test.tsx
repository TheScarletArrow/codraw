import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DEFAULT_PAGE_ID, ELEMENT_KEY, getCells, initializeDocument, writeCell } from '../diagram/model.ts'
import { addPage } from '../diagram/pages.ts'
import { shapeData } from '../diagram/testing.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { DeleteElementDialog, MergeElementsDialog } from './ElementDialogs.tsx'

const request = { x: 100, y: 50, point: { x: 300, y: 200 }, target: 'shape' as const, cellId: 'a' }
const properties = (name: string, technology = '') => ({ name, kind: 'c4-container' as const, technology, description: '', owner: '', tags: [] })

describe('MergeElementsDialog', () => {
  it('asks whose properties to keep, the first chosen, and merges into the chosen one', async () => {
    const editor = createFakeEditor()
    vi.mocked(editor.mergeCandidates).mockReturnValue([
      { cellId: 'a', elementId: 'e1', properties: properties('Payments', 'Kotlin'), pages: 2 },
      { cellId: 'b', elementId: null, properties: properties('payments'), pages: 1 },
    ])
    const onClose = vi.fn()
    render(<MergeElementsDialog editor={editor} request={request} onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'Объединить в один элемент' })
    expect(within(dialog).getByRole('radio', { name: /Payments.*Container · Kotlin · 2 стр\./ })).toBeChecked()
    await userEvent.click(within(dialog).getByRole('radio', { name: /^payments/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Объединить' }))

    expect(editor.mergeElements).toHaveBeenCalledWith('b')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('DeleteElementDialog', () => {
  it('names the pages that lose the cells and the locked cells that stay, and removes the element', async () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const context = addPage(doc, DEFAULT_PAGE_ID, 'Контекст')
    const style = { codrawShape: 'c4-container', [ELEMENT_KEY]: 'e1', codrawName: 'Payments' }
    doc.transact(() => {
      writeCell(getCells(doc), shapeData('a', 'a0', { style }))
      writeCell(getCells(doc), shapeData('a2', 'a1', { style }))
      writeCell(getCells(doc, context), shapeData('b', 'a0', { style: { ...style, locked: true } }))
    })
    const editor = createFakeEditor()
    vi.mocked(editor.selectedElement).mockReturnValue({ cellId: 'a', elementId: 'e1', properties: properties('Payments'), places: [], canChange: true })
    const onClose = vi.fn()
    render(<DeleteElementDialog editor={editor} document={doc} request={request} onClose={onClose} />)

    const dialog = screen.getByRole('alertdialog', { name: 'Удалить со всех страниц' })
    expect(dialog).toHaveTextContent('Удалить «Payments» со всех страниц?')
    expect(within(dialog).getByRole('list', { name: 'Страницы' })).toHaveTextContent('Страница 1 — 2')
    expect(dialog).toHaveTextContent('Закреплённые останутся: Контекст')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    expect(editor.deleteElementEverywhere).toHaveBeenCalledWith('a')
    expect(onClose).toHaveBeenCalled()
  })
})
