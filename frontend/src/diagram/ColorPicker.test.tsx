import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ColorPicker } from './ColorPicker.tsx'
import { PALETTE } from './colors.ts'

function renderPicker(props: Partial<Parameters<typeof ColorPicker>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <ColorPicker label="Заливка" name="Цвет заливки" noneLabel="Без заливки" value="#ffffff" onChange={onChange} {...props} />,
  )
  return onChange
}

const palette = () => screen.getByRole('dialog', { name: 'Цвет заливки' })

describe('ColorPicker', () => {
  it('offers the palette of 16 colors, no color and a custom color', async () => {
    renderPicker()

    await userEvent.click(screen.getByRole('button', { name: 'Цвет заливки' }))

    expect(PALETTE).toHaveLength(16)
    for (const color of PALETTE) expect(within(palette()).getByRole('button', { name: color.name })).toBeInTheDocument()
    expect(within(palette()).getByRole('button', { name: 'Без заливки' })).toBeInTheDocument()
    expect(within(palette()).getByLabelText('Свой цвет')).toHaveAttribute('type', 'color')
    expect(within(palette()).getByRole('button', { name: 'Белый' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('applies a color of the palette and closes', async () => {
    const onChange = renderPicker()

    await userEvent.click(screen.getByRole('button', { name: 'Цвет заливки' }))
    await userEvent.click(within(palette()).getByRole('button', { name: 'Голубой' }))

    expect(onChange).toHaveBeenCalledWith('#dae8fc')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('removes the color', async () => {
    const onChange = renderPicker()

    await userEvent.click(screen.getByRole('button', { name: 'Цвет заливки' }))
    await userEvent.click(within(palette()).getByRole('button', { name: 'Без заливки' }))

    expect(onChange).toHaveBeenCalledWith('none')
  })

  it('applies a custom color once the color picker of the browser is closed', async () => {
    const onChange = renderPicker()
    await userEvent.click(screen.getByRole('button', { name: 'Цвет заливки' }))
    const custom = within(palette()).getByLabelText('Свой цвет')

    fireEvent.input(custom, { target: { value: '#123400' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(custom, { target: { value: '#123456' } })

    expect(onChange).toHaveBeenCalledWith('#123456')
  })

  it('has no option without color for text', async () => {
    renderPicker({ label: 'Текст', name: 'Цвет текста', noneLabel: undefined, value: '#1f2328' })

    await userEvent.click(screen.getByRole('button', { name: 'Цвет текста' }))

    expect(within(screen.getByRole('dialog', { name: 'Цвет текста' })).queryByRole('button', { name: /^Без/ })).toBeNull()
  })
})
