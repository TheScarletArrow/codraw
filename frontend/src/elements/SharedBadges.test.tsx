import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DEFAULT_PAGE_ID, ELEMENT_KEY, getCells, initializeDocument, writeCell } from '../diagram/model.ts'
import { addPage } from '../diagram/pages.ts'
import { shapeData } from '../diagram/testing.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { ELEMENTS_INTERVAL_MS } from './elementList.ts'
import { SharedBadges } from './SharedBadges.tsx'

const PAYMENTS = { codrawShape: 'c4-container', [ELEMENT_KEY]: 'e1', codrawName: 'Payments', codrawKind: 'c4-container' }

/** «Payments» on the first page and on «Контекст» and «Деплой», and «Счета» only on the first. */
function board() {
  const doc = new Y.Doc()
  initializeDocument(doc)
  const context = addPage(doc, DEFAULT_PAGE_ID, 'Контекст')
  const deploy = addPage(doc, context, 'Деплой')
  doc.transact(() => {
    writeCell(getCells(doc), shapeData('a', 'a0', { value: 'Payments\n[Container]', style: PAYMENTS }))
    writeCell(getCells(doc), shapeData('db', 'a1', { value: 'Счета', style: { codrawShape: 'database', [ELEMENT_KEY]: 'e2', codrawName: 'Счета' } }))
    writeCell(getCells(doc, context), shapeData('b', 'a0', { value: 'Payments\n[Container]', style: PAYMENTS }))
    writeCell(getCells(doc, deploy), shapeData('c', 'a0', { value: 'Payments\n[Container]', style: PAYMENTS }))
  })
  const editor = createFakeEditor()
  editor.placeCell('a', { x: 100, y: 50, width: 240, height: 120 })
  editor.placeCell('db', { x: 400, y: 50, width: 80, height: 80 })
  return { doc, editor, deploy }
}

describe('SharedBadges', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the number of the other pages of the element of a cell in its top right corner, with their names', () => {
    const { doc, editor } = board()
    render(<SharedBadges editor={editor} document={doc} onShow={() => {}} />)

    const [badge, ...others] = screen.getAllByTestId('shared-badge')
    expect(others).toHaveLength(0)
    expect(badge).toHaveAttribute('data-cell', 'a')
    expect(badge).toHaveTextContent('2')
    expect(badge).toHaveAccessibleName('Есть ещё на 2 страницах: Контекст, Деплой')
    expect([badge!.style.left, badge!.style.top]).toEqual(['336px', '54px'])
  })

  it('asks to show where the element is used, and follows the board', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { doc, editor, deploy } = board()
    const onShow = vi.fn()
    render(<SharedBadges editor={editor} document={doc} onShow={onShow} />)

    act(() => screen.getByTestId('shared-badge').click())
    expect(onShow).toHaveBeenCalledWith('e1')

    act(() => doc.transact(() => getCells(doc, deploy).delete('c')))
    act(() => vi.advanceTimersByTime(ELEMENTS_INTERVAL_MS))
    expect(screen.getByTestId('shared-badge')).toHaveAccessibleName('Есть ещё на 1 странице: Контекст')
  })
})
