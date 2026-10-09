import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { ELEMENT_KEY, ELEMENT_STYLE_KEYS, getCells, initializeDocument, writeCell } from '../diagram/model.ts'
import { addPage } from '../diagram/pages.ts'
import { edgeData, shapeData } from '../diagram/testing.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { ImpactPanel } from './ImpactPanel.tsx'

/** Payments → Ledger on the first page; Payments, the same element, → Kafka on «Деплой». */
function board() {
  const doc = new Y.Doc()
  initializeDocument(doc)
  const deploy = addPage(doc, 'page-1', 'Деплой')
  const element = (id: string, value: string) =>
    shapeData(id, 'a0', { value, style: { codrawShape: 'service', [ELEMENT_KEY]: value, [ELEMENT_STYLE_KEYS.name]: value } })
  doc.transact(() => {
    writeCell(getCells(doc), element('p1', 'Payments'))
    writeCell(getCells(doc), element('l1', 'Ledger'))
    writeCell(getCells(doc), edgeData('a', 'a1', 'p1', 'l1'))
    writeCell(getCells(doc, deploy), element('p2', 'Payments'))
    writeCell(getCells(doc, deploy), shapeData('k', 'a0', { value: 'Kafka', style: { codrawShape: 'event-topic' } }))
    writeCell(getCells(doc, deploy), edgeData('b', 'a1', 'p2', 'k'))
  })
  return { doc, deploy }
}

describe('ImpactPanel', () => {
  let editors: FakeEditor[]
  let shown: [string, string][]
  const editor = () => editors.at(-1)!

  beforeEach(() => {
    editors = [createFakeEditor({ pageId: 'page-1' })]
    shown = []
  })

  function Page({ doc }: { doc: Y.Doc }) {
    const [current, setCurrent] = useState(editors[0]!)
    return (
      <ImpactPanel
        editor={current}
        document={doc}
        onShow={(pageId, cellId) => {
          shown.push([pageId, cellId])
          // The canvas of the other page comes with an editor of its own.
          const next = createFakeEditor({ pageId })
          editors.push(next)
          setCurrent(next)
        }}
      />
    )
  }

  it('lists the dependencies on all pages, changes the depth, and goes on with the analysis on another page', async () => {
    const { doc, deploy } = board()
    render(<Page doc={doc} />)
    expect(screen.queryByRole('complementary')).toBeNull()

    act(() => editor().setState({ impact: { mode: 'dependencies', cellId: 'p1', depth: 1, dependencies: 1, dependents: 0 } }))

    const panel = screen.getByRole('complementary', { name: 'Зависимости' })
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent('Зависимости «Payments»')
    const dependencies = within(panel).getByRole('region', { name: 'Зависит от' })
    expect(dependencies).toHaveTextContent('Зависит от (2)')
    expect(within(dependencies).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Kafkaстр. «Деплой»',
      'Ledgerстр. «Страница 1»',
    ])
    expect(within(panel).getByRole('region', { name: 'Зависят от него' })).toHaveTextContent('Ничего')

    await userEvent.click(within(panel).getByRole('radio', { name: 'Все' }))
    expect(editor().showDependencies).toHaveBeenLastCalledWith('p1', 'all')

    const first = editor()
    await userEvent.click(within(dependencies).getByRole('button', { name: 'стр. «Деплой»' }))
    expect(shown).toEqual([[deploy, 'k']])
    // Payments is on «Деплой» too: the analysis goes on there with its cell.
    expect(editor()).not.toBe(first)
    expect(editor().showDependencies).toHaveBeenCalledWith('p2', 1)
  })

  it('tells the path between two elements, and ends with the cross or Escape', async () => {
    const { doc } = board()
    render(<Page doc={doc} />)
    act(() => editor().setState({ impact: { mode: 'path', from: 'p1', to: 'l1', steps: 1, directed: true } }))

    const panel = screen.getByRole('complementary', { name: 'Путь между' })
    expect(panel).toHaveTextContent('Путь «Payments» → «Ledger»')
    expect(panel).toHaveTextContent('1 шаг')
    act(() => editor().setState({ impact: { mode: 'path', from: 'p1', to: 'l1', steps: null, directed: true } }))
    expect(panel).toHaveTextContent('Пути между ними нет')

    await userEvent.click(within(panel).getByRole('button', { name: 'Закончить анализ' }))
    expect(editor().clearImpact).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(editor().clearImpact).toHaveBeenCalledTimes(2)
    vi.mocked(editor().clearImpact).mockClear()
  })
})
