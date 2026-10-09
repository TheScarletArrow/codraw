import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { PlanView } from '../diagram/plan.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { usePlanView } from './usePlanView.ts'

describe('usePlanView', () => {
  it('shows the view of the address in the editor and writes a new one back, keeping the page', async () => {
    const editor = createFakeEditor()
    let change: (view: PlanView) => void = () => {}
    let seen: PlanView | null = null
    function Page() {
      const { view, changeView } = usePlanView(editor)
      useEffect(() => {
        change = changeView
        seen = view
      })
      return null
    }
    const router = createMemoryRouter([{ path: '/boards/:id', Component: Page }], { initialEntries: ['/boards/b1?page=p2&view=current'] })
    render(<RouterProvider router={router} />)
    expect(seen).toBe('current')
    expect(editor.setPlanView).toHaveBeenLastCalledWith('current')

    await act(async () => change('target'))
    expect(router.state.location.search).toBe('?page=p2&view=target')
    expect(editor.setPlanView).toHaveBeenLastCalledWith('target')

    await act(async () => change('diff'))
    expect(router.state.location.search).toBe('?page=p2')
    expect(seen).toBe('diff')
  })
})
