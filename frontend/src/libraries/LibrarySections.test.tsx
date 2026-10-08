import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ShapeLibrary } from '../api/libraries.ts'
import { ShapePalette } from '../diagram/ShapePalette.tsx'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { COMPONENT_DRAG_TYPE } from './drag.ts'
import type { LibraryShelf } from './useLibraries.ts'

const component = (id: string, name: string, preview: string | null = null) => ({ id, name, preview, updatedAt: '2026-10-08T10:00:00Z' })
const LIBRARIES: ShapeLibrary[] = [
  {
    id: 'l1',
    name: 'Платежи',
    components: [component('c1', 'Шлюз оплаты', 'data:image/png;base64,AAAA'), component('c2', 'Сервис счетов')],
  },
  { id: 'l2', name: 'Пустая', components: [] },
]

function fakeShelf(change: Partial<LibraryShelf> = {}): LibraryShelf {
  return {
    libraries: LIBRARIES,
    unavailable: false,
    error: null,
    pending: null,
    dismissError: vi.fn(),
    createLibrary: vi.fn(async () => null),
    renameLibrary: vi.fn(async () => {}),
    deleteLibrary: vi.fn(async () => {}),
    saveSelection: vi.fn(async () => null),
    addSelection: vi.fn(async () => {}),
    replaceWithSelection: vi.fn(async () => {}),
    renameComponent: vi.fn(async () => {}),
    deleteComponent: vi.fn(async () => {}),
    addFiles: vi.fn(async () => {}),
    insert: vi.fn(async () => {}),
    drop: vi.fn(async () => {}),
    applyStyle: vi.fn(async () => {}),
    ...change,
  }
}

function open(change: Partial<LibraryShelf> = {}) {
  const editor = createFakeEditor()
  const shelf = fakeShelf(change)
  render(<ShapePalette editor={editor} libraries={shelf} />)
  return { editor, shelf }
}

const menuOf = async (name: string) => {
  await userEvent.click(screen.getByRole('button', { name }))
  return screen.getByRole('menu')
}

describe('libraries in the panel of shapes', () => {
  it('shows the libraries of the user above the sections, each with its components, before the shapes', () => {
    open()

    const libraries = screen.getByRole('region', { name: 'Мои библиотеки' })
    const payments = within(libraries).getByRole('group', { name: 'Платежи' })
    expect(within(payments).getByRole('button', { name: 'Шлюз оплаты' })).toBeInTheDocument()
    expect(within(payments).getByRole('button', { name: 'Сервис счетов' })).toBeInTheDocument()
    expect(within(libraries).getByRole('group', { name: 'Пустая' })).toHaveTextContent('Пусто')
    expect(screen.getAllByRole('group').map((group) => group.getAttribute('aria-label')).slice(0, 3)).toEqual([
      'Платежи',
      'Пустая',
      'Основные',
    ])
  })

  it('adds a component with a click and lets it be dragged onto the canvas', async () => {
    const { editor, shelf } = open()

    await userEvent.click(screen.getByRole('button', { name: 'Шлюз оплаты' }))
    expect(shelf.insert).toHaveBeenCalledWith(editor, 'l1', LIBRARIES[0]!.components[0])

    const setData = vi.fn()
    fireEvent.dragStart(screen.getByRole('button', { name: 'Сервис счетов' }), { dataTransfer: { setData } })
    expect(setData).toHaveBeenCalledWith(COMPONENT_DRAG_TYPE, JSON.stringify({ libraryId: 'l1', componentId: 'c2' }))
  })

  it('finds components before shapes, and Enter adds the first one', async () => {
    const { editor, shelf } = open()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск фигур' }), 'шлюз')

    const found = screen.getByRole('group', { name: 'Найденные фигуры' })
    expect(within(found).getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['Из библиотек', 'Фигуры'])
    expect(within(found).getAllByRole('button')[0]).toHaveTextContent('Шлюз оплаты')
    await userEvent.keyboard('{Enter}')
    expect(shelf.insert).toHaveBeenCalledWith(editor, 'l1', LIBRARIES[0]!.components[0])
    expect(editor.addShape).not.toHaveBeenCalled()
  })

  it('creates a library by its name', async () => {
    const { shelf } = open()

    await userEvent.click(screen.getByRole('button', { name: 'Новая библиотека' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Название новой библиотеки' }), 'Брокеры{Enter}')

    expect(shelf.createLibrary).toHaveBeenCalledWith('Брокеры')
  })

  it('tells how to fill the libraries when there are none, and when they cannot be loaded', () => {
    const { unmount } = render(<ShapePalette editor={createFakeEditor()} libraries={fakeShelf({ libraries: [] })} />)
    expect(screen.getByText(/выберите «Сохранить в библиотеку…» в меню правого щелчка/)).toBeInTheDocument()
    unmount()

    render(<ShapePalette editor={createFakeEditor()} libraries={fakeShelf({ libraries: undefined, unavailable: true })} />)
    expect(screen.getByText('Библиотеки сейчас недоступны')).toBeInTheDocument()
  })

  it('adds the selection to a library once there is one, renames the library and deletes it after a confirmation', async () => {
    const { editor, shelf } = open()

    let menu = await menuOf('Меню библиотеки «Платежи»')
    expect(within(menu).getByRole('menuitem', { name: 'Добавить выделенное' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    act(() => editor.setState({ canCopy: true }))
    menu = await menuOf('Меню библиотеки «Платежи»')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Добавить выделенное' }))
    expect(shelf.addSelection).toHaveBeenCalledWith(editor, 'l1')

    menu = await menuOf('Меню библиотеки «Платежи»')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Переименовать библиотеку' }))
    const name = screen.getByRole('textbox', { name: 'Название библиотеки' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Оплата{Enter}')
    expect(shelf.renameLibrary).toHaveBeenCalledWith('l1', 'Оплата')

    menu = await menuOf('Меню библиотеки «Платежи»')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Удалить библиотеку…' }))
    const confirmation = screen.getByRole('alertdialog')
    expect(confirmation).toHaveTextContent('Удалить библиотеку «Платежи» с 2 компонентами? Вставленные на доски копии останутся.')
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Удалить' }))
    expect(shelf.deleteLibrary).toHaveBeenCalledWith('l1')
  })

  it('adds picture files and SVG to a library', async () => {
    const { shelf } = open()
    const input = screen.getByLabelText('Изображения для библиотеки «Платежи»')
    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.svg')
    const files = [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })]

    await userEvent.upload(input, files)

    expect(shelf.addFiles).toHaveBeenCalledWith('l1', files)
  })

  it('renames a component, replaces it with the selection, applies its look and deletes it after a confirmation', async () => {
    const { editor, shelf } = open()
    act(() => editor.setState({ canCopy: true }))
    const gateway = LIBRARIES[0]!.components[0]!

    let menu = await menuOf('Меню компонента «Шлюз оплаты»')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Заменить выделенным' }))
    expect(shelf.replaceWithSelection).toHaveBeenCalledWith(editor, 'l1', 'c1')

    menu = await menuOf('Меню компонента «Шлюз оплаты»')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Применить стиль к выделенному' }))
    expect(shelf.applyStyle).toHaveBeenCalledWith(editor, 'l1', gateway)

    menu = await menuOf('Меню компонента «Шлюз оплаты»')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Переименовать' }))
    const name = screen.getByRole('textbox', { name: 'Название компонента' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Платёжный шлюз{Enter}')
    expect(shelf.renameComponent).toHaveBeenCalledWith('l1', 'c1', 'Платёжный шлюз')

    menu = await menuOf('Меню компонента «Шлюз оплаты»')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Удалить' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Удалить компонент «Шлюз оплаты»? Вставленные на доски копии останутся.')
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Удалить' }))
    expect(shelf.deleteComponent).toHaveBeenCalledWith('l1', 'c1')
  })

  it('shows what is being done and why the last change failed, until it is dismissed', async () => {
    const { shelf } = open({ pending: 'Сохранение в библиотеку…', error: 'Больше 20 библиотек не создать' })

    expect(screen.getByRole('status')).toHaveTextContent('Сохранение в библиотеку…')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Больше 20 библиотек не создать')
    await userEvent.click(within(alert).getByRole('button', { name: 'Понятно' }))
    expect(shelf.dismissError).toHaveBeenCalled()
  })
})
