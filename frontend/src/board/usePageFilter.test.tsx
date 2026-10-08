import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
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
})
