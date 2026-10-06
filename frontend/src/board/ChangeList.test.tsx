import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { diffDocuments } from '../diagram/diff.ts'
import { getCells, getPages, writeCell, writePage } from '../diagram/model.ts'
import { boardWith, laterState, shapeData } from '../diagram/testing.ts'
import { ChangeList } from './ChangeList.tsx'

const pages = [
  { id: 'page-1', name: 'Страница 1' },
  { id: 'page-2', name: 'Схема v2' },
  { id: 'page-3', name: 'Черновик' },
]

/** A version with shapes on three pages, and the board after shapes were added, changed and removed on them. */
function changedBoard() {
  const version = boardWith(shapeData('api', 'a0', { value: 'API' }), shapeData('cache', 'a1', { value: 'Кэш' }))
  version.transact(() => {
    writePage(version, 'page-2', { name: 'Схема', order: 'a1' })
    writeCell(getCells(version, 'page-2'), shapeData('db', 'a0', { value: 'БД' }))
    writePage(version, 'page-3', { name: 'Черновик', order: 'a2' })
    writeCell(getCells(version, 'page-3'), shapeData('sketch', 'a0', { value: 'Набросок' }))
  })
  const now = laterState(version, (doc) => {
    getCells(doc).get('api')!.set('value', 'Шлюз')
    getCells(doc).delete('cache')
    writeCell(getCells(doc), shapeData('queue', 'a2', { value: 'Очередь', style: { codrawShape: 'queue' } }))
    ;(getPages(doc).get('page-2') as Y.Map<unknown>).set('name', 'Схема v2')
    writeCell(getCells(doc, 'page-2'), shapeData('users', 'a1', { value: 'users', style: { childLayout: 'stackLayout' } }))
    for (const field of ['id', 'email', 'name']) {
      writeCell(getCells(doc, 'page-2'), shapeData(`users.${field}`, 'a0', { parent: 'users', value: field }))
    }
    getPages(doc).delete('page-3')
  })
  return diffDocuments(version, now)
}

describe('ChangeList', () => {
  it('counts the changes and lists them by page, the current page first', () => {
    render(<ChangeList diff={changedBoard()} pages={pages} currentPageId="page-2" selected={null} onSelect={vi.fn()} />)

    const list = screen.getByRole('complementary', { name: 'Изменения' })
    // The fields of the new table are part of its item.
    expect(within(list).getByText('Добавлено 2 · Изменено 1 · Удалено 2')).toBeInTheDocument()
    expect(within(list).getAllByRole('region').map((section) => section.getAttribute('aria-label'))).toEqual([
      'Схема v2',
      'Страница 1',
      'Черновик',
    ])
    expect(within(list).getByRole('heading', { name: 'Схема v2 была «Схема»' })).toBeInTheDocument()
    expect(within(list).getByRole('heading', { name: 'Черновик удалена' })).toBeInTheDocument()
  })

  it('names each element and what changed in it', () => {
    render(<ChangeList diff={changedBoard()} pages={pages} currentPageId="page-1" selected={null} onSelect={vi.fn()} />)

    const first = screen.getByRole('region', { name: 'Страница 1' })
    expect(within(first).getAllByRole('button').map((button) => button.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      'Добавлено: Очередь',
      'Изменено: Шлюз Прямоугольник · подпись было «API»',
      'Удалено: Кэш Прямоугольник',
    ])
    expect(within(screen.getByRole('region', { name: 'Схема v2' })).getByRole('button')).toHaveAccessibleName(
      'Добавлено: users Таблица, вложенных: 3',
    )
    expect(within(screen.getByRole('region', { name: 'Черновик' })).getByRole('button')).toHaveTextContent('Удалено: Набросок')
  })

  it('goes to an element and marks the chosen one', async () => {
    const onSelect = vi.fn()
    const diff = changedBoard()
    const { rerender } = render(<ChangeList diff={diff} pages={pages} currentPageId="page-1" selected={null} onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: /Изменено: Шлюз/ }))

    expect(onSelect).toHaveBeenCalledWith({ pageId: 'page-1', cellId: 'api' })
    rerender(<ChangeList diff={diff} pages={pages} currentPageId="page-1" selected={{ pageId: 'page-1', cellId: 'api' }} onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /Изменено: Шлюз/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Удалено: Кэш/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('brings back a removed or changed element of a page the board has, when it may', async () => {
    const onSelect = vi.fn()
    const onRevert = vi.fn()
    const diff = changedBoard()
    const { rerender } = render(
      <ChangeList diff={diff} pages={pages} currentPageId="page-1" selected={null} onSelect={onSelect} onRevert={onRevert} />,
    )

    // Nothing to bring back for the new table, and no page to bring «Набросок» back to.
    expect(screen.getAllByRole('button', { name: /^Вернуть/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'Вернуть «Шлюз»',
      'Вернуть «Кэш»',
    ])
    expect(within(screen.getByRole('region', { name: 'Страница 1' })).getAllByRole('listitem')[2]).toHaveTextContent(/Кэш.*Вернуть/)
    await userEvent.click(screen.getByRole('button', { name: 'Вернуть «Кэш»' }))

    expect(onRevert).toHaveBeenCalledWith({ pageId: 'page-1', cellId: 'cache' })
    expect(onSelect).not.toHaveBeenCalled()
    rerender(<ChangeList diff={diff} pages={pages} currentPageId="page-1" selected={null} onSelect={onSelect} />)
    expect(screen.queryByRole('button', { name: /^Вернуть/ })).toBeNull()
  })

  it('says so when the board has not changed since the version', () => {
    const version = boardWith(shapeData('api', 'a0'))
    render(
      <ChangeList diff={diffDocuments(version, laterState(version))} pages={pages} currentPageId="page-1" selected={null} onSelect={vi.fn()} />,
    )

    expect(screen.getByText('Добавлено 0 · Изменено 0 · Удалено 0')).toBeInTheDocument()
    expect(screen.getByText('После этой версии доска не менялась.')).toBeInTheDocument()
  })

  it('marks the elements and the pages that changed elsewhere too, and tells how many there are', () => {
    const conflicts = { pages: new Set(['page-3']), cells: new Map([['page-1', new Set(['api'])]]) }

    render(
      <ChangeList diff={changedBoard()} pages={pages} currentPageId="page-1" selected={null} onSelect={vi.fn()} conflicts={conflicts} />,
    )

    const list = screen.getByRole('complementary', { name: 'Изменения' })
    expect(within(list).getByText('Изменено и на доске: 2')).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: /Изменено: Шлюз/ })).toHaveTextContent('Изменено на доске после предложения')
    expect(within(list).getByRole('button', { name: /Добавлено: Очередь/ })).not.toHaveTextContent('после предложения')
    expect(within(list).getByRole('heading', { name: 'Черновик удалена, изменена на доске после предложения' })).toBeInTheDocument()
  })

  it('tells of no conflicts without them', () => {
    render(<ChangeList diff={changedBoard()} pages={pages} currentPageId="page-1" selected={null} onSelect={vi.fn()} />)

    expect(screen.queryByText(/на доске/)).toBeNull()
  })
})
