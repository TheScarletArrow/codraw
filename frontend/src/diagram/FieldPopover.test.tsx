import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { FieldPopover } from './FieldPopover.tsx'

const FIELD = { cellId: 'field', tableId: 'table', type: 'text', notNull: false, primaryKey: false, unique: false, inheritedFrom: null, inView: false }

describe('FieldPopover', () => {
  let editor: FakeEditor

  beforeEach(() => {
    editor = createFakeEditor({ viewport: { width: 1000, height: 600 } })
    editor.placeCell('table', { x: 100, y: 50, width: 200, height: 110 })
    editor.placeCell('field', { x: 100, y: 106, width: 200, height: 26 })
    render(<FieldPopover editor={editor} />)
  })

  it('is not shown without a selected field', () => {
    expect(screen.queryByRole('group', { name: 'Свойства поля' })).toBeNull()
  })

  it('stands to the right of the table at the height of the field and sets the properties of the field', async () => {
    act(() => editor.setState({ field: FIELD, tableVendor: 'mysql' }))
    const panel = screen.getByRole('group', { name: 'Свойства поля' })

    expect(panel).toHaveAttribute('data-side', 'right')
    expect(panel.style.left).toBe('312px')
    expect(panel.style.top).toBe('119px')
    expect(screen.getByRole('combobox', { name: 'Тип поля' })).toHaveValue('text')
    await userEvent.click(screen.getByRole('button', { name: 'NOT NULL' }))

    expect(editor.setFieldProps).toHaveBeenCalledWith({ notNull: true })
  })

  it('shows the properties of a field of a locked table disabled, with who locked it', () => {
    act(() =>
      editor.setState({
        field: FIELD,
        tableVendor: 'mysql',
        lock: { all: true, canLock: false, locks: [{ cellId: 'table', lockedBy: 'Алиса' }] },
      }),
    )
    const panel = screen.getByRole('group', { name: 'Свойства поля' })

    expect(within(panel).getByRole('img', { name: 'Закреплено: Алиса' })).toHaveAttribute('title', 'Закреплено: Алиса')
    expect(within(panel).getByRole('combobox', { name: 'Тип поля' })).toBeDisabled()
    expect(within(panel).getByRole('button', { name: 'PK' })).toBeDisabled()
  })

  it('is not shown for an inherited field, which is edited in its base table', () => {
    act(() => editor.setState({ field: { ...FIELD, inheritedFrom: 'BaseEntity', inView: false }, tableVendor: null }))

    expect(screen.queryByRole('group', { name: 'Свойства поля' })).toBeNull()
  })

  it('stands to the left of a table at the right edge of the canvas', () => {
    editor.placeCell('table', { x: 700, y: 50, width: 200, height: 110 })
    editor.placeCell('field', { x: 700, y: 106, width: 200, height: 26 })
    act(() => editor.setState({ field: FIELD, tableVendor: null }))
    const panel = screen.getByRole('group', { name: 'Свойства поля' })

    expect(panel).toHaveAttribute('data-side', 'left')
    expect(panel.style.left).toBe('688px')
    expect(panel.style.transform).toBe('translate(-100%, -50%)')
  })

  it('sets the columns of the selected index next to it', async () => {
    editor.placeCell('index', { x: 100, y: 152, width: 200, height: 26 })
    act(() => editor.setState({ index: { cellId: 'index', tableId: 'table', columns: 'org_id', unique: false }, tableVendor: null }))
    const panel = screen.getByRole('group', { name: 'Свойства индекса' })

    expect(panel.style.top).toBe('165px')
    await userEvent.click(screen.getByRole('button', { name: 'UNIQUE' }))
    expect(editor.setIndexProps).toHaveBeenCalledWith({ unique: true })
  })

  it('follows the table when the canvas scrolls', () => {
    act(() => editor.setState({ field: FIELD, tableVendor: null }))

    act(() => editor.scrollTo({ x: 50, y: 20 }))

    expect(screen.getByRole('group', { name: 'Свойства поля' }).style.top).toBe('99px')
  })
})
