import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { ALLOWED_RUSSIAN } from './allowedRussian.ts'

/**
 * The sources of the app, without the tests. Russian texts live in the dictionaries (`messages.ts`, `*.messages.ts`)
 * and in the Russian versions of long pages (`*.ru.tsx`), whose English versions are `*.en.tsx`.
 */
const sources = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/test/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const CYRILLIC = /[А-Яа-яЁё]/

const isDictionary = (path: string) =>
  /\/(messages|[^/]*\.messages)\.tsx?$/.test(path) || path.endsWith('.ru.tsx') || path.endsWith('/i18n/allowedRussian.ts')

/** The text of a string literal, a part of a template, a text of JSX or a regular expression; `null` for other nodes. */
function textOf(node: { type: string; [key: string]: unknown }): string | null {
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? node.value : node.regex ? (node.raw as string) : null
    case 'TemplateElement': {
      const value = node.value as { cooked: string | null; raw: string }
      return value.cooked ?? value.raw
    }
    case 'JSXText':
      return (node.raw as string).trim()
    default:
      return null
  }
}

/** The texts of a source in Russian: its string literals, templates and text of JSX, not its comments. */
function russianTexts(path: string, source: string): string[] {
  const { program, errors } = parseSync(path, source)
  if (errors.length > 0) throw new Error(`${path}: ${errors[0].message}`)
  const found: string[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (value === null || typeof value !== 'object') return
    const node = value as { type?: unknown; [key: string]: unknown }
    if (typeof node.type === 'string') {
      const text = textOf(node as { type: string })
      if (text !== null && CYRILLIC.test(text)) found.push(text)
    }
    for (const key in node) if (key !== 'parent') visit(node[key])
  }
  visit(program)
  return found
}

describe('texts of the interface', () => {
  it('are found', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100)
  })

  it('come from the dictionaries, not from the code', () => {
    const problems = Object.entries(sources)
      .filter(([path]) => !isDictionary(path))
      .flatMap(([path, source]) => {
        const allowed = ALLOWED_RUSSIAN[path.replace(/^\/src\//, '')] ?? []
        if (allowed === 'all') return []
        return russianTexts(path, source)
          .filter((text) => !allowed.includes(text))
          .map((text) => `${path}: «${text}»`)
      })
    expect(problems).toEqual([])
  })

  it('of long pages come in both languages', () => {
    const paths = Object.keys(sources)
    const missing = paths
      .filter((path) => path.endsWith('.ru.tsx'))
      .map((path) => path.replace(/\.ru\.tsx$/, '.en.tsx'))
      .filter((path) => !paths.includes(path))
    expect(missing).toEqual([])
  })
})
