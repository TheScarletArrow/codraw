import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { getCells, initializeDocument, writeCell } from '../diagram/model.ts'
import { addPage } from '../diagram/pages.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import { CHECKS_INTERVAL_MS } from './useChecks.ts'
import { ChecksButton, ChecksPanel } from './ChecksPanel.tsx'

/** API → БД without a label and a technology on the first page, and «Ledger» on both pages as two elements. */
function board() {
  const doc = new Y.Doc()
  initializeDocument(doc)
  const second = addPage(doc, 'page-1', 'Деплой')
  const first = new DiagramBuilder()
  const api = first.shape('service', 0, 0, { value: 'API', element: { technology: 'Kotlin' } })
  const db = first.shape('database', 300, 0, { value: 'БД', element: { technology: 'PostgreSQL' } })
  const edge = first.edge(api, db)
  const ledger = first.shape('service', 0, 300, { value: 'Ledger', element: { technology: 'Go' } })
  first.edge(ledger, api, { value: 'Проводит', technology: 'gRPC' })
  const other = new DiagramBuilder()
  const copy = other.shape('service', 0, 0, { value: 'Ledger', element: { technology: 'Go' } })
  const kafka = other.shape('queue', 300, 0, { value: 'Kafka', element: { technology: 'Kafka' } })
  other.edge(copy, kafka, { value: 'Публикует', technology: 'Kafka' })
  doc.transact(() => {
    first.build().forEach((cell) => writeCell(getCells(doc), cell))
    other.build().forEach((cell) => writeCell(getCells(doc, second), cell))
  })
  return { doc, second, edge, ledger, copy }
}

describe('ChecksPanel', () => {
  it('lists the remarks by rule with why, goes to their cells, hides and shows them', async () => {
    const { doc, edge } = board()
    const onShow = vi.fn()
    render(<ChecksPanel document={doc} canChange onShow={onShow} onMerge={vi.fn()} onClose={vi.fn()} />)

    const label = screen.getByRole('region', { name: 'Связь без подписи' })
    expect(label).toHaveTextContent('Связь без подписи (1)')
    expect(label).toHaveTextContent('Подпись говорит, зачем один элемент обращается к другому')
    expect(label).toHaveTextContent('«API» → «БД»')
    expect(screen.getByRole('region', { name: 'Связь без технологии' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Вероятные дубли' })).toHaveTextContent('«Ledger»')
    // The owner is checked only on boards that turn it on.
    expect(screen.queryByRole('region', { name: 'Без владельца' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Замечания 3' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(within(label).getByRole('button', { name: 'стр. «Страница 1»' }))
    expect(onShow).toHaveBeenCalledWith('page-1', edge)

    await userEvent.click(within(label).getByRole('button', { name: 'Скрыть замечание «Связь без подписи»: «API» → «БД»' }))
    expect(screen.queryByRole('region', { name: 'Связь без подписи' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Замечания 2' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Показать скрытые (1)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Показать замечание «Связь без подписи»: «API» → «БД»' }))
    expect(screen.getByRole('tab', { name: 'Замечания 3' })).toBeInTheDocument()
  })

  it('turns rules on and off for the board, and follows the changes of the board', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { doc, edge } = board()
      render(<ChecksPanel document={doc} canChange onShow={vi.fn()} onMerge={vi.fn()} onClose={vi.fn()} />)
      await userEvent.click(screen.getByRole('tab', { name: 'Правила' }))
      await userEvent.click(screen.getByRole('checkbox', { name: /Связь без подписи/ }))
      await userEvent.click(screen.getByRole('checkbox', { name: /Без владельца/ }))
      await userEvent.click(screen.getByRole('tab', { name: /Замечания/ }))
      expect(screen.queryByRole('region', { name: 'Связь без подписи' })).toBeNull()
      expect(screen.getByRole('region', { name: 'Без владельца' })).toHaveTextContent('Без владельца (5)')

      // Another participant gives the edge a technology.
      act(() => (getCells(doc).get(edge)!.get('style') as Y.Map<unknown>).set('codrawTechnology', 'JDBC'))
      expect(screen.getByRole('region', { name: 'Связь без технологии' })).toBeInTheDocument()
      await act(async () => vi.advanceTimersByTime(CHECKS_INTERVAL_MS))
      expect(screen.queryByRole('region', { name: 'Связь без технологии' })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('merges probable duplicates into the element whose properties are chosen', async () => {
    const { doc, second, ledger, copy } = board()
    const onMerge = vi.fn()
    render(<ChecksPanel document={doc} canChange onShow={vi.fn()} onMerge={onMerge} onClose={vi.fn()} />)
    const duplicates = screen.getByRole('region', { name: 'Вероятные дубли' })

    await userEvent.click(within(duplicates).getByRole('button', { name: 'Объединить…' }))
    const form = within(duplicates).getByRole('form', { name: 'Объединить в один элемент' })
    expect(within(form).getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)).toEqual([
      'LedgerСервис · Go · 1 стр.',
      'LedgerСервис · Go · 1 стр.',
    ])
    await userEvent.click(within(form).getAllByRole('radio')[1]!)
    await userEvent.click(within(form).getByRole('button', { name: 'Объединить' }))

    expect(onMerge).toHaveBeenCalledWith(
      [
        { pageId: 'page-1', cellId: ledger },
        { pageId: second, cellId: copy },
      ],
      { pageId: second, cellId: copy },
    )
  })

  it('shows a viewer the remarks and the rules without changing them', async () => {
    const { doc } = board()
    render(<ChecksPanel document={doc} canChange={false} onShow={vi.fn()} onMerge={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Скрыть замечание/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Объединить…' })).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: 'Правила' }))
    expect(screen.getByRole('checkbox', { name: /Связь без подписи/ })).toBeDisabled()
  })

  it('tells on its button how many remarks the board has', () => {
    const { doc } = board()
    const onToggle = vi.fn()
    const { rerender } = render(<ChecksButton document={doc} open={false} onToggle={onToggle} />)
    expect(screen.getByRole('button', { name: 'Проверки: 3 замечания' })).toHaveTextContent('3')
    rerender(<ChecksButton document={null} open={false} onToggle={onToggle} />)
    expect(screen.getByRole('button', { name: 'Проверки' })).toHaveAttribute('aria-pressed', 'false')
  })
})
