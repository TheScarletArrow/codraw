import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { SHAPE_DRAG_TYPE } from './shapes.ts'
import { ShapePalette } from './ShapePalette.tsx'

describe('ShapePalette', () => {
  it('lists the shapes of every section', () => {
    render(<ShapePalette editor={createFakeEditor()} />)

    const sections = screen.getAllByRole('group')
    expect(sections.map((section) => [section.getAttribute('aria-label'), within(section).getAllByRole('button').length])).toEqual([
      ['Основные', 5],
      ['База данных', 1],
      ['Архитектура', 8],
      ['Инфраструктура', 8],
      ['Данные и сообщения', 6],
      ['Клиенты', 4],
      ['UML', 4],
      ['C4', 7],
    ])
  })

  it('collapses and expands a section with a click on its title', async () => {
    render(<ShapePalette editor={createFakeEditor()} />)
    const c4 = screen.getByRole('group', { name: 'C4' })

    await userEvent.click(within(c4).getByText('C4'))
    expect(c4).not.toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'Container' })).not.toBeVisible()

    await userEvent.click(within(c4).getByText('C4'))
    expect(screen.getByRole('button', { name: 'Container' })).toBeVisible()
  })

  it('adds a table with a click', async () => {
    const editor = createFakeEditor()
    render(<ShapePalette editor={editor} />)

    await userEvent.click(screen.getByRole('button', { name: 'Таблица' }))

    expect(editor.addShape).toHaveBeenCalledWith('table')
  })

  it('drags a C4 container onto the canvas', () => {
    render(<ShapePalette editor={createFakeEditor()} />)
    const setData = vi.fn()

    fireEvent.dragStart(screen.getByRole('button', { name: 'Container' }), { dataTransfer: { setData } })

    expect(setData).toHaveBeenCalledWith(SHAPE_DRAG_TYPE, 'c4-container')
  })
})
