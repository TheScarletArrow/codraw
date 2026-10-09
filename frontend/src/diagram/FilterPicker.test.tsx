import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { FilterPicker } from './FilterPicker.tsx'
import { NO_FILTER, type FilterChoices, type PageFilter } from './pageFilter.ts'

const CHOICES: FilterChoices = {
  tags: [{ value: 'pci', label: 'pci', count: 1 }],
  kinds: [{ value: 'database', label: 'База данных', count: 2 }],
  technologies: [],
  owners: [
    { value: 'Платежи', label: 'Платежи', count: 2 },
    { value: 'Склад', label: 'Склад', count: 1 },
  ],
  interactions: [{ value: 'async', label: 'Асинхронная', count: 1 }],
}

describe('FilterPicker', () => {
  let editor: FakeEditor
  const changes: PageFilter[] = []

  function Page({ initial = NO_FILTER }: { initial?: PageFilter }) {
    const [filter, setFilter] = useState(initial)
    return (
      <FilterPicker
        editor={editor}
        filter={filter}
        onChange={(next) => {
          changes.push(next)
          setFilter(next)
        }}
      />
    )
  }

  beforeEach(() => {
    changes.splice(0)
    editor = createFakeEditor()
    vi.mocked(editor.filterChoices).mockReturnValue(CHOICES)
  })

  const button = () => screen.getByRole('button', { name: 'Фильтр' })
  const window = () => screen.getByRole('dialog', { name: 'Фильтр' })

  it('offers the values of the page by facet with their counts, and chooses them', async () => {
    render(<Page />)
    expect(button()).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(button())

    const owners = within(window()).getByRole('group', { name: 'Владельцы' })
    expect(within(owners).getAllByRole('checkbox').map((box) => box.closest('label')!.textContent)).toEqual(['Платежи2', 'Склад1'])
    expect(within(window()).getByRole('group', { name: 'Технологии' })).toHaveTextContent('Нет на странице')
    expect(window()).toHaveTextContent('Выберите, что показать')

    await userEvent.click(within(owners).getByRole('checkbox', { name: 'Платежи' }))
    expect(changes.at(-1)).toEqual({ ...NO_FILTER, owners: ['Платежи'] })
    expect(editor.filterChoices).toHaveBeenLastCalledWith({ ...NO_FILTER, owners: ['Платежи'] })
    await userEvent.click(within(window()).getByRole('checkbox', { name: 'Асинхронная' }))
    expect(changes.at(-1)).toEqual({ ...NO_FILTER, owners: ['Платежи'], interactions: ['async'] })
    expect(button()).toHaveAttribute('aria-pressed', 'true')

    act(() => editor.setState({ filter: { matched: 2, total: 3, hide: false } }))
    expect(window()).toHaveTextContent('Подходит 2 из 3')

    await userEvent.click(within(owners).getByRole('checkbox', { name: 'Платежи' }))
    expect(changes.at(-1)).toEqual({ ...NO_FILTER, interactions: ['async'] })
  })

  it('hides what does not match, and resets the values but keeps hiding', async () => {
    render(<Page initial={{ ...NO_FILTER, tags: ['pci'] }} />)
    await userEvent.click(button())
    await userEvent.click(within(window()).getByRole('checkbox', { name: 'Скрывать неподходящее' }))
    expect(changes.at(-1)).toEqual({ ...NO_FILTER, tags: ['pci'], hide: true })

    await userEvent.click(within(window()).getByRole('button', { name: 'Сбросить' }))
    expect(changes.at(-1)).toEqual({ ...NO_FILTER, hide: true })
    expect(within(window()).getByRole('button', { name: 'Сбросить' })).toBeDisabled()
  })
})
