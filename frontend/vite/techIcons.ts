import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/** The catalog of the logos of technologies: their slugs, titles, colors and other names, without their paths. */
export const CATALOG_ID = 'virtual:tech-icons'
/** The paths of the logos whose slugs start with a letter, e.g. `virtual:tech-icons/paths/k`; digits are `0`. */
export const PATHS_ID = 'virtual:tech-icons/paths/'

/** The group of the paths of a logo: the first letter of its slug, `0` for a digit. */
export const groupOf = (slug: string) => (/^[a-z]/.test(slug) ? slug[0]! : '0')

/** A logo as simple-icons describes it in `icons.json`. */
export interface IconData {
  title: string
  slug: string
  hex: string
  aliases?: { aka?: string[]; dup?: { title: string }[]; loc?: Record<string, string> }
}

/** A logo of the supplementary set of CoDraw, `logos/logos.json`: as simple-icons describes it, with its path. */
export interface ExtraIconData extends IconData {
  /** One path in a box of 24 × 24. */
  path: string
  /** Where the logo comes from and under which license. */
  source: string
}

/** The supplementary set of logos and the other names of the logos of simple-icons, `logos/names.json`. */
export const EXTRA_LOGOS = join(dirname(fileURLToPath(import.meta.url)), 'logos', 'logos.json')
export const EXTRA_NAMES = join(dirname(fileURLToPath(import.meta.url)), 'logos', 'names.json')

/** The other names of a logo: what it is also known as, its titles of other brands and its names in other languages. */
const namesOf = ({ aliases }: IconData) => [
  ...(aliases?.aka ?? []),
  ...(aliases?.dup ?? []).map((duplicate) => duplicate.title),
  ...Object.values(aliases?.loc ?? {}),
]

/** A logo of the catalog, whichever set it comes from. */
interface Logo {
  icon: IconData
  names: string[]
  path: () => string | undefined
}

/**
 * The logos of both sets: those of CoDraw first, so that a title of theirs wins over the same title of simple-icons
 * («MAX» is the messenger, not HBO Max), then those of simple-icons with the names CoDraw adds to them. A slug of CoDraw
 * that simple-icons has too, or a name for a slug that neither has, stops the build: an update of simple-icons that
 * brings a logo back tells that its copy in CoDraw is to go.
 */
export function mergeLogos(
  simple: IconData[],
  pathOf: (slug: string) => string | undefined,
  extra: ExtraIconData[],
  extraNames: Record<string, string[]>,
): Logo[] {
  const simpleSlugs = new Set(simple.map((icon) => icon.slug))
  const extraSlugs = new Set<string>()
  for (const icon of extra) {
    if (simpleSlugs.has(icon.slug)) throw new Error(`The logo "${icon.slug}" of logos.json is in simple-icons already: remove it from logos.json`)
    if (extraSlugs.has(icon.slug)) throw new Error(`The logo "${icon.slug}" is twice in logos.json`)
    extraSlugs.add(icon.slug)
  }
  for (const slug of Object.keys(extraNames)) {
    if (!simpleSlugs.has(slug) && !extraSlugs.has(slug)) throw new Error(`names.json names the logo "${slug}", which neither set has`)
  }
  const more = (slug: string) => extraNames[slug] ?? []
  return [
    ...extra.map((icon) => ({ icon, names: [...namesOf(icon), ...more(icon.slug)], path: () => icon.path })),
    ...simple.map((icon) => ({ icon, names: [...namesOf(icon), ...more(icon.slug)], path: () => pathOf(icon.slug) })),
  ]
}

/**
 * The logos of simple-icons (CC0) and of the supplementary set of CoDraw as modules of the application: a catalog,
 * which the page loads once a board needs a logo, and the paths in groups by the first letter, which it loads when it
 * draws a logo of the group. They come from the address of the application, as any of its code, so the Content
 * Security Policy stays as it is.
 */
export function techIcons(): Plugin {
  const require = createRequire(import.meta.url)
  const dataFile = require.resolve('simple-icons/icons.json')
  const iconsDir = join(dirname(dataFile), '..', 'icons')
  const simplePath = (slug: string) => /<path d="([^"]+)"/.exec(readFileSync(join(iconsDir, `${slug}.svg`), 'utf8'))?.[1]
  let logos: Logo[] | null = null
  const all = () =>
    (logos ??= mergeLogos(
      JSON.parse(readFileSync(dataFile, 'utf8')) as IconData[],
      simplePath,
      JSON.parse(readFileSync(EXTRA_LOGOS, 'utf8')) as ExtraIconData[],
      JSON.parse(readFileSync(EXTRA_NAMES, 'utf8')) as Record<string, string[]>,
    ))
  return {
    name: 'codraw-tech-icons',
    resolveId(id) {
      return id === CATALOG_ID || id.startsWith(PATHS_ID) ? `\0${id}` : undefined
    },
    load(id) {
      if (id === `\0${CATALOG_ID}`) {
        this.addWatchFile(EXTRA_LOGOS)
        this.addWatchFile(EXTRA_NAMES)
        const list = all().map(({ icon, names }) => [icon.slug, icon.title, icon.hex, names])
        const groups = [...new Set(all().map(({ icon }) => groupOf(icon.slug)))].sort()
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
        this.addWatchFile(EXTRA_LOGOS)
        const group = id.slice(PATHS_ID.length + 1)
        const paths: Record<string, string> = {}
        for (const { icon, path } of all()) {
          if (groupOf(icon.slug) !== group) continue
          const d = path()
          if (d) paths[icon.slug] = d
        }
        return `export default ${JSON.stringify(paths)}`
      }
      return undefined
    },
    // Edits of the supplementary set reach the next build of the catalog.
    watchChange(id) {
      if (id === EXTRA_LOGOS || id === EXTRA_NAMES) logos = null
    },
  }
}
