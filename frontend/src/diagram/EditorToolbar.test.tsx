import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { EditorToolbar } from './EditorToolbar.tsx'

/** Text without font styles and with the default alignment. */
const plainText = { fontFamily: 'Arial', bold: false, italic: false, underline: false, align: 'center' } as const

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

  it('chooses the database of the selected table', async () => {
    act(() => editor.setState({ tableSelected: true, tableVendor: 'postgresql' }))

    expect(screen.getByRole('combobox', { name: 'СУБД таблицы' })).toHaveValue('postgresql')
    expect(screen.queryByRole('combobox', { name: 'Тип поля' })).toBeNull()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'СУБД таблицы' }), 'Oracle')

    expect(editor.setTableVendor).toHaveBeenCalledWith('oracle')
  })

  it('offers the types of the database of the table and applies a typed type on Enter', async () => {
    act(() =>
      editor.setState({
        tableSelected: true,
        tableVendor: 'mysql',
        field: { cellId: 'field', tableId: 'table', type: 'int', notNull: false, primaryKey: false, unique: false },
      }),
    )
    const type = screen.getByRole('combobox', { name: 'Тип поля' })
    expect(type).toHaveValue('int')
    const list = document.getElementById(type.getAttribute('list')!)!
    expect([...list.querySelectorAll('option')].map((option) => option.value)).toContain('datetime')

    await userEvent.clear(type)
    await userEvent.type(type, 'numeric(12,4)')
    expect(editor.setFieldProps).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')

    expect(editor.setFieldProps).toHaveBeenCalledWith({ type: 'numeric(12,4)' })
  })

  it('applies a type chosen from the list at once and brings the current type back on Escape', async () => {
    act(() => editor.setState({ tableSelected: true, tableVendor: null, field: { cellId: 'field', tableId: 'table', type: 'uuid', notNull: false, primaryKey: false, unique: false } }))
    const type = screen.getByRole('combobox', { name: 'Тип поля' })

    fireEvent.change(type, { target: { value: 'timestamptz' } })
    expect(editor.setFieldProps).toHaveBeenCalledWith({ type: 'timestamptz' })

    await userEvent.type(type, 'x')
    await userEvent.keyboard('{Escape}')
    expect(type).toHaveValue('uuid')
  })

  it('sets the nullability and the keys of the selected field', async () => {
    act(() => editor.setState({ tableSelected: true, tableVendor: 'postgresql', field: { cellId: 'field', tableId: 'table', type: 'text', notNull: false, primaryKey: false, unique: true } }))

    expect(screen.getByRole('button', { name: 'NULL' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'UNIQUE' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'NOT NULL' }))
    await userEvent.click(screen.getByRole('button', { name: 'PK' }))
    await userEvent.click(screen.getByRole('button', { name: 'UNIQUE' }))

    expect(editor.setFieldProps).toHaveBeenCalledWith({ notNull: true })
    expect(editor.setFieldProps).toHaveBeenCalledWith({ primaryKey: true })
    expect(editor.setFieldProps).toHaveBeenCalledWith({ unique: false })
  })

  it('keeps a primary key NOT NULL', () => {
    act(() => editor.setState({ tableSelected: true, tableVendor: 'postgresql', field: { cellId: 'field', tableId: 'table', type: 'uuid', notNull: true, primaryKey: true, unique: false } }))

    expect(screen.getByRole('button', { name: 'NOT NULL' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'NOT NULL' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'NULL' })).toBeDisabled()
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

  it('changes the width, the dash and the edge shape of the selected lines', async () => {
    act(() => editor.setState({ line: { width: 2, dash: 'dashed', edgeShape: 'orthogonal', hasEdges: true } }))

    await userEvent.click(screen.getByRole('button', { name: 'Стиль линии' }))
    const panel = screen.getByRole('dialog', { name: 'Стиль линии' })
    expect(within(panel).getByRole('spinbutton', { name: 'Толщина линии' })).toHaveValue(2)
    expect(within(panel).getByRole('button', { name: 'Пунктир' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel).getByRole('button', { name: 'Ортогональная' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(panel).getByRole('button', { name: 'Точки' }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Кривая' }))
    const width = within(panel).getByRole('spinbutton', { name: 'Толщина линии' })
    await userEvent.clear(width)
    await userEvent.type(width, '5{Enter}')

    expect(editor.setLineStyle).toHaveBeenCalledWith({ dash: 'dotted' })
    expect(editor.setLineStyle).toHaveBeenCalledWith({ edgeShape: 'curved' })
    expect(editor.setLineStyle).toHaveBeenCalledWith({ width: 5 })
  })

  it('offers no edge shape when no edge is selected, and no value where the selection differs', async () => {
    act(() => editor.setState({ line: { width: null, dash: null, edgeShape: null, hasEdges: false } }))

    await userEvent.click(screen.getByRole('button', { name: 'Стиль линии' }))
    const panel = screen.getByRole('dialog', { name: 'Стиль линии' })

    expect(within(panel).queryByRole('group', { name: 'Форма связи' })).toBeNull()
    expect(within(panel).getByRole('spinbutton', { name: 'Толщина линии' })).toHaveValue(null)
    expect(within(panel).queryAllByRole('button', { pressed: true })).toEqual([])
  })

  it('shows the font of the selected text, each font in itself, and changes it', async () => {
    act(() => editor.setState({ text: { ...plainText, fontFamily: 'Georgia', fontSize: 13, autoWidth: null } }))
    const font = screen.getByRole('combobox', { name: 'Шрифт' })

    expect(font).toHaveValue('Georgia')
    expect(screen.getByRole('option', { name: 'Courier New' })).toHaveStyle({ fontFamily: 'Courier New' })
    await userEvent.selectOptions(font, 'Times New Roman')

    expect(editor.setFontFamily).toHaveBeenCalledWith('Times New Roman')
  })

  it('shows no font when the selected objects have different ones, and a font of draw.io that is not in the list', () => {
    act(() => editor.setState({ text: { ...plainText, fontFamily: null, fontSize: 13, autoWidth: null } }))
    expect(screen.getByRole('combobox', { name: 'Шрифт' })).toHaveValue('')

    act(() => editor.setState({ text: { ...plainText, fontFamily: 'Helvetica', fontSize: 13, autoWidth: null } }))
    expect(screen.getByRole('combobox', { name: 'Шрифт' })).toHaveValue('Helvetica')
  })

  it('shows the font styles and the alignment of the selected text and changes them', async () => {
    act(() => editor.setState({ text: { ...plainText, bold: true, align: 'left', fontSize: 13, autoWidth: null } }))

    expect(screen.getByRole('button', { name: 'Жирный' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Курсив' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Текст по левому краю' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Курсив' }))
    await userEvent.click(screen.getByRole('button', { name: 'Подчёркнутый' }))
    await userEvent.click(screen.getByRole('button', { name: 'Текст по правому краю' }))

    expect(editor.toggleFontStyle).toHaveBeenCalledWith('italic')
    expect(editor.toggleFontStyle).toHaveBeenCalledWith('underline')
    expect(editor.setTextAlign).toHaveBeenCalledWith('right')
  })

  it('fits the page into the canvas', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Показать всё' }))

    expect(editor.zoomToFit).toHaveBeenCalled()
  })

  it('aligns two selected shapes and distributes three', async () => {
    expect(screen.queryByRole('button', { name: 'Выравнивание' })).toBeNull()
    act(() => editor.setState({ arrange: 2 }))

    await userEvent.click(screen.getByRole('button', { name: 'Выравнивание' }))
    const panel = screen.getByRole('dialog', { name: 'Выравнивание' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Выровнять по верхнему краю' }))
    expect(editor.alignShapes).toHaveBeenCalledWith('top')
    expect(within(panel).getByRole('button', { name: 'Распределить по горизонтали' })).toBeDisabled()

    act(() => editor.setState({ arrange: 3 }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Распределить по вертикали' }))
    expect(editor.distributeShapes).toHaveBeenCalledWith('vertical')
  })

  it('shows the text size of the selection and changes it', async () => {
    act(() => editor.setState({ text: { ...plainText, fontSize: 13, autoWidth: false } }))

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
    act(() => editor.setState({ text: { ...plainText, fontSize: null, autoWidth: null } }))

    expect(screen.getByRole('spinbutton', { name: 'Размер текста' })).toHaveValue(null)
  })

  it('turns the auto width on and off', async () => {
    act(() => editor.setState({ text: { ...plainText, fontSize: 13, autoWidth: false } }))
    const autoWidth = screen.getByRole('button', { name: 'Автоширина' })
    expect(autoWidth).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(autoWidth)
    expect(editor.setAutoWidth).toHaveBeenLastCalledWith(true)

    act(() => editor.setState({ text: { ...plainText, fontSize: 13, autoWidth: true } }))
    expect(autoWidth).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(autoWidth)
    expect(editor.setAutoWidth).toHaveBeenLastCalledWith(false)
  })

  it('offers no auto width when no selected shape allows it', () => {
    act(() => editor.setState({ text: { ...plainText, fontSize: 11, autoWidth: null } }))

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
        text: { ...plainText, fontSize: 12, autoWidth: false },
        geometry: { x: 0, y: 0, width: 120, height: 60, canSetHeight: true },
      }),
    )

    const toolbar = screen.getByRole('toolbar', { name: 'Инструменты' })
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Уменьшить', 'Масштаб', 'Увеличить', 'Показать всё'])
    expect(within(toolbar).queryByRole('combobox')).toBeNull()
    expect(within(toolbar).queryByRole('spinbutton')).toBeNull()
  })
})
