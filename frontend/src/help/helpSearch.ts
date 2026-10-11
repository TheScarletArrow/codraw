import type { ShortcutGroup } from '../diagram/shortcuts.ts'
import type { HelpSection } from './topics.messages.ts'

/** Text as the search compares it: in lower case, with «ё» as «е». */
const normalize = (text: string) => text.toLowerCase().replace(/ё/g, 'е')

/** Each word of the query is in the text. */
function matches(text: string, query: string): boolean {
  const haystack = normalize(text)
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}

/** The sections with the topics whose title or text has every word of the query; all of them for an empty query. */
export function searchTopics(sections: readonly HelpSection[], query: string): HelpSection[] {
  return sections
    .map((section) => ({
      ...section,
      topics: section.topics.filter((topic) => matches([section.title, topic.title, ...topic.paragraphs].join(' '), query)),
    }))
    .filter((section) => section.topics.length > 0)
}

/** The groups of shortcuts with the lines whose action, or the title of the section, has every word of the query. */
export function searchShortcuts(groups: readonly ShortcutGroup[], sectionTitle: string, query: string): ShortcutGroup[] {
  return groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => matches(`${sectionTitle} ${group.title} ${entry.action}`, query)),
    }))
    .filter((group) => group.entries.length > 0)
}
