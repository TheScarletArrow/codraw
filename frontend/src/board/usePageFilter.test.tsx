import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { NO_FILTER, type PageFilter } from '../diagram/pageFilter.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { usePageFilter } from './usePageFilter.ts'

describe('usePageFilter', () => {
  it('reads the filter of the address into the editor and writes a new one back, keeping the page', async () => {
    const editor = createFakeEditor()
    let change: (filter: PageFilter) => void = () => {}
    let seen: PageFilter | null = null
    function Page() {
      const { filter, changeFilter } = usePageFilter(editor)
      useEffect(() => {
        change = changeFilter
        seen = filter
      })
      return null
    }
    const router = createMemoryRouter([{ path: '/boards/:id', Component: Page }], {
      initialEntries: ['/boards/b1?page=p2&owner=%D0%9F%D0%BB%D0%B0%D1%82%D0%B5%D0%B6%D0%B8&hide=1'],
    })
    render(<RouterProvider router={router} />)

    expect(seen).toEqual({ ...NO_FILTER, owners: ['Платежи'], hide: true })
    expect(editor.setFilter).toHaveBeenLastCalledWith({ ...NO_FILTER, owners: ['Платежи'], hide: true })

    await act(async () => change({ ...NO_FILTER, tags: ['pci', 'core'] }))
    const params = new URLSearchParams(router.state.location.search)
    expect(params.get('page')).toBe('p2')
    expect(params.getAll('tag')).toEqual(['pci', 'core'])
    expect(params.has('owner')).toBe(false)
    expect(editor.setFilter).toHaveBeenLastCalledWith({ ...NO_FILTER, tags: ['pci', 'core'] })

    // A filter that chooses nothing shows the page as it is.
    await act(async () => change(NO_FILTER))
    expect(router.state.location.search).toBe('?page=p2')
    expect(editor.setFilter).toHaveBeenLastCalledWith(null)
  })

  it('shows a choice at once, while the router is still changing the address, and follows the address after', async () => {
    const editor = createFakeEditor()
    let change: (filter: PageFilter) => void = () => {}
    const seen: PageFilter[] = []
    function Page() {
      const { filter, changeFilter } = usePageFilter(editor)
      useEffect(() => {
        change = changeFilter
        seen.push(filter)
      })
      return null
    }
    // The first load opens the board; the next ones wait to be released, as a slow router would.
    let loads = 0
    let release = () => {}
    const loader = () => (loads++ === 0 ? null : new Promise<null>((resolve) => (release = () => resolve(null))))
    const router = createMemoryRouter([{ path: '/boards/:id', Component: Page, loader }], { initialEntries: ['/boards/b1?page=p2'] })
    render(<RouterProvider router={router} />)
    await act(async () => {})
    expect(seen.at(-1)).toEqual(NO_FILTER)

    await act(async () => change({ ...NO_FILTER, owners: ['Склад'] }))
    expect(router.state.location.search).toBe('?page=p2')
    const chosen = seen.at(-1)
    expect(chosen).toEqual({ ...NO_FILTER, owners: ['Склад'] })
    expect(editor.setFilter).toHaveBeenLastCalledWith(chosen)
    const calls = vi.mocked(editor.setFilter).mock.calls.length

    // The address gets the choice: the filter stays the same object, and the editor is not told again.
    await act(async () => release())
    expect(new URLSearchParams(router.state.location.search).getAll('owner')).toEqual(['Склад'])
    expect(seen.at(-1)).toBe(chosen)
    expect(editor.setFilter).toHaveBeenCalledTimes(calls)

    // Another address, e.g. a link, has a filter of its own.
    await act(async () => void router.navigate('/boards/b1?page=p2&tag=pci'))
    await act(async () => release())
    expect(seen.at(-1)).toEqual({ ...NO_FILTER, tags: ['pci'] })
  })
})
