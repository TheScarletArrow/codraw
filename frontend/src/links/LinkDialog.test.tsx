import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContextMenuRequest } from '../diagram/editor.ts'
import { boardLink } from '../diagram/links.ts'
import type { PageInfo } from '../diagram/pages.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { mockFetch, renderRoutes } from '../test/render.tsx'
import { LinkDialog } from './LinkDialog.tsx'
import { LINK_ERRORS } from './linkTexts.ts'

const PAGES: PageInfo[] = [
  { id: 'context', name: 'Контекст', order: 'a0' },
  { id: 'containers', name: 'Контейнеры', order: 'a1' },
  { id: 'data', name: 'Данные', order: 'a2' },
]

const REQUEST: ContextMenuRequest = { x: 100, y: 50, point: { x: 300, y: 200 }, target: 'shape', cellId: 'api' }

const board = (id: string, title: string, owner = 'Алиса') => ({
  id,
  title,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  linkAccess: 'none',
  owner: { id: `owner-${owner}`, name: owner, avatarUrl: null },
  role: 'owner',
})

describe('LinkDialog', () => {
  let editor: FakeEditor
  let onClose: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    editor = createFakeEditor({ pageId: 'context' })
    onClose = vi.fn()
    mockFetch({
      'GET /api/boards': { body: [board('current', 'Эта доска'), board('b-1', 'Платежи')] },
      'GET /api/boards/shared': { body: [board('b-2', 'Склад', 'Боб')] },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  /** Opens the window for the element `api` with its link. */
  function open(link: string | null = null, pages = PAGES) {
    act(() => editor.setState({ link: { cellId: 'api', link, canChange: true } }))
    return renderRoutes([
      {
        path: '*',
        element: (
          <div className="relative">
            <LinkDialog editor={editor} request={REQUEST} pages={pages} currentPageId="context" boardId="current" onClose={onClose} />
          </div>
        ),
      },
    ])
  }

  const dialog = () => screen.getByRole('dialog', { name: 'Ссылка' })

  it('offers the page after the current one first, and links to the chosen page', async () => {
    open()

    const page = await screen.findByRole('combobox', { name: 'Страница' })
    expect(screen.getByRole('radio', { name: 'Страница этой доски' })).toBeChecked()
    expect(page).toHaveValue('containers')
    expect(page).toHaveFocus()
    expect(within(page).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Контекст (текущая)',
      'Контейнеры',
      'Данные',
    ])
    expect(screen.queryByRole('button', { name: 'Убрать ссылку' })).toBeNull()

    await userEvent.selectOptions(page, 'Данные')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(editor.setLink).toHaveBeenCalledWith('data:page/id,data')
    expect(onClose).toHaveBeenCalled()
    expect(editor.focus).toHaveBeenCalled()
  })

  it('links to another board of the participant, the current one left out', async () => {
    open()

    await userEvent.click(screen.getByRole('radio', { name: 'Другая доска' }))
    const boards = await screen.findByRole('combobox', { name: 'Доска' })
    expect(within(boards).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Выберите доску',
      'Платежи',
      'Склад — Боб',
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(screen.getByRole('alert')).toHaveTextContent(LINK_ERRORS.board)
    expect(editor.setLink).not.toHaveBeenCalled()

    await userEvent.selectOptions(boards, 'Склад — Боб')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(editor.setLink).toHaveBeenCalledWith(boardLink('b-2'))
  })

  it('takes an address, with https:// when it has no scheme, and Enter saves it', async () => {
    open(null, PAGES.slice(0, 1))

    // A board of one page offers the address first.
    const address = screen.getByRole('textbox', { name: 'Адрес' })
    expect(screen.getByRole('radio', { name: 'Адрес' })).toBeChecked()
    await userEvent.type(address, 'docs.example.com/payments{Enter}')

    expect(editor.setLink).toHaveBeenCalledWith('https://docs.example.com/payments')
  })

  it('refuses javascript: and other addresses that CoDraw does not open, and an empty address', async () => {
    open(null, PAGES.slice(0, 1))
    const address = screen.getByRole('textbox', { name: 'Адрес' })

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(screen.getByRole('alert')).toHaveTextContent(LINK_ERRORS.empty)

    for (const text of ['javascript:alert(1)', 'data:text/html,<b>hi</b>', 'file:///etc/passwd']) {
      await userEvent.clear(address)
      await userEvent.type(address, `${text}{Enter}`)
      expect(screen.getByRole('alert')).toHaveTextContent(LINK_ERRORS.address)
      expect(address).toHaveAccessibleDescription(LINK_ERRORS.address)
    }

    expect(editor.setLink).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(dialog()).toBeInTheDocument()
  })

  it('opens with the link of the element, and removes it', async () => {
    open('https://docs.example.com/payments')

    expect(screen.getByRole('radio', { name: 'Адрес' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Адрес' })).toHaveValue('https://docs.example.com/payments')
    await userEvent.click(screen.getByRole('button', { name: 'Убрать ссылку' }))

    expect(editor.setLink).toHaveBeenCalledWith(null)
    expect(onClose).toHaveBeenCalled()
  })

  it('opens with a link to a page on that page', () => {
    open('data:page/id,data')
    expect(screen.getByRole('combobox', { name: 'Страница' })).toHaveValue('data')
  })

  it('keeps a link to a board that is not in the lists, with its page', async () => {
    const link = `${boardLink('b-9')}?page=p-2`
    open(link)

    expect(screen.getByRole('radio', { name: 'Другая доска' })).toBeChecked()
    const boards = await screen.findByRole('combobox', { name: 'Доска' })
    expect(boards).toHaveValue('b-9')
    expect(within(boards).getAllByRole('option')[0]).toHaveTextContent('Доска по ссылке')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(editor.setLink).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('tells when the boards could not be loaded, and the address still takes one', async () => {
    mockFetch({ 'GET /api/boards': { status: 500 }, 'GET /api/boards/shared': { status: 500 } })
    open()

    await userEvent.click(screen.getByRole('radio', { name: 'Другая доска' }))

    await waitFor(() => expect(dialog()).toHaveTextContent('Не удалось загрузить доски'), { timeout: 5_000 })
  })

  it('closes without a change with Cancel and Escape', async () => {
    open()

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')

    expect(editor.setLink).not.toHaveBeenCalled()
    expect(editor.focus).toHaveBeenCalled()
  })
})
