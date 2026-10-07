import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DEFAULT_PAGE_ID, getCells, initializeDocument, LAYER_CELL_ID, writeCell, writePage, type CellData } from '../diagram/model.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { CanvasSearch } from './CanvasSearch.tsx'
import { usePages } from './usePages.ts'

const SECOND_PAGE = 'page-2'

const shape = (id: string, value: string, y: number, parent = LAYER_CELL_ID): CellData => ({
  id,
  kind: 'vertex',
  parent,
  order: 'a0',
  value,
  geometry: { x: 0, y, width: 120, height: 30 },
  source: null,
  target: null,
  style: {},
})

/** «Customer API» and «Склад» on the first page, the table `orders` with the field `customer_id uuid` on the second. */
function board() {
  const doc = new Y.Doc()
  initializeDocument(doc)
  doc.transact(() => {
    writePage(doc, SECOND_PAGE, { name: 'Данные', order: 'b0' })
    writeCell(getCells(doc), shape('api', 'Customer API', 0))
    writeCell(getCells(doc), shape('stock', 'Склад', 200))
    writeCell(getCells(doc, SECOND_PAGE), shape('orders', 'orders', 0))
    writeCell(getCells(doc, SECOND_PAGE), shape('customer-id', 'customer_id uuid', 30, 'orders'))
  })
  return doc
}

describe('CanvasSearch', () => {
  let doc: Y.Doc
  /** The editors of the canvases of the pages, the last one shown. */
  let editors: FakeEditor[]
  const editor = () => editors.at(-1)!

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    doc = board()
    editors = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * The search on a page that shows one page on its canvas, with a new editor for every page, as the board does. With
   * `deferPages`, an asked page is shown only by `showPages`, as a transition of the router shows it.
   */
  function open({ isMac = false, deferPages = false, onNavigate = vi.fn() } = {}) {
    let asked: string[] = []
    const board = { show: (_id: string) => {} }
    function Board() {
      const pages = usePages(doc)
      const [pageId, setPageId] = useState(DEFAULT_PAGE_ID)
      const [shown, setShown] = useState<FakeEditor | null>(null)
      useEffect(() => {
        board.show = setPageId
      }, [])
      return (
        <>
          <Canvas pageId={pageId} onEditor={setShown} />
          <CanvasSearch
            document={doc}
            pages={pages}
            pageId={pageId}
            editor={shown}
            onSelectPage={(id) => (deferPages ? asked.push(id) : setPageId(id))}
            onNavigate={onNavigate}
            isMac={isMac}
          />
        </>
      )
    }
    render(<Board />)
    return {
      onNavigate,
      /** Shows the last page asked for. */
      showPages() {
        const last = asked.at(-1)
        asked = []
        if (last) act(() => board.show(last))
      },
    }
  }

  /** A canvas of a page, which hands its editor over once it is made, as the canvas of the board does. */
  function Canvas({ pageId, onEditor }: { pageId: string; onEditor: (editor: FakeEditor | null) => void }) {
    useEffect(() => {
      const created = createFakeEditor({ pageId })
      editors.push(created)
      onEditor(created)
      return () => onEditor(null)
    }, [pageId, onEditor])
    return <p data-testid="page">{pageId}</p>
  }

  const field = () => screen.queryByRole<HTMLInputElement>('searchbox', { name: 'Найти на доске' })
  const bar = () => screen.queryByRole('search', { name: 'Поиск на доске' })
  /** Presses `Ctrl+F` or another key on `target`; `false` when the browser would not do what it does by default. */
  const press = (init: KeyboardEventInit, target: Element = document.body) => {
    let done = true
    act(() => {
      done = fireEvent.keyDown(target, init)
    })
    return done
  }
  const find = () => press({ key: 'f', code: 'KeyF', ctrlKey: true })
  const type = (text: string) => act(() => fireEvent.change(field()!, { target: { value: text } }))
  const enter = (shiftKey = false) => act(() => fireEvent.keyDown(field()!, { key: 'Enter', shiftKey }))
  const shownPage = () => screen.getByTestId('page').textContent

  it('opens over the canvas with Ctrl+F anywhere on the page instead of the find of the browser', () => {
    open()
    expect(bar()).toBeNull()

    expect(find()).toBe(false)

    expect(bar()).toBeInTheDocument()
    expect(field()).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Следующее совпадение' })).toBeDisabled()

    for (const tag of ['input', 'div']) {
      const other = document.createElement(tag)
      if (tag === 'div') other.setAttribute('contenteditable', 'true')
      document.body.append(other)
      other.focus()
      expect(press({ key: 'f', code: 'KeyF', ctrlKey: true }, other)).toBe(false)
      expect(field()).toHaveFocus()
      other.remove()
    }
  })

  it('takes Cmd+F on macOS, the key of F on another layout, and no other keys', () => {
    open({ isMac: true })

    expect(press({ key: 'f', code: 'KeyF', ctrlKey: true })).toBe(true)
    expect(press({ key: 'f', code: 'KeyF', metaKey: true, shiftKey: true })).toBe(true)
    expect(press({ key: 'u', code: 'KeyF', metaKey: true })).toBe(true)
    expect(bar()).toBeNull()

    expect(press({ key: 'а', code: 'KeyF', metaKey: true })).toBe(false)
    expect(bar()).toBeInTheDocument()
  })

  it('selects the text of the open field with Ctrl+F', () => {
    open()
    find()
    type('склад')
    field()!.setSelectionRange(2, 2)
    act(() => (document.activeElement as HTMLElement | null)?.blur())

    find()

    expect(field()).toHaveFocus()
    expect([field()!.selectionStart, field()!.selectionEnd]).toEqual([0, 5])
  })

  it('goes to the first match on the page while typing, then to the next one on another page with Enter, and back', () => {
    const { onNavigate } = open()
    find()

    type('CUSTOMER')

    expect(screen.getByText('1 из 2')).toBeInTheDocument()
    expect(editor().revealCell).toHaveBeenCalledWith('api')
    expect(onNavigate).toHaveBeenCalledTimes(1)

    enter()

    expect(shownPage()).toBe(SECOND_PAGE)
    expect(editor().pageId).toBe(SECOND_PAGE)
    expect(editor().revealCell).toHaveBeenCalledWith('customer-id')
    expect(screen.getByText('2 из 2')).toBeInTheDocument()
    expect(onNavigate).toHaveBeenCalledTimes(2)

    enter(true)

    expect(shownPage()).toBe(DEFAULT_PAGE_ID)
    expect(editor().revealCell).toHaveBeenCalledWith('api')
    expect(screen.getByText('1 из 2')).toBeInTheDocument()

    enter(true)
    expect(shownPage()).toBe(SECOND_PAGE)
    expect(screen.getByText('2 из 2')).toBeInTheDocument()
    enter()
    expect(shownPage()).toBe(DEFAULT_PAGE_ID)
    expect(screen.getByText('1 из 2')).toBeInTheDocument()
  })

  it('goes with the buttons too', () => {
    open()
    find()
    type('customer')

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Следующее совпадение' })))
    expect(screen.getByText('2 из 2')).toBeInTheDocument()
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Предыдущее совпадение' })))
    expect(screen.getByText('1 из 2')).toBeInTheDocument()
    expect(shownPage()).toBe(DEFAULT_PAGE_ID)
  })

  it('keeps the current match while the query still matches it, and starts on the current page when it does not', () => {
    open()
    find()
    type('c')
    // «Customer API», then «customer_id uuid» on the second page.
    enter()
    expect(screen.getByText('2 из 2')).toBeInTheDocument()
    const reveals = vi.mocked(editor().revealCell).mock.calls.length

    type('cust')

    expect(screen.getByText('2 из 2')).toBeInTheDocument()
    expect(editor().revealCell).toHaveBeenCalledTimes(reveals)

    type('customer api')

    expect(screen.getByText('1 из 1')).toBeInTheDocument()
    expect(shownPage()).toBe(DEFAULT_PAGE_ID)
    expect(editor().revealCell).toHaveBeenCalledWith('api')
  })

  it('tells that nothing matches and shows nothing for an empty query', () => {
    open()
    find()

    type('кухня')

    expect(screen.getByText('Нет совпадений')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Предыдущее совпадение' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Следующее совпадение' })).toBeDisabled()
    enter()
    expect(editor().revealCell).not.toHaveBeenCalled()

    type('  ')
    expect(screen.queryByText('Нет совпадений')).toBeNull()
    expect(bar()).not.toHaveTextContent(/из/)
  })

  it('follows the changes of the board, keeping the current match while it is there', () => {
    open()
    find()
    type('склад')
    expect(screen.getByText('1 из 1')).toBeInTheDocument()

    act(() => doc.transact(() => writeCell(getCells(doc), shape('stock-2', 'Склад запчастей', 400))))
    expect(screen.getByText('1 из 1')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(150))

    expect(screen.getByText('1 из 2')).toBeInTheDocument()

    act(() => doc.transact(() => writeCell(getCells(doc), shape('stock-0', 'Склад сырья', -100))))
    act(() => vi.advanceTimersByTime(150))
    expect(screen.getByText('2 из 3')).toBeInTheDocument()

    vi.mocked(editor().revealCell).mockClear()
    act(() => doc.transact(() => getCells(doc).delete('stock')))
    act(() => vi.advanceTimersByTime(150))

    expect(screen.getByText('2 совпадения')).toBeInTheDocument()
    expect(editor().revealCell).not.toHaveBeenCalled()

    enter(true)
    expect(screen.getByText('2 из 2')).toBeInTheDocument()
    expect(editor().revealCell).toHaveBeenCalledWith('stock-2')
  })

  it('closes with Escape or its button, giving the keyboard to the canvas, and opens again with the query', () => {
    open()
    find()
    type('customer')
    const canvas = editor()

    act(() => fireEvent.keyDown(field()!, { key: 'Escape' }))

    expect(bar()).toBeNull()
    expect(canvas.focus).toHaveBeenCalled()
    expect(canvas.clearSelection).not.toHaveBeenCalled()

    act(() => doc.transact(() => writeCell(getCells(doc), shape('crm', 'CRM customers', 400))))
    find()

    expect(field()).toHaveValue('customer')
    expect([field()!.selectionStart, field()!.selectionEnd]).toEqual([0, 8])
    expect(screen.getByText('3 совпадения')).toBeInTheDocument()
    enter()
    expect(screen.getByText('1 из 3')).toBeInTheDocument()

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Закрыть поиск' })))
    expect(bar()).toBeNull()
  })

  it('shows the last of the matches gone to before the page of the one before was shown', () => {
    const { showPages } = open({ deferPages: true })
    find()
    type('customer')
    const first = editor()

    enter()
    // The second page is asked for, and the canvas still shows the first one.
    expect(first.revealCell).toHaveBeenCalledTimes(1)
    enter()
    expect(screen.getByText('1 из 2')).toBeInTheDocument()
    showPages()

    // The page last asked for is the first one again.
    expect(shownPage()).toBe(DEFAULT_PAGE_ID)
    expect(editors).toEqual([first])
    expect(first.revealCell).toHaveBeenCalledTimes(2)
    expect(first.revealCell).toHaveBeenLastCalledWith('api')
  })
})
