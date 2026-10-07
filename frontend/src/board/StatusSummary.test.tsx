import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { getCells, writeCell, writePage } from '../diagram/model.ts'
import { writeStatus, type ElementStatus } from '../diagram/status.ts'
import { boardWith, shapeData } from '../diagram/testing.ts'
import { StatusSummary } from './StatusSummary.tsx'

const bob = { id: 'bob', name: 'Боб' }

/** A board of two pages: «API» and «Кэш» on the first, the table `orders` on «Схема БД». */
function board() {
  const doc = boardWith(
    shapeData('api', 'a0', { value: 'API', geometry: { x: 0, y: 0, width: 120, height: 60 } }),
    shapeData('cache', 'a1', { value: 'Кэш', geometry: { x: 0, y: 200, width: 120, height: 60 } }),
  )
  doc.transact(() => {
    writePage(doc, 'second', { name: 'Схема БД', order: 'b0' })
    writeCell(getCells(doc, 'second'), shapeData('orders', 'a0', { value: 'orders', style: { childLayout: 'stackLayout' } }))
  })
  return doc
}

function mark(doc: Y.Doc, pageId: string | undefined, id: string, status: ElementStatus | null, at = Date.now()) {
  act(() => doc.transact(() => writeStatus(getCells(doc, pageId).get(id)!, status, bob, at)))
}

const dialog = () => screen.getByRole('dialog', { name: 'Статусы элементов' })

describe('StatusSummary', () => {
  it('is hidden while nothing waits for a review', () => {
    const doc = board()
    mark(doc, undefined, 'api', 'done')

    render(<StatusSummary document={doc} onSelect={() => {}} />)

    expect(screen.queryByRole('button', { name: /на ревью/ })).toBeNull()
  })

  it('counts the elements to review on all pages and lists them with their pages, who and when', async () => {
    const doc = board()
    mark(doc, undefined, 'cache', 'review', Date.now() - 5 * 60_000)
    mark(doc, 'second', 'orders', 'review')
    mark(doc, undefined, 'api', 'done')
    render(<StatusSummary document={doc} onSelect={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: '2 на ревью' }))

    expect(within(dialog()).getByRole('tab', { name: 'Нужно ревью 2' })).toHaveAttribute('aria-selected', 'true')
    const review = within(dialog()).getByRole('tabpanel', { name: 'Нужно ревью' })
    expect(within(review).getAllByRole('button').map((item) => item.textContent)).toEqual([
      'Кэш Страница 1 · Боб, 5 минут назад',
      'orders Схема БД · Боб, только что',
    ])

    await userEvent.click(within(dialog()).getByRole('tab', { name: 'Готово 1' }))
    expect(within(dialog()).getByRole('tabpanel', { name: 'Готово' })).toHaveTextContent('API')
    await userEvent.click(within(dialog()).getByRole('tab', { name: 'Черновик 0' }))
    expect(within(dialog()).getByRole('tabpanel', { name: 'Черновик' })).toHaveTextContent('Нет элементов со статусом «Черновик»')
  })

  it('goes to the chosen element and closes', async () => {
    const doc = board()
    mark(doc, 'second', 'orders', 'review')
    const onSelect = vi.fn()
    render(<StatusSummary document={doc} onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: '1 на ревью' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: /orders/ }))

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'second', cellId: 'orders', status: 'review' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('follows the statuses that participants set', async () => {
    const doc = board()
    render(<StatusSummary document={doc} onSelect={() => {}} />)

    mark(doc, undefined, 'api', 'review')
    await waitFor(() => expect(screen.getByRole('button', { name: '1 на ревью' })).toBeInTheDocument())

    mark(doc, 'second', 'orders', 'review')
    await waitFor(() => expect(screen.getByRole('button', { name: '2 на ревью' })).toBeInTheDocument())

    mark(doc, undefined, 'api', 'done')
    mark(doc, 'second', 'orders', null)
    await waitFor(() => expect(screen.queryByRole('button', { name: /на ревью/ })).toBeNull())
  })
})
