import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { QuickConnect } from './QuickConnect.tsx'

const ARROWS = /^Добавить фигуру /

describe('QuickConnect', () => {
  let editor: FakeEditor

  beforeEach(() => {
    editor = createFakeEditor()
    render(<QuickConnect editor={editor} />)
  })

  const select = (cellId: string, shapes: Parameters<FakeEditor['addConnectedShape']>[1][]) =>
    act(() => {
      editor.placeCell(cellId, { x: 100, y: 100, width: 120, height: 60 })
      editor.setState({ quickConnect: { cellId, shapes } })
    })

  it('shows no arrows without a shape to continue', () => {
    expect(screen.queryAllByRole('button', { name: ARROWS })).toHaveLength(0)
  })

  it('shows an arrow outside each side of the selected shape and follows the shape', () => {
    select('a', ['service', 'database'])

    expect(screen.getAllByRole('button', { name: ARROWS }).map((arrow) => arrow.getAttribute('aria-label'))).toEqual([
      'Добавить фигуру слева',
      'Добавить фигуру справа',
      'Добавить фигуру сверху',
      'Добавить фигуру снизу',
    ])
    const position = (name: string) => {
      const { left, top } = screen.getByRole('button', { name }).style
      return [left, top]
    }
    expect(position('Добавить фигуру слева')).toEqual(['56px', '120px'])
    expect(position('Добавить фигуру справа')).toEqual(['244px', '120px'])
    expect(position('Добавить фигуру сверху')).toEqual(['150px', '56px'])
    expect(position('Добавить фигуру снизу')).toEqual(['150px', '184px'])

    act(() => editor.placeCell('a', { x: 300, y: 100, width: 120, height: 60 }))

    expect(position('Добавить фигуру справа')).toEqual(['444px', '120px'])
  })

  it('hides the arrows when the shape is not shown', () => {
    select('a', ['service'])

    act(() => editor.placeCell('a', null))

    expect(screen.queryAllByRole('button', { name: ARROWS })).toHaveLength(0)
  })

  it('offers only the shapes of the group and adds the chosen one on the side of the arrow', async () => {
    select('table-1', ['table'])

    await userEvent.click(screen.getByRole('button', { name: 'Добавить фигуру справа' }))
    const list = screen.getByRole('dialog', { name: 'Фигуры для связи' })

    expect(within(list).getAllByRole('button').map((button) => button.textContent)).toEqual(['Таблица'])

    await userEvent.click(within(list).getByRole('button', { name: 'Таблица' }))

    expect(editor.addConnectedShape).toHaveBeenCalledWith('right', 'table')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists the shapes in the order of the group', async () => {
    select('a', ['service', 'database', 'load-balancer'])

    await userEvent.click(screen.getByRole('button', { name: 'Добавить фигуру снизу' }))

    const list = screen.getByRole('dialog', { name: 'Фигуры для связи' })
    expect(within(list).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Сервис',
      'База данных',
      'Балансировщик нагрузки',
    ])
  })

  it('closes the list with Escape without adding a shape', async () => {
    select('a', ['service'])
    await userEvent.click(screen.getByRole('button', { name: 'Добавить фигуру слева' }))

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(editor.addConnectedShape).not.toHaveBeenCalled()
  })
})
