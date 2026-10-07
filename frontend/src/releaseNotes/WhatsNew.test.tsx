import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { openLocalCopy } from '../offline/localCopies.ts'
import { releases } from './releases.ts'
import { WhatsNew } from './WhatsNew.tsx'

const LAST_SEEN_KEY = 'codraw.whats-new.last-seen'
const [newest, previous] = releases

const versionsShown = () =>
  within(screen.getByRole('dialog', { name: 'Что нового' }))
    .getAllByRole('region')
    .map((section) => section.getAttribute('aria-label'))

describe('WhatsNew', () => {
  it('opens by itself with the releases not seen yet after an update', async () => {
    localStorage.setItem(LAST_SEEN_KEY, previous.version)

    render(<WhatsNew />)

    expect(await screen.findByRole('dialog', { name: 'Что нового' })).toBeInTheDocument()
    expect(versionsShown()).toEqual([`Версия ${newest.version}`])
    expect(screen.getByText(`${newest.items[0].title}.`)).toBeInTheDocument()
    expect(localStorage.getItem(LAST_SEEN_KEY)).toBe(newest.version)

    await userEvent.click(screen.getByRole('button', { name: 'Все версии' }))
    expect(versionsShown()).toEqual(releases.map((release) => `Версия ${release.version}`))
  })

  it('stays closed in a browser new to CoDraw and remembers the current version', () => {
    render(<WhatsNew />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(LAST_SEEN_KEY)).toBe(newest.version)
  })

  it('shows the newest release in a browser that used CoDraw before', async () => {
    openLocalCopy('user-1', 'board-1', 'Доска', new Y.Doc())

    render(<WhatsNew />)

    expect(await screen.findByRole('dialog', { name: 'Что нового' })).toBeInTheDocument()
    expect(versionsShown()).toEqual([`Версия ${newest.version}`])
  })

  it('stays closed once the current version was seen and opens with all releases from its button', async () => {
    localStorage.setItem(LAST_SEEN_KEY, newest.version)

    render(<WhatsNew />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Что нового' }))
    expect(versionsShown()).toEqual(releases.map((release) => `Версия ${release.version}`))
    expect(screen.queryByRole('button', { name: 'Все версии' })).not.toBeInTheDocument()
  })
})
