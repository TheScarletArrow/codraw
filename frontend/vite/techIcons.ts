import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

/** The catalog of the logos of technologies: their slugs, titles, colors and other names, without their paths. */
export const CATALOG_ID = 'virtual:tech-icons'
/** The paths of the logos whose slugs start with a letter, e.g. `virtual:tech-icons/paths/k`; digits are `0`. */
export const PATHS_ID = 'virtual:tech-icons/paths/'

/** The group of the paths of a logo: the first letter of its slug, `0` for a digit. */
export const groupOf = (slug: string) => (/^[a-z]/.test(slug) ? slug[0]! : '0')

/** A logo as simple-icons describes it in `icons.json`. */
interface IconData {
  title: string
  slug: string
  hex: string
  aliases?: { aka?: string[]; dup?: { title: string }[]; loc?: Record<string, string> }
}

/** The other names of a logo: what it is also known as, its titles of other brands and its names in other languages. */
const namesOf = ({ aliases }: IconData) => [
  ...(aliases?.aka ?? []),
  ...(aliases?.dup ?? []).map((duplicate) => duplicate.title),
  ...Object.values(aliases?.loc ?? {}),
]

/**
 * The logos of simple-icons (CC0) as modules of the application: a catalog, which the page loads once a board needs a
 * logo, and the paths in groups by the first letter, which it loads when it draws a logo of the group. They come from
 * the address of the application, as any of its code, so the Content Security Policy stays as it is.
 */
export function techIcons(): Plugin {
  const require = createRequire(import.meta.url)
  const dataFile = require.resolve('simple-icons/icons.json')
  const iconsDir = join(dirname(dataFile), '..', 'icons')
  let icons: IconData[] | null = null
  const all = () => (icons ??= JSON.parse(readFileSync(dataFile, 'utf8')) as IconData[])
  return {
    name: 'codraw-tech-icons',
    resolveId(id) {
      return id === CATALOG_ID || id.startsWith(PATHS_ID) ? `\0${id}` : undefined
    },
    load(id) {
      if (id === `\0${CATALOG_ID}`) {
        const list = all().map((icon) => [icon.slug, icon.title, icon.hex, namesOf(icon)])
        const groups = [...new Set(all().map((icon) => groupOf(icon.slug)))].sort()
        const cases = groups.map((group) => `    case ${JSON.stringify(group)}: return import(${JSON.stringify(PATHS_ID + group)})`)
        return [
          `export const icons = ${JSON.stringify(list)}`,
          'export function paths(group) {',
          '  switch (group) {',
          ...cases,
          '    default: return Promise.resolve({ default: {} })',
          '  }',
          '}',
        ].join('\n')
      }
      if (id.startsWith(`\0${PATHS_ID}`)) {
        const group = id.slice(PATHS_ID.length + 1)
        const paths: Record<string, string> = {}
        for (const icon of all()) {
          if (groupOf(icon.slug) !== group) continue
          const path = /<path d="([^"]+)"/.exec(readFileSync(join(iconsDir, `${icon.slug}.svg`), 'utf8'))?.[1]
          if (path) paths[icon.slug] = path
        }
        return `export default ${JSON.stringify(paths)}`
      }
      return undefined
    },
  }
}
