import ts from 'typescript'
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

const isDictionary = (path: string) => /\/(messages|[^/]*\.messages)\.tsx?$/.test(path) || path.endsWith('.ru.tsx')

/** The texts of a source in Russian: its string literals, templates and text of JSX, not its comments. */
function russianTexts(path: string, source: string): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: string[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node) ||
      ts.isRegularExpressionLiteral(node)
    ) {
      const text = ts.isJsxText(node) ? node.text.trim() : node.text
      if (CYRILLIC.test(text)) found.push(text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
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
