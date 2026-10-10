import { CellEditorHandler } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { parseDrawio } from '../drawio/parse.ts'
import { exportDrawio } from '../drawio/serialize.ts'
import { continueList, formatList, listKind } from './lists.ts'
import { initializeDocument } from './model.ts'
import { connect } from './testing.ts'

describe('editable tables and lists', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))
  function open(doc = new Y.Doc(), readOnly = false) {
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly })
    editors.push(editor)
    return { doc, editor }
  }

  it('fills individual grid cells and synchronizes their text with another editor', () => {
    const alice = open()
    const bob = open()
    connect(alice.doc, bob.doc)
    const table = alice.editor.addShape('grid-table', { x: 200, y: 200 })!
    expect(table.getChildCount()).toBe(12)
    const cell = table.getChildAt(5)
    alice.editor.graph.startEditingAtCell(cell)
    alice.editor.graph.getPlugin<CellEditorHandler>('CellEditorHandler')!.textarea!.textContent = 'Значение'
    alice.editor.graph.stopEditing(false)
    expect(cell.getValue()).toBe('Значение')
    expect(bob.editor.graph.getDataModel().getCell(cell.getId()!)!.getValue()).toBe('Значение')
    expect(table.getChildAt(4).getValue()).toBe('')
  })

  it('resizes the cells with their table', () => {
    const { editor } = open()
    const table = editor.addShape('grid-table')!
    const geometry = table.getGeometry()!.clone()
    geometry.width = 480
    geometry.height = 300
    editor.graph.resizeCell(table, geometry)
    expect(table.getChildAt(5).getGeometry()).toMatchObject({ x: 320, y: 75, width: 160, height: 75 })
  })

  it('makes an old grid editable without losing its label', () => {
    const { editor } = open()
    const table = editor.graph.insertVertex({ value: 'Старая таблица', position: [0, 0], size: [240, 150], style: { shape: 'codraw.gridTable' } })
    editor.graph.startEditingAtCell(table)
    expect(table.getChildCount()).toBe(12)
    expect(table.getChildAt(0).getValue()).toBe('Старая таблица')
    expect(editor.getEditing()?.cellId).toBe(table.getChildAt(0).getId())
  })

  it('continues bullets and numbering at the caret, and leaves an empty item', () => {
    expect(continueList('• Один', 6)).toEqual({ text: '• Один\n• ', caret: 9 })
    expect(continueList('9. Девять', 9)).toEqual({ text: '9. Девять\n10. ', caret: 14 })
    expect(continueList('• Один\n• ', 9)).toEqual({ text: '• Один\n', caret: 7 })
    expect(continueList('• Первый второй', 8)).toEqual({ text: '• Первый\n•  второй', caret: 11 })
    expect(continueList('Обычный текст', 13)).toBeNull()
  })

  it('renumbers the numbered items of the same level after an inserted one, up to the end of the list', () => {
    expect(continueList('1. Один\n2. Два\n3. Три\nИтог', 7)).toEqual({ text: '1. Один\n2. \n3. Два\n4. Три\nИтог', caret: 11 })
    expect(continueList('1) Один\n  1) Вложенный\n2) Два', 7)?.text).toBe('1) Один\n2) \n  1) Вложенный\n3) Два')
    expect(continueList('• Один\n• Два', 6)?.text).toBe('• Один\n• \n• Два')
  })

  it('adds the next marker when Enter is pressed in the label editor', () => {
    const { editor } = open()
    const list = editor.addShape('list')!
    editor.graph.startEditingAtCell(list)
    const textarea = editor.graph.getPlugin<CellEditorHandler>('CellEditorHandler')!.textarea!
    expect(textarea.style.whiteSpace).toBe('pre-wrap')
    textarea.textContent = '• Один'
    const range = document.createRange()
    range.selectNodeContents(textarea)
    range.collapse(false)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }))
    expect(textarea.innerHTML).toBe('• Один<br>• ')
    editor.graph.stopEditing(false)
    expect(list.getValue()).toBe('• Один\n• ')
  })

  it('continues a numbered list twice and leaves it with Enter on an empty item, as a browser shows the text', () => {
    const { editor } = open()
    const list = editor.addShape('numbered-list')!
    editor.graph.startEditingAtCell(list)
    const textarea = editor.graph.getPlugin<CellEditorHandler>('CellEditorHandler')!.textarea!
    const enter = () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }))
    }
    const range = document.createRange()
    range.selectNodeContents(textarea)
    range.collapse(false)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    enter()
    expect(textarea.innerHTML).toBe('1. Элемент<br>2. Элемент<br>3. Элемент<br>4. ')
    window.getSelection()!.getRangeAt(0).insertNode(document.createTextNode('Четвёртый'))
    window.getSelection()!.collapseToEnd()
    enter()
    expect(textarea.innerHTML).toBe('1. Элемент<br>2. Элемент<br>3. Элемент<br>4. Четвёртый<br>5. ')
    enter()
    // The empty last line is a block of its own, as the label editor of maxGraph writes it, and the caret is in it.
    expect(textarea.innerHTML).toBe('1. Элемент<br>2. Элемент<br>3. Элемент<br>4. Четвёртый<div><br></div>')
    expect(window.getSelection()!.getRangeAt(0).startContainer).toBe(textarea.lastChild)
    editor.graph.stopEditing(false)
    expect(list.getValue()).toBe('1. Элемент\n2. Элемент\n3. Элемент\n4. Четвёртый\n')
  })

  it('puts the caret back where Enter was pressed once the browser undoes the continuation', () => {
    const { editor } = open()
    const list = editor.addShape('list')!
    editor.graph.startEditingAtCell(list)
    const textarea = editor.graph.getPlugin<CellEditorHandler>('CellEditorHandler')!.textarea!
    textarea.textContent = '• Один'
    window.getSelection()!.selectAllChildren(textarea)
    window.getSelection()!.collapseToEnd()
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }))
    // The browser restores the text and selects all of it, as the continuation replaced it.
    textarea.textContent = '• Один'
    window.getSelection()!.selectAllChildren(textarea)
    textarea.dispatchEvent(new InputEvent('input', { inputType: 'historyUndo', bubbles: true }))
    const selection = window.getSelection()!
    expect(selection.isCollapsed).toBe(true)
    expect(selection.anchorNode).toBe(textarea.firstChild)
    expect(selection.anchorOffset).toBe(6)
  })

  it('keeps the text of grid cells and lists in the document: a board opened again and a .drawio file show it', async () => {
    const { doc, editor } = open()
    const table = editor.addShape('grid-table')!
    editor.graph.cellLabelChanged(table.getChildAt(4), 'Заказы', false)
    const list = editor.addShape('numbered-list')!
    editor.graph.cellLabelChanged(list, '1. Один\n2. Два', false)
    const reopened = new Y.Doc()
    Y.applyUpdate(reopened, Y.encodeStateAsUpdate(doc))
    const again = open(reopened).editor
    const model = again.graph.getDataModel()
    expect(model.getCell(table.getId()!)!.getChildAt(4).getValue()).toBe('Заказы')
    expect(model.getCell(list.getId()!)!.getValue()).toBe('1. Один\n2. Два')

    const [page] = await parseDrawio(exportDrawio(doc))
    const cells = page!.cells
    expect(cells.find((cell) => cell.parent === table.getId() && cell.value === 'Заказы')).toBeDefined()
    expect(cells.filter((cell) => cell.parent === table.getId())).toHaveLength(12)
    expect(cells.find((cell) => cell.id === list.getId())).toMatchObject({ value: '1. Один\n2. Два' })
  })

  it('converts lists, reports the selected mode and undoes the conversion', () => {
    const { editor } = open()
    const list = editor.addShape('list')!
    editor.setList('numbered')
    expect(list.getValue()).toBe('1. Элемент\n2. Элемент\n3. Элемент')
    expect(editor.getState().text?.list).toBe('numbered')
    editor.setList(null)
    expect(list.getValue()).toBe('Элемент\nЭлемент\nЭлемент')
    editor.undo()
    expect(list.getValue()).toBe('1. Элемент\n2. Элемент\n3. Элемент')
  })

  it('recognizes a typed list and refuses to change a read-only table or list', () => {
    const { doc, editor } = open()
    const text = editor.addShape('text')!
    editor.graph.cellLabelChanged(text, '- Один\n- Два', false)
    expect(text.getStyle()).toMatchObject({ codrawShape: 'list' })
    const table = editor.addShape('grid-table')!
    const viewer = open(doc, true).editor
    viewer.graph.setSelectionCell(viewer.graph.getDataModel().getCell(text.getId()!)!)
    viewer.setList('numbered')
    expect(text.getValue()).toBe('- Один\n- Два')
    viewer.graph.startEditingAtCell(viewer.graph.getDataModel().getCell(table.getChildAt(0).getId()!)!)
    expect(viewer.getEditing()).toBeNull()
  })

  it('formats both list types without duplicating markers', () => {
    expect(formatList('• Один\n• Два', 'numbered')).toBe('1. Один\n2. Два')
    expect(formatList('1. Один\n2. Два', 'bullet')).toBe('• Один\n• Два')
    expect(listKind('1. Один\n2. Два')).toBe('numbered')
  })
})
