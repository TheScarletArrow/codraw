import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createDetailPage } from '../diagram/detail.ts'
import { DEFAULT_PAGE_ID, getCells, getElements, initializeDocument, writeCell } from '../diagram/model.ts'
import { renamePage } from '../diagram/pages.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import { DetailCrumbs } from './DetailCrumbs.tsx'

/** «Контекст» with Payments, and the page of detail of Payments. */
function board() {
  const doc = new Y.Doc()
  initializeDocument(doc)
  renamePage(doc, DEFAULT_PAGE_ID, 'Контекст')
  const builder = new DiagramBuilder()
  const payments = builder.shape('c4-system', 0, 0, { value: 'Payments\n[Software System]' })
  doc.transact(() => builder.build().forEach((cell) => writeCell(getCells(doc), cell)))
  let detail = ''
  doc.transact(() => {
    detail = createDetailPage(doc, { pageId: DEFAULT_PAGE_ID, cellId: payments })!.pageId
  })
  return { doc, detail }
}

describe('DetailCrumbs', () => {
  it('shows the way down to a page of detail, goes up a crumb, and follows the name of the element', async () => {
    const { doc, detail } = board()
    const onSelectPage = vi.fn()
    render(<DetailCrumbs document={doc} pageId={detail} onSelectPage={onSelectPage} />)

    const crumbs = screen.getByRole('navigation', { name: 'Детализация' })
    expect(crumbs).toHaveTextContent('КонтекстPayments')
    expect(screen.getByText('Payments')).toHaveAttribute('aria-current', 'page')
    await userEvent.click(screen.getByRole('button', { name: 'Контекст' }))
    expect(onSelectPage).toHaveBeenCalledWith(DEFAULT_PAGE_ID)

    const element = [...getElements(doc).values()][0]!
    act(() => element.set('name', 'Billing'))
    expect(screen.getByText('Billing')).toHaveAttribute('aria-current', 'page')
  })

  it('is not there on a page that details nothing', () => {
    const { doc } = board()
    render(<DetailCrumbs document={doc} pageId={DEFAULT_PAGE_ID} onSelectPage={vi.fn()} />)
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})
