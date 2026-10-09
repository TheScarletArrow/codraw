import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { PlanViewPicker } from './PlanViewPicker.tsx'

describe('PlanViewPicker', () => {
  it('is there while the page has a plan, chooses the view, tells the counts and applies the target state', async () => {
    const editor = createFakeEditor()
    const onChange = vi.fn()
    const { rerender } = render(<PlanViewPicker editor={editor} view="diff" onChange={onChange} />)
    expect(screen.queryByRole('button', { name: 'Как есть и как будет' })).toBeNull()

    act(() => editor.setState({ plan: { view: 'diff', added: 2, removed: 1 } }))
    const button = screen.getByRole('button', { name: 'Как есть и как будет' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(button)
    const window = screen.getByRole('dialog', { name: 'Как есть и как будет' })
    expect(window).toHaveTextContent('Появится: 2')
    expect(window).toHaveTextContent('Уйдёт: 1')
    expect(screen.getByRole('radio', { name: 'Разница' })).toBeChecked()

    await userEvent.click(screen.getByRole('radio', { name: 'Как будет' }))
    expect(onChange).toHaveBeenCalledWith('target')
    rerender(<PlanViewPicker editor={editor} view="target" onChange={onChange} />)
    expect(screen.getByRole('radio', { name: 'Как будет' })).toBeChecked()

    await userEvent.click(screen.getByRole('button', { name: 'Применить целевое состояние' }))
    expect(editor.applyTargetState).toHaveBeenCalledTimes(1)
  })

  it('stays while the view is not the difference, and gives a viewer no target state to apply', async () => {
    const editor = createFakeEditor({ readOnly: true })
    render(<PlanViewPicker editor={editor} readOnly view="current" onChange={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Как есть и как будет' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent('Как есть')
    await userEvent.click(button)
    expect(screen.queryByRole('button', { name: 'Применить целевое состояние' })).toBeNull()
  })
})
