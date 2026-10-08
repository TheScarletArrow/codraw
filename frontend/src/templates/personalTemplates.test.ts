import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { ELEMENT_KEY, getCells, writeCell, writePage } from '../diagram/model.ts'
import { boardWith, edgeData, shapeData } from '../diagram/testing.ts'
import { LINK_KEY, pageLink } from '../diagram/links.ts'
import { personalTemplatePages, templateSnapshot } from './personalTemplates.ts'

afterEach(() => vi.unstubAllGlobals())

describe('Личные шаблоны', () => {
  it('copies all pages and shared identities independently on every use without editing the source', async () => {
    const doc = boardWith(shapeData('api', 'a1', { value: 'API', style: { [ELEMENT_KEY]: 'shared', [LINK_KEY]: pageLink('second') } }))
    writePage(doc, 'second', { name: 'Подробности', order: 'a2' })
    writeCell(getCells(doc, 'second'), shapeData('copy', 'a1', { value: 'API', style: { [ELEMENT_KEY]: 'shared' } }))
    getCells(doc).get('api')!.set('status', 'approved')
    const before = Y.encodeStateAsUpdate(doc)
    const xml = await templateSnapshot(doc)
    const first = await personalTemplatePages(xml)
    const second = await personalTemplatePages(xml)
    expect(first.map((page) => page.name)).toEqual(['Страница 1', 'Подробности'])
    expect(first[0]!.cells[0]!.style[ELEMENT_KEY]).toBe(first[1]!.cells[0]!.style[ELEMENT_KEY])
    expect(first[0]!.cells[0]!.style[ELEMENT_KEY]).not.toBe('shared')
    expect(first[0]!.cells[0]!.id).not.toBe(second[0]!.cells[0]!.id)
    expect(first[0]!.id).not.toBe(second[0]!.id)
    expect(first[0]!.cells[0]!.style[LINK_KEY]).toBe(pageLink(first[1]!.id!))
    expect(xml).not.toContain('approved')
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before)
  })

  it('keeps a selected fragment with internal edges labels and absolute coordinates', async () => {
    const doc = boardWith(
      shapeData('group', 'a1', { geometry: { x: 100, y: 200, width: 300, height: 300 } }),
      shapeData('a', 'a2', { parent: 'group', geometry: { x: 20, y: 30, width: 100, height: 50 } }),
      shapeData('b', 'a3'), shapeData('excluded', 'a4'), edgeData('ab', 'a5', 'a', 'b', { parent: 'group', geometry: { x: 0, y: 0, width: 0, height: 0, relative: true, points: [{ x: 2, y: 3 }] } }),
      shapeData('label', 'a6', { parent: 'ab', value: 'HTTP' }),
    )
    const [page] = await personalTemplatePages(await templateSnapshot(doc, { pageId: 'page-1', ids: ['a', 'b'] }))
    expect(page!.cells).toHaveLength(4)
    const [a, b, edge, label] = page!.cells
    expect(a!.geometry).toMatchObject({ x: 120, y: 230 })
    expect(edge).toMatchObject({ source: a!.id, target: b!.id })
    expect(edge!.geometry!.points).toEqual([{ x: 102, y: 203 }])
    expect(label).toMatchObject({ parent: edge!.id, value: 'HTTP' })
  })

  it('embeds board images and refuses a broken portable copy', async () => {
    const uri = '/api/boards/0199a000-0000-7000-8000-000000000001/images/0199a000-0000-7000-8000-000000000002'
    const doc = boardWith(shapeData('image', 'a1', { style: { shape: 'image', image: uri } }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } })))
    const [page] = await personalTemplatePages(await templateSnapshot(doc))
    expect(page!.cells[0]!.style.image).toBe('data:image/png;base64,AQID')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    await expect(templateSnapshot(doc)).rejects.toThrow('Не удалось скопировать изображение')
  })
})
