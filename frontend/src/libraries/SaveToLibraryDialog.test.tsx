import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ShapeLibrary } from '../api/libraries.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { SaveToLibraryDialog } from './SaveToLibraryDialog.tsx'
import type { LibraryShelf, SaveResult } from './useLibraries.ts'

const LIBRARIES: ShapeLibrary[] = [
  { id: 'l1', name: 'Платежи', components: [] },
  { id: 'l2', name: 'Брокеры', components: [] },
]
const request = { x: 100, y: 50, point: { x: 300, y: 200 }, target: 'shape' as const, cellId: 'cell-1' }

function open(libraries: ShapeLibrary[] | undefined, saved: SaveResult = { error: null, libraryId: 'l1' }) {
  const editor = createFakeEditor()
  editor.selectionComponent = vi.fn(() => ({ cells: [], image: null, name: 'Сервис' }))
  const shelf = { libraries, saveSelection: vi.fn(async () => saved) } as unknown as LibraryShelf
  const onClose = vi.fn()
  render(<SaveToLibraryDialog editor={editor} shelf={shelf} request={request} onClose={onClose} />)
  return { editor, shelf, onClose }
}

describe('SaveToLibraryDialog', () => {
  it('saves the selection with the name of the shape into the first library, and closes', async () => {
    const { editor, shelf, onClose } = open(LIBRARIES)

    expect(screen.getByRole('textbox', { name: 'Название' })).toHaveValue('Сервис')
    const library = screen.getByRole('combobox', { name: 'Библиотека' })
    expect(Array.from((library as HTMLSelectElement).options, (option) => option.text)).toEqual(['Платежи', 'Брокеры', 'Новая библиотека…'])
    await userEvent.selectOptions(library, 'Брокеры')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(shelf.saveSelection).toHaveBeenCalledWith(editor, { libraryId: 'l2' }, 'Сервис')
    expect(onClose).toHaveBeenCalled()
  })

  it('makes a new library «Мои фигуры» when the user has none, under the name they write', async () => {
    const { editor, shelf } = open([])

    expect(screen.getByRole('combobox', { name: 'Библиотека' })).toHaveValue('')
    const name = screen.getByRole('textbox', { name: 'Название библиотеки' })
    expect(name).toHaveValue('Мои фигуры')
    await userEvent.clear(name)
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
    await userEvent.type(name, 'Эскизы')
    await userEvent.type(screen.getByRole('textbox', { name: 'Название' }), '{End} с БД{Enter}')

    expect(shelf.saveSelection).toHaveBeenCalledWith(editor, { newLibrary: 'Эскизы' }, 'Сервис с БД')
  })

  it('stays open with the reason when saving fails', async () => {
    const { onClose } = open(LIBRARIES, { error: 'В библиотеке уже 200 компонентов — больше не поместится', libraryId: 'l1' })

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('В библиотеке уже 200 компонентов — больше не поместится')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('saves again into the new library it made when the component did not fit into it, not into another new one', async () => {
    const editor = createFakeEditor()
    editor.selectionComponent = vi.fn(() => ({ cells: [], image: null, name: 'Сервис' }))
    const saveSelection = vi.fn(async () => ({ error: 'Изображение больше 2 МБ', libraryId: 'l9' }))
    const shelf = { libraries: [], saveSelection } as unknown as LibraryShelf
    const { rerender } = render(<SaveToLibraryDialog editor={editor} shelf={shelf} request={request} onClose={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await screen.findByRole('alert')
    // The list of libraries has the new one by now.
    const withNew = { libraries: [{ id: 'l9', name: 'Мои фигуры', components: [] }], saveSelection } as unknown as LibraryShelf
    rerender(<SaveToLibraryDialog editor={editor} shelf={withNew} request={request} onClose={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Библиотека' })).toHaveValue('l9')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(saveSelection).toHaveBeenNthCalledWith(1, editor, { newLibrary: 'Мои фигуры' }, 'Сервис')
    expect(saveSelection).toHaveBeenNthCalledWith(2, editor, { libraryId: 'l9' }, 'Сервис')
  })
})
