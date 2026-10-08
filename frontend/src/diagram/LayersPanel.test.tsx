import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import type { LayerState } from './editor.ts'
import { LayersPanel } from './LayersPanel.tsx'

const layer = (changes: Partial<LayerState> = {}): LayerState => ({
  id: 'main',
  name: 'Основной слой',
  ownName: '',
  main: true,
  visible: true,
  hiddenForAll: false,
  ownVisibility: null,
  locked: false,
  lockedBy: null,
  active: false,
  elements: 0,
  selected: 0,
  canMoveSelection: false,
  holdsLocked: false,
  ...changes,
})

const NOTES = layer({ id: 'notes', name: 'Заметки', ownName: 'Заметки', main: false, elements: 2, active: true })
const MAIN = layer({ elements: 3 })

describe('LayersPanel', () => {
  let editor: FakeEditor
  const onClose = vi.fn()

  beforeEach(() => {
    editor = createFakeEditor()
    editor.setState({ layers: [NOTES, MAIN] })
    onClose.mockClear()
  })

  const rowOf = (name: string) => screen.getByRole('listitem', { name })

  it('lists the layers top first with their elements and the active one, and tells the rule of visibility', () => {
    render(<LayersPanel editor={editor} onClose={onClose} />)

    const rows = within(screen.getByRole('list', { name: 'Слои страницы' })).getAllByRole('listitem')
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(['Заметки', 'Основной слой'])
    expect(rowOf('Заметки')).toHaveAttribute('aria-current', 'true')
    expect(within(rowOf('Заметки')).getByText('новые элементы здесь')).toBeInTheDocument()
    expect(within(rowOf('Основной слой')).getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/Глаз скрывает слой только у вас/)).toBeInTheDocument()
  })

  it('hides a layer for the participant, locks it for everybody and makes it active', async () => {
    const user = userEvent.setup()
    render(<LayersPanel editor={editor} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Скрыть у себя «Основной слой»' }))
    await user.click(screen.getByRole('button', { name: 'Заблокировать «Основной слой»' }))
    await user.click(screen.getByRole('button', { name: 'Сделать активным «Основной слой»' }))

    expect(editor.setLayerVisible).toHaveBeenCalledWith('main', false)
    expect(editor.setLayerLocked).toHaveBeenCalledWith('main', true)
    expect(editor.setActiveLayer).toHaveBeenCalledWith('main')
  })

  it('tells which visibility a layer has and who locked it', () => {
    editor.setState({
      layers: [
        layer({ id: 'a', name: 'A', visible: false, ownVisibility: false }),
        layer({ id: 'b', name: 'B', visible: false, hiddenForAll: true }),
        layer({ id: 'c', name: 'C', hiddenForAll: true, ownVisibility: true, locked: true, lockedBy: 'Борис' }),
      ],
    })
    render(<LayersPanel editor={editor} onClose={onClose} />)

    expect(within(rowOf('A')).getByText('скрыт только у вас')).toBeInTheDocument()
    expect(within(rowOf('B')).getByText('скрыт для всех')).toBeInTheDocument()
    expect(within(rowOf('C')).getByText('показан только у вас · заблокировал Борис')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Показать у себя «A»' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('adds a layer and starts naming it; Enter applies the name and Escape keeps the old one', async () => {
    const user = userEvent.setup()
    vi.mocked(editor.addLayer).mockImplementation(() => {
      act(() => editor.setState({ layers: [layer({ id: 'new', name: 'Слой 3', ownName: 'Слой 3', main: false }), NOTES, MAIN] }))
      return 'new'
    })
    render(<LayersPanel editor={editor} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Новый слой' }))
    const input = screen.getByRole('textbox', { name: 'Имя слоя' })
    expect(input).toHaveValue('Слой 3')
    await user.clear(input)
    await user.type(input, 'Инфраструктура{Enter}')
    expect(editor.renameLayer).toHaveBeenCalledWith('new', 'Инфраструктура')

    await user.dblClick(screen.getByRole('button', { name: 'Сделать активным «Заметки»' }))
    await user.type(screen.getByRole('textbox', { name: 'Имя слоя' }), 'Идеи{Escape}')
    expect(editor.renameLayer).toHaveBeenCalledTimes(1)
  })

  it('moves a layer, takes the selection in and hides it for everybody from its menu', async () => {
    const user = userEvent.setup()
    editor.setState({ layers: [NOTES, { ...MAIN, canMoveSelection: true }] })
    render(<LayersPanel editor={editor} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Действия со слоем «Заметки»' }))
    const menu = screen.getByRole('menu', { name: 'Слой «Заметки»' })
    expect(within(menu).getByRole('menuitem', { name: 'Выше' })).toBeDisabled()
    expect(within(menu).getByRole('menuitem', { name: 'Перенести выделенное сюда' })).toBeDisabled()
    await user.click(within(menu).getByRole('menuitem', { name: 'Ниже' }))
    expect(editor.moveLayer).toHaveBeenCalledWith('notes', 'down')

    await user.click(screen.getByRole('button', { name: 'Действия со слоем «Основной слой»' }))
    await user.click(screen.getByRole('menuitem', { name: 'Перенести выделенное сюда' }))
    expect(editor.moveSelectionToLayer).toHaveBeenCalledWith('main')
    await user.click(screen.getByRole('button', { name: 'Действия со слоем «Основной слой»' }))
    await user.click(screen.getByRole('menuitem', { name: 'Скрыть для всех' }))
    expect(editor.setLayerHidden).toHaveBeenCalledWith('main', true)
  })

  it('removes a layer with elements moving them into the layer under it, or with them', async () => {
    const user = userEvent.setup()
    render(<LayersPanel editor={editor} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Действия со слоем «Заметки»' }))
    await user.click(screen.getByRole('menuitem', { name: 'Удалить слой' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Удаление слоя' })
    expect(dialog).toHaveTextContent('В слое «Заметки» элементов: 2')
    await user.click(within(dialog).getByRole('button', { name: 'Перенести в «Основной слой» и удалить слой' }))
    expect(editor.deleteLayer).toHaveBeenCalledWith('notes', 'main')

    await user.click(screen.getByRole('button', { name: 'Действия со слоем «Заметки»' }))
    await user.click(screen.getByRole('menuitem', { name: 'Удалить слой' }))
    await user.click(screen.getByRole('button', { name: 'Удалить вместе с элементами' }))
    expect(editor.deleteLayer).toHaveBeenCalledWith('notes', null)
  })

  it('removes an empty layer at once and keeps the main and locked layers', async () => {
    const user = userEvent.setup()
    editor.setState({ layers: [{ ...NOTES, elements: 0 }, layer({ id: 'zones', name: 'Зоны', main: false, locked: true }), MAIN] })
    render(<LayersPanel editor={editor} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Действия со слоем «Заметки»' }))
    await user.click(screen.getByRole('menuitem', { name: 'Удалить слой' }))
    expect(editor.deleteLayer).toHaveBeenCalledWith('notes', null)

    await user.click(screen.getByRole('button', { name: 'Действия со слоем «Основной слой»' }))
    expect(screen.getByRole('menuitem', { name: 'Удалить слой' })).toBeDisabled()
    expect(screen.getByText('Основной слой страницы нельзя удалить')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Действия со слоем «Зоны»' }))
    expect(screen.getByText('Заблокированный слой нельзя удалить')).toBeInTheDocument()
  })

  it('offers only moving the elements of a layer that holds a locked one', async () => {
    const user = userEvent.setup()
    editor.setState({ layers: [{ ...NOTES, holdsLocked: true }, MAIN] })
    render(<LayersPanel editor={editor} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Действия со слоем «Заметки»' }))
    await user.click(screen.getByRole('menuitem', { name: 'Удалить слой' }))

    expect(screen.getByRole('button', { name: 'Удалить вместе с элементами' })).toBeDisabled()
    expect(screen.getByText(/их можно только перенести/)).toBeInTheDocument()
  })

  it('lets a participant who may only view show and hide layers only', async () => {
    const user = userEvent.setup()
    editor = createFakeEditor({ readOnly: true })
    editor.setState({ layers: [NOTES, MAIN] })
    render(<LayersPanel editor={editor} onClose={onClose} />)

    expect(screen.queryByRole('button', { name: 'Новый слой' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Действия со слоем/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Заблокировать «Заметки»' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Скрыть у себя «Заметки»' }))
    expect(editor.setLayerVisible).toHaveBeenCalledWith('notes', false)
  })

  it('closes', async () => {
    const user = userEvent.setup()
    render(<LayersPanel editor={editor} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Закрыть' }))

    expect(onClose).toHaveBeenCalled()
  })
})
