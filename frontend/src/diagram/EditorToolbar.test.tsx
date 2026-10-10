import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { EditorToolbar } from './EditorToolbar.tsx'

/** Text without font styles and with the default alignment. */
const plainText = { fontFamily: 'Arial', bold: false, italic: false, underline: false, align: 'center', textWrap: null } as const

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
    await userEvent.click(screen.getByRole('button', { name: 'Добавить индекс' }))

    expect(editor.addTableField).toHaveBeenCalled()
    expect(editor.addTableIndex).toHaveBeenCalled()
  })

  it('switches list types and removes the active markers', async () => {
    act(() => editor.setState({ text: { ...plainText, fontSize: 12, autoWidth: null, list: 'bullet' } }))
    expect(screen.getByRole('button', { name: 'Маркированный список' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Нумерованный список' }))
    expect(editor.setList).toHaveBeenCalledWith('numbered')
    await userEvent.click(screen.getByRole('button', { name: 'Маркированный список' }))
    expect(editor.setList).toHaveBeenCalledWith(null)
  })

  it('sets the columns of the selected index on Enter and its uniqueness', async () => {
    act(() => editor.setState({ tableSelected: true, index: { cellId: 'index', tableId: 'table', columns: 'org_id', unique: false } }))
    const columns = screen.getByRole('textbox', { name: 'Столбцы индекса' })

    expect(columns).toHaveValue('org_id')
    expect(screen.queryByRole('combobox', { name: 'Тип поля' })).toBeNull()
    await userEvent.type(columns, ', created_at{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'UNIQUE' }))

    expect(editor.setIndexProps).toHaveBeenCalledWith({ columns: 'org_id, created_at' })
    expect(editor.setIndexProps).toHaveBeenCalledWith({ unique: true })
  })

  it('brings the columns of the index back on Escape', async () => {
    act(() => editor.setState({ tableSelected: true, index: { cellId: 'index', tableId: 'table', columns: 'org_id', unique: true } }))
    const columns = screen.getByRole('textbox', { name: 'Столбцы индекса' })

    await userEvent.type(columns, 'x{Escape}')
    columns.blur()

    expect(columns).toHaveValue('org_id')
    expect(screen.getByRole('button', { name: 'UNIQUE' })).toHaveAttribute('aria-pressed', 'true')
    expect(editor.setIndexProps).not.toHaveBeenCalled()
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
        field: { cellId: 'field', tableId: 'table', type: 'int', notNull: false, primaryKey: false, unique: false, inheritedFrom: null, inView: false },
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
    act(() => editor.setState({ tableSelected: true, tableVendor: null, field: { cellId: 'field', tableId: 'table', type: 'uuid', notNull: false, primaryKey: false, unique: false, inheritedFrom: null, inView: false } }))
    const type = screen.getByRole('combobox', { name: 'Тип поля' })

    fireEvent.change(type, { target: { value: 'timestamptz' } })
    expect(editor.setFieldProps).toHaveBeenCalledWith({ type: 'timestamptz' })

    await userEvent.type(type, 'x')
    await userEvent.keyboard('{Escape}')
    expect(type).toHaveValue('uuid')
  })

  it('sets the nullability and the keys of the selected field', async () => {
    act(() => editor.setState({ tableSelected: true, tableVendor: 'postgresql', field: { cellId: 'field', tableId: 'table', type: 'text', notNull: false, primaryKey: false, unique: true, inheritedFrom: null, inView: false } }))

    expect(screen.getByRole('button', { name: 'NULL' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'UNIQUE' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'NOT NULL' }))
    await userEvent.click(screen.getByRole('button', { name: 'PK' }))
    await userEvent.click(screen.getByRole('button', { name: 'UNIQUE' }))

    expect(editor.setFieldProps).toHaveBeenCalledWith({ notNull: true })
    expect(editor.setFieldProps).toHaveBeenCalledWith({ primaryKey: true })
    expect(editor.setFieldProps).toHaveBeenCalledWith({ unique: false })
  })

  it('makes the selected table a base table, chooses its base and the default base', async () => {
    const options = [{ id: 'base', name: 'BaseEntity' }]
    act(() => editor.setState({ tableSelected: true, tableBase: { base: false, defaultBase: false, baseId: null, options } }))
    const base = screen.getByRole('combobox', { name: 'База таблицы' })

    expect(base).toHaveValue('')
    await userEvent.selectOptions(base, 'BaseEntity')
    expect(editor.setTableBase).toHaveBeenLastCalledWith('base')
    await userEvent.selectOptions(base, '—')
    expect(editor.setTableBase).toHaveBeenLastCalledWith(null)
    expect(screen.getByRole('button', { name: 'Базовая' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'По умолчанию' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Базовая' }))
    expect(editor.setBaseTable).toHaveBeenLastCalledWith(true)

    act(() => editor.setState({ tableSelected: true, tableBase: { base: true, defaultBase: true, baseId: null, options: [] } }))
    expect(screen.getByRole('button', { name: 'Базовая' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'По умолчанию' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'По умолчанию' }))
    expect(editor.setDefaultBase).toHaveBeenLastCalledWith(false)
  })

  it('makes the selected table a view, materialized, with a query applied from its window', async () => {
    const tableBase = { base: false, defaultBase: false, baseId: null, options: [] }
    act(() => editor.setState({ tableSelected: true, tableBase, tableView: { view: false, materialized: false, query: '' } }))

    expect(screen.getByRole('button', { name: 'Представление' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Материализованное' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Базовая' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Представление' }))
    expect(editor.setViewTable).toHaveBeenLastCalledWith(true)

    act(() => editor.setState({ tableSelected: true, tableBase, tableView: { view: true, materialized: false, query: 'SELECT 1' } }))
    // A view has no base, and a view that is not materialized no indexes.
    expect(screen.queryByRole('button', { name: 'Базовая' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'База таблицы' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Добавить индекс' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Материализованное' }))
    expect(editor.setViewMaterialized).toHaveBeenLastCalledWith(true)

    await userEvent.click(screen.getByRole('button', { name: 'Запрос…' }))
    const query = screen.getByRole('textbox', { name: 'Запрос' })
    expect(query).toHaveValue('SELECT 1')
    await userEvent.clear(query)
    await userEvent.type(query, 'SELECT id FROM users')
    await userEvent.click(screen.getByRole('button', { name: 'Применить' }))
    expect(editor.setViewQuery).toHaveBeenLastCalledWith('SELECT id FROM users')
    expect(screen.queryByRole('textbox', { name: 'Запрос' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Запрос…' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Запрос' }), ' WHERE x')
    await userEvent.keyboard('{Escape}')
    expect(editor.setViewQuery).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Запрос…' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Запрос' }), ';{Control>}{Enter}{/Control}')
    expect(editor.setViewQuery).toHaveBeenLastCalledWith('SELECT 1;')

    act(() => editor.setState({ tableSelected: true, tableBase, tableView: { view: true, materialized: true, query: '' } }))
    expect(screen.getByRole('button', { name: 'Добавить индекс' })).toBeInTheDocument()
  })

  it('offers the type alone for a column of a view', () => {
    const field = { cellId: 'field', tableId: 'table', type: 'text', notNull: false, primaryKey: false, unique: false, inheritedFrom: null, inView: true }
    act(() => editor.setState({ tableSelected: true, field, tableView: { view: true, materialized: false, query: '' } }))

    expect(screen.getByRole('combobox', { name: 'Тип поля' })).toHaveValue('text')
    expect(screen.queryByRole('button', { name: 'NULL' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'PK' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'UNIQUE' })).toBeNull()
  })

  it('names the base table of an inherited field instead of its properties', () => {
    const field = { cellId: 'field', tableId: 'table', type: 'uuid', notNull: true, primaryKey: true, unique: false, inheritedFrom: 'BaseEntity', inView: false }
    act(() => editor.setState({ tableSelected: true, field }))

    expect(screen.getByText('Из BaseEntity')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Тип поля' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'PK' })).toBeNull()
  })

  it('keeps a primary key NOT NULL', () => {
    act(() => editor.setState({ tableSelected: true, tableVendor: 'postgresql', field: { cellId: 'field', tableId: 'table', type: 'uuid', notNull: true, primaryKey: true, unique: false, inheritedFrom: null, inView: false } }))

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

  it('offers the open arrow and the hollow triangle of UML for both ends', async () => {
    act(() => editor.setState({ edgeMarkers: { start: 'open', end: 'blockHollow' } }))

    expect(screen.getByRole('combobox', { name: 'Начало связи' })).toHaveValue('open')
    expect(screen.getByRole('combobox', { name: 'Конец связи' })).toHaveDisplayValue('Полый треугольник')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Начало связи' }), 'Полый треугольник')
    expect(editor.setEdgeMarker).toHaveBeenCalledWith('start', 'blockHollow')
  })

  it('shows the relation of use cases of the selected edges and changes it', async () => {
    act(() => editor.setState({ edgeMarkers: { start: 'none', end: 'none' }, edgeRelation: { value: 'association' } }))

    const relation = screen.getByRole('combobox', { name: 'Отношение связи' })
    expect(relation).toHaveDisplayValue('Ассоциация')
    expect(within(relation).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Ассоциация',
      'Включение «include»',
      'Расширение «extend»',
      'Обобщение',
    ])

    await userEvent.selectOptions(relation, 'Включение «include»')
    expect(editor.setEdgeRelation).toHaveBeenCalledWith('include')
  })

  it('shows an empty relation for different ones, and none for edges of no use cases', () => {
    act(() => editor.setState({ edgeMarkers: { start: 'none', end: null }, edgeRelation: { value: null } }))
    expect(screen.getByRole('combobox', { name: 'Отношение связи' })).toHaveValue('')

    act(() => editor.setState({ edgeMarkers: { start: 'none', end: 'classic' }, edgeRelation: null }))
    expect(screen.queryByRole('combobox', { name: 'Отношение связи' })).toBeNull()
  })

  it('offers fill, line and text colors for selected shapes and applies them', async () => {
    act(() => editor.setState({ colors: { fill: '#ffffff', stroke: '#1f2328', font: '#1f2328', fillOpacity: 100, hasShapes: true } }))

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

  it('shows the transparency of the fill and changes it by the slider and by the field', async () => {
    act(() => editor.setState({ colors: { fill: '#dae8fc', stroke: '#1f2328', font: '#1f2328', fillOpacity: 60, hasShapes: true } }))
    await userEvent.click(screen.getByRole('button', { name: 'Цвет заливки' }))
    const slider = screen.getByRole('slider', { name: 'Прозрачность заливки' })
    const field = screen.getByRole('spinbutton', { name: 'Прозрачность заливки, %' })

    expect(slider).toHaveValue('40')
    expect(field).toHaveValue(40)
    fireEvent.change(slider, { target: { value: '75' } })
    expect(editor.setFillOpacity).toHaveBeenCalledWith(25)

    await userEvent.clear(field)
    await userEvent.type(field, '10{Enter}')
    expect(editor.setFillOpacity).toHaveBeenLastCalledWith(90)
  })

  it('shows no transparency when the selected shapes have different ones', async () => {
    act(() => editor.setState({ colors: { fill: '#ffffff', stroke: '#1f2328', font: '#1f2328', fillOpacity: null, hasShapes: true } }))
    await userEvent.click(screen.getByRole('button', { name: 'Цвет заливки' }))

    expect(screen.getByRole('spinbutton', { name: 'Прозрачность заливки, %' })).toHaveValue(null)
    await userEvent.click(screen.getByRole('button', { name: 'Цвет линии' }))
    expect(screen.queryByRole('slider', { name: /Прозрачность/ })).toBeNull()
  })

  it('offers no fill when only edges are selected', () => {
    act(() => editor.setState({ colors: { fill: null, stroke: '#1f2328', font: '#1f2328', fillOpacity: null, hasShapes: false } }))

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

  it('turns the text wrap on and off', async () => {
    act(() => editor.setState({ text: { ...plainText, fontSize: 13, autoWidth: false, textWrap: false } }))
    const wrap = screen.getByRole('button', { name: 'Перенос' })
    expect(wrap).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(wrap)
    expect(editor.setTextWrap).toHaveBeenLastCalledWith(true)

    act(() => editor.setState({ text: { ...plainText, fontSize: 13, autoWidth: false, textWrap: true } }))
    expect(wrap).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(wrap)
    expect(editor.setTextWrap).toHaveBeenLastCalledWith(false)
  })

  it('offers no text wrap when no selected shape allows it', () => {
    act(() => editor.setState({ text: { ...plainText, fontSize: 13, autoWidth: true, textWrap: null } }))

    expect(screen.getByRole('button', { name: 'Автоширина' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Перенос' })).toBeNull()
  })

  it('offers no auto width when no selected shape allows it', () => {
    act(() => editor.setState({ text: { ...plainText, fontSize: 11, autoWidth: null } }))

    expect(screen.getByRole('spinbutton', { name: 'Размер текста' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Автоширина' })).toBeNull()
  })

  it('opens the size and the position of the selected shapes and changes them', async () => {
    act(() => editor.setState({ geometry: { x: 40, y: 60, width: 120, height: null, canSetHeight: true, canSetWidth: true, rotation: 0, canRotate: true } }))

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

  it('does not let the height of tables be changed, nor tables be turned', async () => {
    act(() => editor.setState({ geometry: { x: 0, y: 0, width: 180, height: 56, canSetHeight: false, canSetWidth: true, rotation: null, canRotate: false } }))

    await userEvent.click(screen.getByRole('button', { name: 'Размер' }))

    expect(screen.getByRole('spinbutton', { name: 'Высота' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: 'Ширина' })).toBeEnabled()
    expect(screen.getByRole('spinbutton', { name: 'Поворот' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: 'Поворот' })).toHaveAttribute('title', 'Таблицы и группы не поворачиваются')
  })

  it('shows the rotation of the selected shapes and passes the typed angle to the editor as it is', async () => {
    act(() => editor.setState({ geometry: { x: 40, y: 60, width: 120, height: 60, canSetHeight: true, canSetWidth: true, rotation: 30, canRotate: true } }))

    await userEvent.click(screen.getByRole('button', { name: 'Размер' }))
    const rotation = within(screen.getByRole('dialog', { name: 'Размер и положение' })).getByRole('spinbutton', { name: 'Поворот' })
    expect(rotation).toHaveValue(30)
    expect(rotation).toBeEnabled()

    await userEvent.clear(rotation)
    await userEvent.type(rotation, '45{Enter}')
    await userEvent.clear(rotation)
    // The editor brings the angle within 0–359; the field does not cut it to its limits.
    await userEvent.type(rotation, '-90{Enter}')
    await userEvent.clear(rotation)
    await userEvent.type(rotation, '360')
    await userEvent.tab()

    expect(vi.mocked(editor.setRotation).mock.calls).toEqual([[45], [-90], [360]])
    expect(editor.setGeometry).not.toHaveBeenCalled()
  })

  it('shows no rotation when the selected shapes are turned differently', async () => {
    act(() => editor.setState({ geometry: { x: 40, y: 60, width: 120, height: 60, canSetHeight: true, canSetWidth: true, rotation: null, canRotate: true } }))

    await userEvent.click(screen.getByRole('button', { name: 'Размер' }))

    expect(screen.getByRole('spinbutton', { name: 'Поворот' })).toHaveValue(null)
  })

  it('turns the laser pointer on and shows it pressed while it is on', async () => {
    const laser = screen.getByRole('button', { name: 'Указка' })
    expect(laser).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(laser)

    expect(editor.setLaser).toHaveBeenCalledWith(true)
    expect(laser).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(laser)
    expect(editor.setLaser).toHaveBeenLastCalledWith(false)
  })

  it('turns the comment tool on in place of the laser pointer, and shows which one is on', async () => {
    const laser = screen.getByRole('button', { name: 'Указка' })
    const comment = screen.getByRole('button', { name: 'Комментарий' })
    await userEvent.click(laser)

    await userEvent.click(comment)

    expect(editor.setCommentTool).toHaveBeenCalledWith(true)
    expect(comment).toHaveAttribute('aria-pressed', 'true')
    expect(laser).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(comment)
    expect(editor.setCommentTool).toHaveBeenLastCalledWith(false)
    expect(comment).toHaveAttribute('aria-pressed', 'false')
  })

  it('turns the pencil on in place of the other tools of the canvas, and shows its line instead of the selection', async () => {
    act(() =>
      editor.setState({
        colors: { fill: '#ffffff', stroke: '#000000', font: '#000000', fillOpacity: 100, hasShapes: true },
        line: { width: 1, dash: 'solid', edgeShape: null, hasEdges: false },
      }),
    )
    const pencil = screen.getByRole('button', { name: 'Карандаш' })
    await userEvent.click(screen.getByRole('button', { name: 'Указка' }))

    await userEvent.click(pencil)

    expect(editor.setPencil).toHaveBeenCalledWith(true)
    expect(pencil).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Указка' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Цвет заливки' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Цвет текста' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Цвет линии' })).toHaveTextContent('Линия')

    await userEvent.click(screen.getByRole('button', { name: 'Цвет линии' }))
    expect(screen.queryByRole('button', { name: 'Без линии' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Красный' }))
    expect(editor.setPencilLine).toHaveBeenCalledWith({ color: '#b85450' })
    expect(editor.setColor).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Стиль линии' }))
    const width = screen.getByRole('spinbutton', { name: 'Толщина линии' })
    expect(width).toHaveValue(2)
    expect(screen.queryByRole('group', { name: 'Форма связи' })).toBeNull()
    await userEvent.clear(width)
    await userEvent.type(width, '6{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Пунктир' }))
    expect(editor.setPencilLine).toHaveBeenCalledWith({ width: 6 })
    expect(editor.setPencilLine).toHaveBeenCalledWith({ dash: 'dashed' })
    expect(editor.setLineStyle).not.toHaveBeenCalled()

    await userEvent.click(pencil)
    expect(editor.setPencil).toHaveBeenLastCalledWith(false)
    expect(screen.getByRole('button', { name: 'Цвет заливки' })).toBeInTheDocument()
  })

  it('locks the selection', async () => {
    act(() =>
      editor.setState({
        lock: { all: false, canLock: true, locks: [] },
        colors: { fill: '#ffffff', stroke: '#000000', font: '#000000', fillOpacity: 100, hasShapes: true },
      }),
    )

    expect(screen.queryByRole('button', { name: 'Открепить' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Цвет заливки' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Закрепить' }))

    expect(editor.setLocked).toHaveBeenCalledWith(true)
  })

  it('shows who locked the selection, disables the tools that would change it and unlocks it', async () => {
    act(() =>
      editor.setState({
        lock: { all: true, canLock: false, locks: [{ cellId: 'cell', lockedBy: 'Алиса' }] },
        tableSelected: true,
        colors: { fill: '#ffffff', stroke: '#000000', font: '#000000', fillOpacity: 100, hasShapes: true },
        text: { ...plainText, fontSize: 12, autoWidth: false },
        geometry: { x: 0, y: 0, width: 120, height: 60, canSetHeight: true, canSetWidth: true, rotation: 0, canRotate: true },
        arrange: 2,
        hasCells: true,
      }),
    )
    const toolbar = screen.getByRole('toolbar', { name: 'Инструменты' })

    expect(within(toolbar).getByText('Закреплено: Алиса')).toBeInTheDocument()
    for (const name of ['Цвет заливки', 'Жирный', 'Размер', 'Выравнивание', 'Добавить поле']) {
      expect(within(toolbar).getByRole('button', { name })).toBeDisabled()
    }
    expect(within(toolbar).getByRole('spinbutton', { name: 'Размер текста' })).toBeDisabled()
    expect(within(toolbar).getByRole('combobox', { name: 'СУБД таблицы' })).toBeDisabled()
    expect(within(toolbar).getByRole('button', { name: 'Автораскладка' })).toBeEnabled()
    expect(within(toolbar).queryByRole('button', { name: 'Закрепить' })).toBeNull()
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Открепить' }))

    expect(editor.setLocked).toHaveBeenCalledWith(false)
  })

  it('copies the look of the selected element and pastes it into the selection', async () => {
    expect(screen.queryByRole('button', { name: 'Копировать стиль' })).toBeNull()
    act(() =>
      editor.setState({
        lock: { all: false, canLock: true, locks: [] },
        colors: { fill: '#ffffff', stroke: '#000000', font: '#000000', fillOpacity: 100, hasShapes: true },
        canCopyStyle: true,
      }),
    )

    expect(screen.getByRole('button', { name: 'Копировать стиль' })).toHaveAttribute('title', expect.stringContaining('Ctrl+Alt+C'))
    expect(screen.getByRole('button', { name: 'Вставить стиль' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Копировать стиль' }))
    expect(editor.copyStyle).toHaveBeenCalled()

    act(() => editor.setState({ canCopyStyle: false, canPasteStyle: true }))
    expect(screen.getByRole('button', { name: 'Копировать стиль' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Вставить стиль' }))
    expect(editor.pasteStyle).toHaveBeenCalled()
  })

  it('copies the look of a locked element', () => {
    act(() =>
      editor.setState({
        lock: { all: true, canLock: false, locks: [{ cellId: 'cell', lockedBy: 'Алиса' }] },
        colors: { fill: '#ffffff', stroke: '#000000', font: '#000000', fillOpacity: 100, hasShapes: true },
        canCopyStyle: true,
      }),
    )

    expect(screen.getByRole('button', { name: 'Копировать стиль' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Вставить стиль' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Цвет заливки' })).toBeDisabled()
  })

  it('says just that a lock from a file of draw.io is locked', () => {
    act(() => editor.setState({ lock: { all: true, canLock: false, locks: [{ cellId: 'cell', lockedBy: null }] } }))

    expect(screen.getByText('Закреплено')).toBeInTheDocument()
  })

  it('offers a participant who may only view the scale and the laser pointer only', () => {
    document.body.innerHTML = ''
    render(<EditorToolbar editor={editor} readOnly />)
    act(() =>
      editor.setState({
        canUndo: true,
        tableSelected: true,
        edgeMarkers: { start: 'none', end: 'classic' },
        colors: { fill: '#ffffff', stroke: '#000000', font: '#000000', fillOpacity: 100, hasShapes: true },
        text: { ...plainText, fontSize: 12, autoWidth: false },
        geometry: { x: 0, y: 0, width: 120, height: 60, canSetHeight: true, canSetWidth: true, rotation: 0, canRotate: true },
        lock: { all: true, canLock: false, locks: [{ cellId: 'cell', lockedBy: 'Алиса' }] },
      }),
    )

    const toolbar = screen.getByRole('toolbar', { name: 'Инструменты' })
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Уменьшить', 'Масштаб', 'Увеличить', 'Показать всё', 'Указка', 'Комментарий'])
    expect(within(toolbar).queryByRole('combobox')).toBeNull()
    expect(within(toolbar).queryByRole('spinbutton')).toBeNull()
  })

  it('offers neither the laser pointer nor the comment tool on a page without others, e.g. a draft', () => {
    document.body.innerHTML = ''
    render(<EditorToolbar editor={editor} collaboration={false} />)

    const toolbar = screen.getByRole('toolbar', { name: 'Инструменты' })
    expect(within(toolbar).getByRole('button', { name: 'Показать всё' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Отменить' })).toBeInTheDocument()
    expect(within(toolbar).queryByRole('button', { name: 'Указка' })).toBeNull()
    expect(within(toolbar).queryByRole('button', { name: 'Комментарий' })).toBeNull()
    expect(within(toolbar).getByRole('button', { name: 'Карандаш' })).toBeInTheDocument()
  })
})
