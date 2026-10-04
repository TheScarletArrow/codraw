import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { EditorToolbar } from './EditorToolbar.tsx'

describe('EditorToolbar', () => {
  let editor: FakeEditor

  beforeEach(() => {
    editor = createFakeEditor()
    render(<EditorToolbar editor={editor} />)
  })

  it('offers no table or edge tools without a selection', () => {
    expect(screen.queryByRole('button', { name: 'Добавить поле' })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
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
})
