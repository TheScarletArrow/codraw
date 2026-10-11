import { Link as LinkIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { formatKeys, shortcutGroups } from '../diagram/shortcuts.ts'
import { searchShortcuts, searchTopics } from './helpSearch.ts'
import { helpMessages as m } from './messages.ts'
import { helpTopics } from './topics.messages.ts'

/** The anchor of the section of the keyboard shortcuts, after the sections of the topics. */
const SHORTCUTS_ID = 'shortcuts'

/** macOS and iOS write the modifiers of shortcuts as symbols; the editor itself is not loaded here. */
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * «Справка»: every feature of CoDraw by sections, in the language of the interface, with a search, contents and a link to
 * each topic (`/help#layers`). Open without a session, like the legal pages: it is read before signing in too.
 */
export function HelpPage({ mac = isMac() }: { mac?: boolean }) {
  const { hash } = useLocation()
  const [query, setQuery] = useState('')
  const sections = useMemo(() => searchTopics(helpTopics.sections, query), [query])
  const shortcuts = useMemo(() => searchShortcuts(shortcutGroups(false), m.shortcuts, query), [query])
  const nothingFound = sections.length === 0 && shortcuts.length === 0

  // The page is drawn by the script, after the browser has looked for the anchor of the address.
  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView?.()
  }, [hash])

  return (
    <div className="min-h-dvh">
      <header className="flex h-12 items-center border-b px-4">
        <Link to="/" className="font-bold">
          CoDraw
        </Link>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-3xl font-semibold">{m.title}</h1>
        <p className="mt-2 text-muted-foreground">{m.intro}</p>
        <input
          type="search"
          aria-label={m.search}
          placeholder={m.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-6 h-9 w-full max-w-md rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {nothingFound ? (
          <p role="status" className="mt-6 text-muted-foreground">
            {m.nothingFound}
          </p>
        ) : (
          <div className="mt-6 gap-10 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
            <nav aria-label={m.contents} className="mb-8 text-sm lg:sticky lg:top-4 lg:mb-0 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto">
              <h2 className="mb-2 font-semibold">{m.contents}</h2>
              <ul className="flex flex-col gap-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="hover:underline">
                      {section.title}
                    </a>
                  </li>
                ))}
                {shortcuts.length > 0 && (
                  <li>
                    <a href={`#${SHORTCUTS_ID}`} className="hover:underline">
                      {m.shortcuts}
                    </a>
                  </li>
                )}
              </ul>
            </nav>
            <div className="flex flex-col gap-10">
              {sections.map((section) => (
                <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-4">
                  <h2 id={`${section.id}-title`} className="text-2xl font-semibold">
                    {section.title}
                  </h2>
                  <div className="mt-4 flex flex-col gap-6">
                    {section.topics.map((topic) => (
                      <article
                        key={topic.id}
                        id={topic.id}
                        aria-labelledby={`${topic.id}-title`}
                        className="scroll-mt-4 leading-relaxed"
                      >
                        <h3 className="group flex items-center gap-2 text-lg font-medium">
                          <span id={`${topic.id}-title`}>{topic.title}</span>
                          <a
                            href={`#${topic.id}`}
                            aria-label={m.topicLink(topic.title)}
                            title={m.topicLink(topic.title)}
                            className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <LinkIcon className="size-4" />
                          </a>
                        </h3>
                        {topic.paragraphs.map((paragraph) => (
                          <p key={paragraph} className="mt-2">
                            {paragraph}
                          </p>
                        ))}
                      </article>
                    ))}
                  </div>
                </section>
              ))}
              {shortcuts.length > 0 && (
                <section id={SHORTCUTS_ID} aria-labelledby={`${SHORTCUTS_ID}-title`} className="scroll-mt-4">
                  <h2 id={`${SHORTCUTS_ID}-title`} className="text-2xl font-semibold">
                    {m.shortcuts}
                  </h2>
                  <p className="mt-2 text-muted-foreground">{m.shortcutsIntro}</p>
                  {shortcuts.map((group) => (
                    <section key={group.title} aria-label={group.title} className="mt-4">
                      <h3 className="mb-1 text-sm font-medium tracking-wide text-muted-foreground uppercase">{group.title}</h3>
                      <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1">
                        {group.entries.map((entry) => (
                          <div key={entry.action} className="contents">
                            <dt>{entry.action}</dt>
                            <dd className="flex flex-wrap items-start justify-end gap-1">
                              {[...new Set(entry.keys.map((keys) => formatKeys(keys, mac)))].map((keys) => (
                                <kbd key={keys} className="rounded border bg-muted px-1.5 font-mono text-xs whitespace-nowrap">
                                  {keys}
                                </kbd>
                              ))}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))}
                </section>
              )}
            </div>
          </div>
        )}
        <nav aria-label={m.documents} className="mt-10 flex flex-wrap gap-4 border-t pt-4 text-sm">
          <Link to="/terms" className="underline">
            {m.terms}
          </Link>
          <Link to="/privacy" className="underline">
            {m.privacy}
          </Link>
          <Link to="/" className="underline">
            {m.backToApp}
          </Link>
        </nav>
      </main>
    </div>
  )
}
