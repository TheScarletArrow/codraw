import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { setLocale } from '../i18n/i18n.ts'
import { renderRoutes } from '../test/render.tsx'
import { HelpPage } from './HelpPage.tsx'
import { searchTopics } from './helpSearch.ts'
import { helpTopics } from './topics.messages.ts'

const routes = (mac = false) => [{ path: '/help', element: <HelpPage mac={mac} /> }]

const topicIds = (sections: typeof helpTopics.sections) => sections.flatMap((section) => section.topics.map((topic) => topic.id))

describe('help', () => {
  it('has the same unique anchors in both languages', () => {
    const ru = topicIds(helpTopics.sections)
    const sections = helpTopics.sections.map((section) => section.id)
    setLocale('en')
    expect(topicIds(helpTopics.sections)).toEqual(ru)
    expect(helpTopics.sections.map((section) => section.id)).toEqual(sections)
    const anchors = [...ru, ...sections, 'shortcuts']
    expect(new Set(anchors).size).toBe(anchors.length)
  })

  it('opens without a session with the contents and the topics of every section', async () => {
    renderRoutes(routes(), '/help')

    expect(await screen.findByRole('heading', { name: 'Справка CoDraw', level: 1 })).toBeInTheDocument()
    const contents = screen.getByRole('navigation', { name: 'Содержание' })
    for (const section of helpTopics.sections) {
      expect(within(contents).getByRole('link', { name: section.title })).toHaveAttribute('href', `#${section.id}`)
      expect(screen.getByRole('heading', { name: section.title, level: 2 })).toBeInTheDocument()
    }
    expect(within(contents).getByRole('link', { name: 'Горячие клавиши' })).toHaveAttribute('href', '#shortcuts')
    expect(screen.getByRole('article', { name: 'Слои страницы' })).toHaveAttribute('id', 'layers')
    expect(screen.getByRole('link', { name: 'Ссылка на тему «Слои страницы»' })).toHaveAttribute('href', '#layers')
  })

  it('leaves the topics that have every word of the query, «ё» as «е»', async () => {
    renderRoutes(routes(), '/help')

    await userEvent.type(await screen.findByRole('searchbox', { name: 'Поиск по справке' }), 'слои')
    expect(screen.getByRole('article', { name: 'Слои страницы' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Карандаш' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Базы данных', level: 2 })).not.toBeInTheDocument()

    expect(searchTopics(helpTopics.sections, 'ТЁМНАЯ тема').flatMap((section) => section.topics.map((topic) => topic.id))).toEqual([
      'language-theme',
    ])
  })

  it('tells when nothing is found', async () => {
    renderRoutes(routes(), '/help')

    await userEvent.type(await screen.findByRole('searchbox', { name: 'Поиск по справке' }), 'квазар')
    expect(screen.getByRole('status')).toHaveTextContent('Ничего не найдено')
    expect(screen.queryByRole('navigation', { name: 'Содержание' })).not.toBeInTheDocument()
  })

  it('scrolls to the topic of the address', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderRoutes(routes(), '/help#layers')

    await screen.findByRole('article', { name: 'Слои страницы' })
    expect(scrollIntoView.mock.contexts[0]).toHaveAttribute('id', 'layers')
    // jsdom has no scrolling of its own.
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  it('lists the shortcuts of the editor in the notation of the system', async () => {
    renderRoutes(routes(), '/help')
    const shortcuts = await screen.findByRole('region', { name: 'Горячие клавиши' })
    const editing = within(shortcuts).getByRole('region', { name: 'Правка' })
    expect(within(editing).getByText('Отменить').nextSibling).toHaveTextContent('Ctrl+Z')
  })

  it('writes the shortcuts of a Mac with its symbols', async () => {
    renderRoutes(routes(true), '/help')
    const shortcuts = await screen.findByRole('region', { name: 'Горячие клавиши' })
    expect(within(shortcuts).getByText('Отменить').nextSibling).toHaveTextContent('⌘Z')
  })

  it('speaks English in the English interface', async () => {
    setLocale('en')
    renderRoutes(routes(), '/help')

    expect(await screen.findByRole('heading', { name: 'CoDraw help', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Page layers' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })
})
