import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { issueLink } from '../test/issueLinks.ts'
import { IssueBadges } from './IssueBadges.tsx'

describe('IssueBadges', () => {
  it('shows the issues of each element of the page under its bottom-left corner, green while any is open', () => {
    const editor = createFakeEditor()
    editor.placeCell('api', { x: 100, y: 50, width: 120, height: 60 })
    editor.placeCell('db', { x: 300, y: 50, width: 80, height: 80 })
    render(
      <IssueBadges
        editor={editor}
        links={[
          issueLink(),
          issueLink({ id: 'link-2', number: 13, state: 'closed', stateReason: 'completed' }),
          issueLink({ id: 'link-3', cellId: 'db', state: 'closed', stateReason: 'completed' }),
          issueLink({ id: 'link-4', pageId: 'page-2', cellId: 'other' }),
          issueLink({ id: 'link-5', pageId: null, cellId: null, threadId: 'thread-1' }),
        ]}
        onOpen={vi.fn()}
      />,
    )

    const [api, db] = screen.getAllByTestId('issue-badge')
    expect(screen.getAllByTestId('issue-badge')).toHaveLength(2)
    expect(api).toHaveTextContent('2')
    expect(api).toHaveAccessibleName('Задачи элемента: 2, открытых: 1')
    expect(api).toHaveClass('bg-emerald-600')
    expect(db).toHaveClass('bg-violet-600')
    expect([api!.style.left, api!.style.top]).toEqual(['100px', '114px'])

    act(() => editor.scrollTo({ x: 20, y: 10 }))
    expect([api!.style.left, api!.style.top]).toEqual(['80px', '104px'])
  })

  it('opens the issues of the element', async () => {
    const editor = createFakeEditor()
    editor.placeCell('api', { x: 100, y: 50, width: 120, height: 60 })
    const onOpen = vi.fn()
    render(<IssueBadges editor={editor} links={[issueLink()]} onOpen={onOpen} />)

    await userEvent.click(screen.getByTestId('issue-badge'))
    expect(onOpen).toHaveBeenCalledWith('api')
  })
})
