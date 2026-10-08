import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DEFAULT_PAGE_ID, ELEMENT_KEY, getCells, initializeDocument, writeCell } from '../diagram/model.ts'
import { addPage } from '../diagram/pages.ts'
import { ELEMENT_DRAG_TYPE } from '../diagram/sharedElements.ts'
import { shapeData } from '../diagram/testing.ts'
import { ElementsPanel, type ElementsRequest } from './ElementsPanel.tsx'

const PAYMENTS = { codrawShape: 'c4-container', [ELEMENT_KEY]: 'e1', codrawName: 'Payments', codrawKind: 'c4-container', codrawTechnology: 'Kotlin' }

describe('ElementsPanel', () => {
  let doc: Y.Doc
  let second: string
  let request: (next: ElementsRequest) => void
  const onShow = vi.fn()
  const onClose = vi.fn()

  function Page({ canPlace = true }: { canPlace?: boolean }) {
    const [current, setCurrent] = useState<ElementsRequest | null>(null)
    useEffect(() => {
      request = (next) => act(() => setCurrent(next))
    })
    return <ElementsPanel document={doc} canPlace={canPlace} request={current} onShow={onShow} onClose={onClose} />
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    onShow.mockReset()
    onClose.mockReset()
    doc = new Y.Doc()
    initializeDocument(doc)
    second = addPage(doc, DEFAULT_PAGE_ID)
    doc.transact(() => {
      writeCell(getCells(doc), shapeData('a', 'a0', { value: 'Payments\n[Container: Kotlin]', style: PAYMENTS }))
      writeCell(getCells(doc), shapeData('db', 'a1', { value: 'Счета\n[PostgreSQL]', style: { codrawShape: 'database' } }))
      writeCell(getCells(doc, second), shapeData('b', 'a0', { value: 'Payments\n[Container: Kotlin]', style: PAYMENTS }))
    })
  })

  const panel = () => screen.getByRole('complementary', { name: 'Элементы доски' })
  const rows = () => within(panel()).getAllByRole('button', { expanded: false }).concat(within(panel()).queryAllByRole('button', { expanded: true }))

  it('lists the elements of all pages with their kind, technology and number of pages', () => {
    render(<Page />)

    const payments = within(panel()).getByRole('button', { name: /Payments/ })
    expect(payments).toHaveTextContent('Container · Kotlin')
    expect(payments).toHaveTextContent('2 стр.')
    expect(within(panel()).getByRole('button', { name: /Счета/ })).toHaveTextContent('1 стр.')
    expect(rows()).toHaveLength(2)
  })

  it('finds elements by their properties', async () => {
    render(<Page />)

    await userEvent.type(within(panel()).getByLabelText('Поиск элементов'), 'kotlin')

    expect(within(panel()).getByRole('button', { name: /Payments/ })).toBeInTheDocument()
    expect(within(panel()).queryByRole('button', { name: /Счета/ })).toBeNull()
    await userEvent.type(within(panel()).getByLabelText('Поиск элементов'), ' redis')
    expect(panel()).toHaveTextContent('Ничего не найдено')
  })

  it('opens an element with its pages, and goes to a cell', async () => {
    render(<Page />)

    await userEvent.click(within(panel()).getByRole('button', { name: /Payments/ }))
    const places = within(panel()).getByRole('list', { name: 'Где используется Payments' })
    await userEvent.click(within(places).getByRole('button', { name: 'Страница 2' }))

    expect(onShow).toHaveBeenCalledWith(second, 'b')
  })

  it('opens the element a request asks for, in the whole list', async () => {
    render(<Page />)
    await userEvent.type(within(panel()).getByLabelText('Поиск элементов'), 'счета')

    request({ key: 'e1' })

    expect(within(panel()).getByLabelText('Поиск элементов')).toHaveValue('')
    expect(within(panel()).getByRole('button', { name: /Payments/ })).toHaveAttribute('aria-expanded', 'true')
    expect(panel()).toHaveFocus()
  })

  it('gives a drag of an element onto the canvas, unless the participant may only view', () => {
    const { unmount } = render(<Page />)
    const setData = vi.fn()

    fireEvent.dragStart(within(panel()).getByRole('button', { name: /Payments/ }), { dataTransfer: { setData } })
    fireEvent.dragStart(within(panel()).getByRole('button', { name: /Счета/ }), { dataTransfer: { setData } })

    expect(setData).toHaveBeenNthCalledWith(1, ELEMENT_DRAG_TYPE, JSON.stringify({ elementId: 'e1' }))
    expect(setData).toHaveBeenNthCalledWith(2, ELEMENT_DRAG_TYPE, JSON.stringify({ cell: { pageId: DEFAULT_PAGE_ID, cellId: 'db' } }))
    unmount()

    render(<Page canPlace={false} />)
    expect(within(panel()).getByRole('button', { name: /Payments/ })).toHaveAttribute('draggable', 'false')
  })

  it('says that the board has no elements, and closes by its button', async () => {
    doc = new Y.Doc()
    initializeDocument(doc)
    render(<Page />)

    expect(panel()).toHaveTextContent('На доске нет элементов')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalled()
  })
})
