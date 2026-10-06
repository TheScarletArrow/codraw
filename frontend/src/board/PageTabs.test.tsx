import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PageInfo } from '../diagram/pages.ts'
import { PageTabs } from './PageTabs.tsx'

const PAGES: PageInfo[] = [
  { id: 'p1', name: 'Контекст', order: 'a0' },
  { id: 'p2', name: 'Контейнеры', order: 'a1' },
  { id: 'p3', name: 'Схема БД', order: 'a2' },
]

function renderTabs(props: Partial<Parameters<typeof PageTabs>[0]> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
  }
  render(<PageTabs pages={PAGES} currentPageId="p1" {...handlers} {...props} />)
  return handlers
}

const tab = (name: string) => screen.getByRole('tab', { name })

async function openMenu(name: string) {
  await userEvent.click(screen.getByRole('button', { name: `Меню страницы «${name}»` }))
  return screen.getByRole('menu', { name: `Страница «${name}»` })
}

describe('PageTabs', () => {
  it('shows the tabs of the pages in order and marks the current one', () => {
    renderTabs({ currentPageId: 'p2' })

    const tabs = within(screen.getByRole('tablist', { name: 'Страницы' })).getAllByRole('tab')
    expect(tabs.map((element) => element.textContent)).toEqual(['Контекст', 'Контейнеры', 'Схема БД'])
    expect(tab('Контейнеры')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Контекст')).toHaveAttribute('aria-selected', 'false')
  })

  it('selects a page with a click and adds one with the plus button', async () => {
    const handlers = renderTabs()

    await userEvent.click(tab('Схема БД'))
    await userEvent.click(screen.getByRole('button', { name: 'Добавить страницу' }))

    expect(handlers.onSelect).toHaveBeenCalledWith('p3')
    expect(handlers.onAdd).toHaveBeenCalled()
  })

  it('renames a page after a double click; Enter saves and Escape cancels', async () => {
    const handlers = renderTabs()

    await userEvent.dblClick(tab('Контекст'))
    const input = screen.getByRole('textbox', { name: 'Имя страницы' })
    await userEvent.clear(input)
    await userEvent.type(input, 'Обзор{Enter}')
    expect(handlers.onRename).toHaveBeenCalledWith('p1', 'Обзор')
    expect(handlers.onRename).toHaveBeenCalledTimes(1)

    await userEvent.dblClick(tab('Контейнеры'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Имя страницы' }), 'Другое{Escape}')
    expect(handlers.onRename).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('textbox', { name: 'Имя страницы' })).toBeNull()
  })

  it('does not save an empty name', async () => {
    const handlers = renderTabs()

    await userEvent.dblClick(tab('Контекст'))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Имя страницы' }))
    await userEvent.keyboard('{Enter}')

    expect(handlers.onRename).not.toHaveBeenCalled()
  })

  it('renames, duplicates and moves a page from its menu', async () => {
    const handlers = renderTabs({ currentPageId: 'p2' })

    await userEvent.click(within(await openMenu('Контейнеры')).getByRole('menuitem', { name: 'Дублировать' }))
    expect(handlers.onDuplicate).toHaveBeenCalledWith('p2')

    await userEvent.click(within(await openMenu('Контейнеры')).getByRole('menuitem', { name: 'Переместить влево' }))
    expect(handlers.onMove).toHaveBeenLastCalledWith('p2', 0)

    await userEvent.click(within(await openMenu('Контейнеры')).getByRole('menuitem', { name: 'Переместить вправо' }))
    expect(handlers.onMove).toHaveBeenLastCalledWith('p2', 2)

    await userEvent.click(within(await openMenu('Контейнеры')).getByRole('menuitem', { name: 'Переименовать' }))
    expect(screen.getByRole('textbox', { name: 'Имя страницы' })).toHaveValue('Контейнеры')
  })

  it('opens the menu of a page with a right click', async () => {
    renderTabs()

    fireEvent.contextMenu(tab('Схема БД'))

    const menu = await screen.findByRole('menu', { name: 'Страница «Схема БД»' })
    expect(within(menu).getByRole('menuitem', { name: 'Переместить вправо' })).toBeDisabled()
    expect(within(menu).getByRole('menuitem', { name: 'Переместить влево' })).toBeEnabled()
  })

  it('deletes a page only after confirmation', async () => {
    const handlers = renderTabs()

    await userEvent.click(within(await openMenu('Контекст')).getByRole('menuitem', { name: 'Удалить' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'Удаление страницы' })
    expect(confirmation).toHaveTextContent('Удалить страницу «Контекст»')
    expect(handlers.onDelete).not.toHaveBeenCalled()

    await userEvent.click(within(confirmation).getByRole('button', { name: 'Удалить' }))
    expect(handlers.onDelete).toHaveBeenCalledWith('p1')
  })

  it('does not offer to delete the only page', async () => {
    renderTabs({ pages: [PAGES[0]!] })

    expect(within(await openMenu('Контекст')).getByRole('menuitem', { name: 'Удалить' })).toBeDisabled()
  })

  it('moves a page dragged onto another tab', () => {
    const handlers = renderTabs()
    const data = new Map<string, string>()
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? '',
      get types() {
        return Array.from(data.keys())
      },
      effectAllowed: 'all',
    }

    fireEvent.dragStart(tab('Схема БД'), { dataTransfer })
    fireEvent.dragOver(tab('Контекст'), { dataTransfer })
    fireEvent.drop(tab('Контекст'), { dataTransfer })

    expect(handlers.onMove).toHaveBeenCalledWith('p3', 0)
  })

  it('shows other participants on the tabs of their pages', () => {
    renderTabs({
      visitors: [
        { clientId: 7, name: 'Боб', color: '#dc2626', page: 'p2' },
        { clientId: 8, name: 'Ева', color: '#16a34a', page: 'p2' },
      ],
    })

    expect(within(tab('Контейнеры')).getAllByTestId('page-visitor')).toHaveLength(2)
    expect(within(tab('Контейнеры')).getByLabelText('На странице: Боб, Ева')).toBeInTheDocument()
    expect(within(tab('Контекст')).queryAllByTestId('page-visitor')).toHaveLength(0)
  })

  it('lets a participant who may only view switch pages, and nothing else', async () => {
    const handlers = renderTabs({ readOnly: true })

    await userEvent.click(tab('Контейнеры'))
    await userEvent.dblClick(tab('Контекст'))
    fireEvent.contextMenu(tab('Контекст'))
    fireEvent.keyDown(tab('Контекст'), { key: 'F2' })

    expect(handlers.onSelect).toHaveBeenCalledWith('p2')
    expect(screen.queryByRole('textbox', { name: 'Имя страницы' })).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Добавить страницу' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Меню страницы «Контекст»' })).toBeNull()
    expect(tab('Контекст')).toHaveAttribute('draggable', 'false')
  })

  it('shows what it is given at the end of the bar, after the tabs and the plus button', () => {
    renderTabs({ children: <p>Изменено: Боб, только что</p> })

    const status = screen.getByText('Изменено: Боб, только что')
    const add = screen.getByRole('button', { name: 'Добавить страницу' })
    expect(add.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('tablist', { name: 'Страницы' })).not.toContainElement(status)
  })
})
