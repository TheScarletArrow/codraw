import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NumberField } from './NumberField.tsx'

function renderField(value: number | null, props: { min?: number; max?: number } = {}) {
  const onCommit = vi.fn()
  const view = render(<NumberField label="Размер текста" value={value} onCommit={onCommit} {...props} />)
  return { onCommit, field: screen.getByRole('spinbutton', { name: 'Размер текста' }), view }
}

describe('NumberField', () => {
  it('shows the current value, and nothing when the values differ', () => {
    const { field, view, onCommit } = renderField(13)
    expect(field).toHaveValue(13)

    view.rerender(<NumberField label="Размер текста" value={null} onCommit={onCommit} />)

    expect(field).toHaveValue(null)
    expect(field).toHaveAttribute('placeholder', '—')
  })

  it('applies the typed value on Enter, not on every digit', async () => {
    const { field, onCommit } = renderField(13)

    await userEvent.clear(field)
    await userEvent.type(field, '24')
    expect(onCommit).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')

    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCommit).toHaveBeenCalledWith(24)
  })

  it('applies the typed value when the field loses focus', async () => {
    const { field, onCommit } = renderField(13)

    await userEvent.clear(field)
    await userEvent.type(field, '18')
    await userEvent.tab()

    expect(onCommit).toHaveBeenCalledWith(18)
  })

  it('brings the current value back on Escape', async () => {
    const { field, onCommit } = renderField(13)

    await userEvent.clear(field)
    await userEvent.type(field, '40{Escape}')
    await userEvent.tab()

    expect(field).toHaveValue(13)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('keeps the value within the limits as a whole number', async () => {
    const { field, onCommit } = renderField(13, { min: 6, max: 96 })

    await userEvent.clear(field)
    await userEvent.type(field, '500{Enter}')
    await userEvent.clear(field)
    await userEvent.type(field, '2{Enter}')
    await userEvent.clear(field)
    await userEvent.type(field, '17.6{Enter}')

    expect(onCommit.mock.calls).toEqual([[96], [6], [18]])
  })

  it('ignores an empty field and an unchanged value', async () => {
    const { field, onCommit } = renderField(13)

    await userEvent.clear(field)
    await userEvent.tab()
    await userEvent.click(field)
    await userEvent.keyboard('{Enter}')

    expect(onCommit).not.toHaveBeenCalled()
    expect(field).toHaveValue(13)
  })
})
