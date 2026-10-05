import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SHAPE_DRAG_TYPE } from '../diagram/shapes.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { EmptyBoardTemplates } from './EmptyBoardTemplates.tsx'

describe('EmptyBoardTemplates', () => {
  it('offers the templates on an empty board and puts the chosen one onto the page', async () => {
    const editor = createFakeEditor()
    render(<EmptyBoardTemplates editor={editor} onlyPage />)

    const card = screen.getByRole('region', { name: 'Начните с шаблона' })
    expect(within(card).getAllByRole('button', { name: /ER-диаграмма|C4|Микросервисы|Kubernetes/ })).toHaveLength(4)
    await userEvent.click(within(card).getByRole('button', { name: /C4: контейнеры/ }))

    expect(editor.insertCells).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ kind: 'edge' })]))
  })

  it('goes away when the page gets something and when it is closed', async () => {
    const editor = createFakeEditor()
    render(<EmptyBoardTemplates editor={editor} onlyPage />)

    act(() => editor.setState({ hasCells: true }))
    expect(screen.queryByRole('region', { name: 'Начните с шаблона' })).toBeNull()

    act(() => editor.setState({ hasCells: false }))
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('region', { name: 'Начните с шаблона' })).toBeNull()
  })

  it('is not shown on a board of several pages or to a participant who may only view', () => {
    render(<EmptyBoardTemplates editor={createFakeEditor()} onlyPage={false} />)
    render(<EmptyBoardTemplates editor={createFakeEditor({ readOnly: true })} onlyPage />)

    expect(screen.queryByRole('region', { name: 'Начните с шаблона' })).toBeNull()
  })

  it('lets a shape dragged from the palette through to the canvas', () => {
    render(<EmptyBoardTemplates editor={createFakeEditor()} onlyPage />)
    const card = screen.getByRole('region', { name: 'Начните с шаблона' })

    fireEvent.dragStart(document.body, { dataTransfer: { types: [SHAPE_DRAG_TYPE] } })
    expect(card).toHaveClass('pointer-events-none')

    fireEvent.dragEnd(document.body)
    expect(card).toHaveClass('pointer-events-auto')
  })
})
