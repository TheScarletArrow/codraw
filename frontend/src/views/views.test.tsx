import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { writeModelField } from '../diagram/boardModel.ts'
import { DEFAULT_PAGE_ID, ELEMENT_KEY, getCells, getPages, writeCell } from '../diagram/model.ts'
import { createViewPage, hideOnView } from '../diagram/modelViews.ts'
import { ELEMENT_DRAG_TYPE } from '../diagram/sharedElements.ts'
import { boardOf } from '../diagram/testing.ts'
import type { ViewRule } from '../diagram/viewRule.ts'
import { ElementsPanel } from '../elements/ElementsPanel.tsx'
import { createFakeEditor as fakeEditor } from '../test/fakeEditor.ts'
import { ViewBar } from './ViewBar.tsx'
import { ViewRuleDialog } from './ViewRuleDialog.tsx'

const rule = (changes: Partial<ViewRule>): ViewRule => ({ kind: 'landscape', scope: null, environment: null, owners: [], tags: [], technologies: [], ...changes })

/** A shop with an API in its boundary, a database and a person, a payment component, and a node of `prod` with the API. */
function shop() {
  const page = new DiagramBuilder()
  const shopId = page.shape('c4-boundary', 0, 0, { element: { name: 'Магазин', kind: 'c4-system' }, width: 1000, height: 600 })
  const api = page.shape('c4-container', 40, 80, { element: { name: 'API', owner: 'Платежи', tags: ['pci'] }, width: 400, height: 300 })
  const pay = page.shape('c4-component', 60, 140, { element: { name: 'Оплата' } })
  page.shape('c4-database', 600, 80, { element: { name: 'База заказов', owner: 'Склад' } })
  const buyer = page.shape('c4-person', -600, 0, { element: { name: 'Покупатель' } })
  page.edge(buyer, api, { value: 'Покупает' })
  const node = page.shape('c4-deployment-node', 0, 1000, { element: { name: 'k8s' }, width: 800, height: 400 })
  const cells = page.build()
  const element = (id: string) => cells.find((cell) => cell.id === id)!.style[ELEMENT_KEY] as string
  const deployed = { ...cells.find((cell) => cell.id === api)!, id: 'api-on-k8s', geometry: { x: 40, y: 1080, width: 240, height: 120 } }
  const { doc, pages } = boardOf({ Магазин: new DiagramBuilder() })
  doc.transact(() => [...cells, deployed].forEach((cell) => writeCell(getCells(doc, pages.Магазин!), cell)))
  doc.transact(() => {
    writeModelField(doc, element(node), 'environment', 'prod')
    writeModelField(doc, element(pay), 'parent', element(api))
  })
  return { doc, ids: { shop: element(shopId), api: element(api), pay: element(pay), buyer: element(buyer), node: element(node) } }
}

describe('the window of the rule of a view', () => {
  let doc: Y.Doc
  let ids: ReturnType<typeof shop>['ids']
  beforeEach(() => {
    document.body.innerHTML = ''
    ;({ doc, ids } = shop())
  })

  it('creates the containers of the first system by default, named by it', async () => {
    const onCreate = vi.fn()
    const onClose = vi.fn()
    render(<ViewRuleDialog document={doc} onCreate={onCreate} onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: 'Новое представление' })
    expect(within(dialog).getByLabelText('Что показать')).toHaveValue('containers')
    expect(within(dialog).getByLabelText('Система')).toHaveValue(ids.shop)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Создать' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'containers', scope: ids.shop }), 'Магазин: контейнеры')
    expect(onClose).toHaveBeenCalled()
  })

  it('offers containers to components, environments to deployment and the values of the model to the slice', async () => {
    const onCreate = vi.fn()
    render(<ViewRuleDialog document={doc} onCreate={onCreate} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    await userEvent.selectOptions(within(dialog).getByLabelText('Что показать'), 'components')
    const containers = within(within(dialog).getByLabelText('Контейнер')).getAllByRole('option')
    expect(containers.map((option) => option.textContent)).toEqual(['База заказов', 'API'])
    expect(containers.map((option) => option.getAttribute('value'))).toContain(ids.api)
    await userEvent.selectOptions(within(dialog).getByLabelText('Что показать'), 'deployment')
    expect(within(dialog).getByLabelText('Окружение')).toHaveValue('prod')
    const teams = within(dialog).getByRole('group', { name: 'Команды' })
    await userEvent.click(within(teams).getByRole('checkbox', { name: 'Платежи' }))
    expect(within(within(dialog).getByRole('group', { name: 'Теги' })).getByRole('checkbox', { name: 'pci' })).not.toBeChecked()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Создать' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'deployment', environment: 'prod', owners: ['Платежи'] }), 'Развёртывание: prod')
  })

  it('changes the rule of a view, and makes it a page of its own', async () => {
    const onApply = vi.fn()
    const onDetach = vi.fn()
    render(<ViewRuleDialog document={doc} rule={rule({ kind: 'landscape' })} onApply={onApply} onDetach={onDetach} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Правило представления' })
    await userEvent.click(within(within(dialog).getByRole('group', { name: 'Теги' })).getByRole('checkbox', { name: 'pci' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Применить' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ kind: 'landscape', tags: ['pci'] }))
    render(<ViewRuleDialog document={doc} rule={rule({ kind: 'landscape' })} onApply={onApply} onDetach={onDetach} onClose={() => {}} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Сделать обычной страницей' }).at(-1)!)
    expect(onDetach).toHaveBeenCalled()
  })

  it('closes by Escape', async () => {
    const onClose = vi.fn()
    render(<ViewRuleDialog document={doc} onCreate={() => {}} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('the bar of a view', () => {
  it('tells the rule and the slice, shows what is hidden again, opens the rule and lays out the page', async () => {
    document.body.innerHTML = ''
    const { doc, ids } = shop()
    const view = createViewPage(doc, DEFAULT_PAGE_ID, rule({ kind: 'containers', scope: ids.shop, owners: ['Платежи'] }), 'Вид')
    doc.transact(() => hideOnView(doc, view, [`${ids.shop}~${ids.api}`]))
    const editor = fakeEditor({ pageId: view })
    const onEditRule = vi.fn()
    render(<ViewBar document={doc} pageId={view} editor={editor} readOnly={false} onEditRule={onEditRule} />)
    const bar = screen.getByRole('region', { name: 'Представление' })
    expect(bar).toHaveTextContent('Представление: Контейнеры системы Магазин · Команды: Платежи')
    await userEvent.click(within(bar).getByRole('button', { name: /Скрыто: 1/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Показать API' }))
    expect(editor.showOnView).toHaveBeenCalledWith([`${ids.shop}~${ids.api}`])
    await userEvent.click(within(bar).getByRole('button', { name: /Правило/ }))
    expect(onEditRule).toHaveBeenCalled()
    await userEvent.click(within(bar).getByRole('button', { name: /Разложить/ }))
    expect(editor.autoLayout).toHaveBeenCalledWith('right')
  })

  it('shows only the rule to a viewer, and nothing on a page that is no view', () => {
    document.body.innerHTML = ''
    const { doc } = shop()
    const view = createViewPage(doc, DEFAULT_PAGE_ID, rule({ kind: 'landscape' }), 'Ландшафт')
    const { rerender } = render(<ViewBar document={doc} pageId={view} editor={fakeEditor({ pageId: view })} readOnly onEditRule={() => {}} />)
    expect(screen.getByRole('region', { name: 'Представление' })).toHaveTextContent('Представление: Ландшафт')
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<ViewBar document={doc} pageId={DEFAULT_PAGE_ID} editor={null} readOnly onEditRule={() => {}} />)
    expect(screen.queryByRole('region', { name: 'Представление' })).toBeNull()
    expect(getPages(doc).size).toBe(2)
  })
})

describe('the model in the panel of elements', () => {
  it('shows the tree of the model and the deployment, finds an element with those above it, and drags it', async () => {
    document.body.innerHTML = ''
    const { doc, ids } = shop()
    const onShow = vi.fn()
    render(<ElementsPanel document={doc} canPlace onShow={onShow} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Модель' }))
    const people = screen.getByRole('tree', { name: 'Люди и системы' })
    const shopItem = within(people).getByRole('treeitem', { name: 'Магазин' })
    const apiItem = within(shopItem).getByRole('treeitem', { name: 'API' })
    expect(within(apiItem).getByRole('treeitem', { name: 'Оплата' })).toBeInTheDocument()
    const deployment = screen.getByRole('tree', { name: 'Развёртывание: prod' })
    expect(within(within(deployment).getByRole('treeitem', { name: 'k8s' })).getByRole('treeitem', { name: 'API' })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Поиск элементов'), 'оплата')
    expect(within(screen.getByRole('tree', { name: 'Люди и системы' })).queryByRole('treeitem', { name: 'База заказов' })).toBeNull()
    const found = within(screen.getByRole('tree', { name: 'Люди и системы' })).getByRole('treeitem', { name: 'Оплата' })
    await userEvent.click(within(found).getByRole('button', { name: /^Оплата/ }))
    expect(onShow).toHaveBeenCalledWith(DEFAULT_PAGE_ID, expect.any(String))

    const data = new Map<string, string>()
    const button = within(found).getByRole('button', { name: /^Оплата/ })
    act(() => {
      button.dispatchEvent(
        Object.assign(new Event('dragstart', { bubbles: true }), {
          dataTransfer: { setData: (type: string, value: string) => data.set(type, value), effectAllowed: '' },
        }),
      )
    })
    expect(JSON.parse(data.get(ELEMENT_DRAG_TYPE)!)).toEqual({ elementId: ids.pay })
  })
})
