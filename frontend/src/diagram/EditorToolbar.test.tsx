import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { EditorToolbar } from './EditorToolbar.tsx'

describe('EditorToolbar', () => {
  let editor: FakeEditor

  beforeEach(() => {
    editor = createFakeEditor()
    render(<EditorToolbar editor={editor} />)
  })

  it('offers no table, edge, color, text or size tools without a selection', () => {
    expect(screen.queryByRole('button', { name: 'Добавить поле' })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Цвет линии' })).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: 'Размер текста' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Автоширина' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Размер' })).toBeNull()
  })

  it('adds a field to the selected table', async () => {
    act(() => editor.setState({ tableSelected: true }))

    await userEvent.click(screen.getByRole('button', { name: 'Добавить поле' }))

    expect(editor.addTableField).toHaveBeenCalled()
  })

  it('shows the markers of the selected edges and changes them', async () => {
    act(() => editor.setState({ edgeMarkers: { start: 'none', end: 'classic' } }))

    expect(screen.getByRole('combobox', { name: 'Начало связи' })).toHaveValue('none')
    expect(screen.getByRole('combobox', { name: 'Конец связи' })).toHaveValue('classic')
    expect(screen.getAllByRole('option', { name: 'Ноль или много' })).toHaveLength(2)

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Конец связи' }), 'Ноль или много')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Начало связи' }), 'Обязательно один')

    expect(editor.setEdgeMarker).toHaveBeenCalledWith('end', 'ERzeroToMany')
    expect(editor.setEdgeMarker).toHaveBeenCalledWith('start', 'ERmandOne')
  })

  it('shows an empty value when the selected edges have different markers', () => {
    act(() => editor.setState({ edgeMarkers: { start: 'none', end: null } }))

    expect(screen.getByRole('combobox', { name: 'Конец связи' })).toHaveValue('')
  })

  it('offers fill, line and text colors for selected shapes and applies them', async () => {
    act(() => editor.setState({ colors: { fill: '#ffffff', stroke: '#1f2328', font: '#1f2328', hasShapes: true } }))

    await userEvent.click(screen.getByRole('button', { name: 'Цвет заливки' }))
    await userEvent.click(screen.getByRole('button', { name: 'Розовый' }))
    await userEvent.click(screen.getByRole('button', { name: 'Цвет линии' }))
    await userEvent.click(screen.getByRole('button', { name: 'Красный' }))
    await userEvent.click(screen.getByRole('button', { name: 'Цвет текста' }))
    await userEvent.click(screen.getByRole('button', { name: 'Синий' }))

    expect(editor.setColor).toHaveBeenCalledWith('fill', '#f8cecc')
    expect(editor.setColor).toHaveBeenCalledWith('stroke', '#b85450')
    expect(editor.setColor).toHaveBeenCalledWith('font', '#6c8ebf')
  })

  it('offers no fill when only edges are selected', () => {
    act(() => editor.setState({ colors: { fill: null, stroke: '#1f2328', font: '#1f2328', hasShapes: false } }))

    expect(screen.queryByRole('button', { name: 'Цвет заливки' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Цвет линии' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Цвет текста' })).toBeInTheDocument()
  })

  it('shows the text size of the selection and changes it', async () => {
    act(() => editor.setState({ text: { fontSize: 13, autoWidth: false } }))

    expect(screen.getByRole('spinbutton', { name: 'Размер текста' })).toHaveValue(13)
    await userEvent.click(screen.getByRole('button', { name: 'Увеличить текст' }))
    await userEvent.click(screen.getByRole('button', { name: 'Уменьшить текст' }))
    await userEvent.clear(screen.getByRole('spinbutton', { name: 'Размер текста' }))
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Размер текста' }), '200{Enter}')

    expect(editor.stepFontSize).toHaveBeenNthCalledWith(1, 1)
    expect(editor.stepFontSize).toHaveBeenNthCalledWith(2, -1)
    expect(editor.setFontSize).toHaveBeenCalledWith(96)
  })

  it('shows an empty text size when the selected objects have different sizes', () => {
    act(() => editor.setState({ text: { fontSize: null, autoWidth: null } }))

    expect(screen.getByRole('spinbutton', { name: 'Размер текста' })).toHaveValue(null)
  })

  it('turns the auto width on and off', async () => {
    act(() => editor.setState({ text: { fontSize: 13, autoWidth: false } }))
    const autoWidth = screen.getByRole('button', { name: 'Автоширина' })
    expect(autoWidth).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(autoWidth)
    expect(editor.setAutoWidth).toHaveBeenLastCalledWith(true)

    act(() => editor.setState({ text: { fontSize: 13, autoWidth: true } }))
    expect(autoWidth).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(autoWidth)
    expect(editor.setAutoWidth).toHaveBeenLastCalledWith(false)
  })

  it('offers no auto width when no selected shape allows it', () => {
    act(() => editor.setState({ text: { fontSize: 11, autoWidth: null } }))

    expect(screen.getByRole('spinbutton', { name: 'Размер текста' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Автоширина' })).toBeNull()
  })

  it('opens the size and the position of the selected shapes and changes them', async () => {
    act(() => editor.setState({ geometry: { x: 40, y: 60, width: 120, height: null, canSetHeight: true } }))

    await userEvent.click(screen.getByRole('button', { name: 'Размер' }))
    const dialog = screen.getByRole('dialog', { name: 'Размер и положение' })
    expect(within(dialog).getByRole('spinbutton', { name: 'Ширина' })).toHaveValue(120)
    expect(within(dialog).getByRole('spinbutton', { name: 'Высота' })).toHaveValue(null)
    expect(within(dialog).getByRole('spinbutton', { name: 'X' })).toHaveValue(40)

    await userEvent.clear(within(dialog).getByRole('spinbutton', { name: 'Ширина' }))
    await userEvent.type(within(dialog).getByRole('spinbutton', { name: 'Ширина' }), '200{Enter}')
    await userEvent.type(within(dialog).getByRole('spinbutton', { name: 'Высота' }), '0{Enter}')
    await userEvent.clear(within(dialog).getByRole('spinbutton', { name: 'Y' }))
    await userEvent.type(within(dialog).getByRole('spinbutton', { name: 'Y' }), '-30{Enter}')

    expect(vi.mocked(editor.setGeometry).mock.calls).toEqual([[{ width: 200 }], [{ height: 10 }], [{ y: -30 }]])
  })

  it('does not let the height of tables be changed', async () => {
    act(() => editor.setState({ geometry: { x: 0, y: 0, width: 180, height: 56, canSetHeight: false } }))

    await userEvent.click(screen.getByRole('button', { name: 'Размер' }))

    expect(screen.getByRole('spinbutton', { name: 'Высота' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: 'Ширина' })).toBeEnabled()
  })

  it('offers a participant who may only view the scale only', () => {
    document.body.innerHTML = ''
    render(<EditorToolbar editor={editor} readOnly />)
    act(() =>
      editor.setState({
        canUndo: true,
        tableSelected: true,
        edgeMarkers: { start: 'none', end: 'classic' },
        colors: { fill: '#ffffff', stroke: '#000000', font: '#000000', hasShapes: true },
        text: { fontSize: 12, autoWidth: false },
        geometry: { x: 0, y: 0, width: 120, height: 60, canSetHeight: true },
      }),
    )

    const toolbar = screen.getByRole('toolbar', { name: 'Инструменты' })
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Уменьшить', 'Масштаб', 'Увеличить'])
    expect(within(toolbar).queryByRole('combobox')).toBeNull()
    expect(within(toolbar).queryByRole('spinbutton')).toBeNull()
  })
})
