import { afterEach, describe, expect, it, vi } from 'vitest'
import { LayerViews, layerViewsKey } from './layerViews.ts'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('own choices about layers', () => {
  it('keeps the own visibility of each layer of each page', () => {
    const views = new LayerViews()
    views.page('p1').setVisibility('notes', false)
    views.page('p2').setVisibility('notes', true)

    expect(views.page('p1').visibility('notes')).toBe(false)
    expect(views.page('p2').visibility('notes')).toBe(true)
    expect(views.page('p1').visibility('infra')).toBeUndefined()
    views.page('p1').setVisibility('notes', undefined)
    expect(views.page('p1').visibility('notes')).toBeUndefined()
  })

  it('remembers the visibility in the browser for the board, but not the active layer', () => {
    const first = new LayerViews(layerViewsKey('u1', 'b1'))
    first.page('p1').setVisibility('notes', false)
    first.page('p1').setActive('infra')

    const next = new LayerViews(layerViewsKey('u1', 'b1'))
    expect(next.page('p1').visibility('notes')).toBe(false)
    expect(next.page('p1').active()).toBeNull()
    expect(new LayerViews(layerViewsKey('u1', 'b2')).page('p1').visibility('notes')).toBeUndefined()
  })

  it('forgets the board in the browser once every layer follows the visibility for everybody', () => {
    const views = new LayerViews(layerViewsKey('u1', 'b1'))
    views.page('p1').setVisibility('notes', false)
    views.page('p1').setVisibility('notes', undefined)

    expect(window.localStorage.getItem(layerViewsKey('u1', 'b1'))).toBeNull()
  })

  it('works for the visit when the browser keeps nothing or keeps something else', () => {
    window.localStorage.setItem(layerViewsKey('u1', 'b1'), '{"p1":{"notes":"yes"},"p2":[]}')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const views = new LayerViews(layerViewsKey('u1', 'b1'))

    expect(views.page('p1').visibility('notes')).toBeUndefined()
    views.page('p1').setVisibility('notes', false)
    expect(views.page('p1').visibility('notes')).toBe(false)
  })
})
