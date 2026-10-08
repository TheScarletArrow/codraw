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
      // The shapes, «Стикер» and «Изображение».
      ['Основные', 11],
      ['База данных', 1],
      ['Структуры', 2],
      ['Блок-схемы', 6],
      ['BPMN', 5],
      ['Архитектура', 8],
      ['Инфраструктура', 8],
      ['Данные и сообщения', 6],
      ['Клиенты', 4],
      ['UML', 5],
      ['C4', 7],
      ['Провайдеры', 10],
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

  it('shows the shapes a search finds instead of the sections, and adds the first one with Enter', async () => {
    const editor = createFakeEditor()
    render(<ShapePalette editor={editor} />)

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск фигур' }), 'kafka')

    expect(screen.queryByRole('group', { name: 'C4' })).toBeNull()
    const found = screen.getByRole('group', { name: 'Найденные фигуры' })
    expect(within(found).getAllByRole('button').map((button) => button.textContent)).toEqual(['Kafka', 'Топик событий'])

    await userEvent.keyboard('{Enter}')
    expect(editor.addShape).toHaveBeenCalledWith('provider-kafka')
  })

  it('tells when nothing is found, and Escape brings the sections back', async () => {
    render(<ShapePalette editor={createFakeEditor()} />)
    const search = screen.getByRole('searchbox', { name: 'Поиск фигур' })

    await userEvent.type(search, 'zzz')
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(search).toHaveValue('')
    expect(screen.getByRole('group', { name: 'C4' })).toBeInTheDocument()
  })

  it('lets a found shape be dragged onto the canvas', () => {
    render(<ShapePalette editor={createFakeEditor()} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск фигур' }), { target: { value: 'redis' } })
    const setData = vi.fn()

    fireEvent.dragStart(screen.getByRole('button', { name: 'Кэш' }), { dataTransfer: { setData, effectAllowed: '' } })

    expect(setData).toHaveBeenCalledWith(SHAPE_DRAG_TYPE, 'cache')
  })

  it('«Изображение» picks image files and adds them, once the canvas stores images', async () => {
    const editor = createFakeEditor()
    const { rerender } = render(<ShapePalette editor={editor} />)
    const button = screen.getByRole('button', { name: 'Изображение' })
    expect(button).toBeDisabled()

    editor.setState({ canAddImages: true })
    rerender(<ShapePalette editor={editor} />)
    expect(button).toBeEnabled()
    const input = screen.getByLabelText('Файлы изображений')
    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg,image/gif,image/webp')
    const files = [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })]
    await userEvent.upload(input, files)

    expect(editor.addImages).toHaveBeenCalledWith(files)
    // The same files can be picked again.
    expect(input).toHaveValue('')
  })

  it('a search for a picture offers «Изображение»', async () => {
    render(<ShapePalette editor={createFakeEditor()} />)

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск фигур' }), 'картин')

    const found = screen.getByRole('group', { name: 'Найденные фигуры' })
    expect(within(found).getByRole('button', { name: 'Изображение' })).toBeInTheDocument()
  })
})
