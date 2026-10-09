import { FRAME_SHAPES } from './elementKinds.ts'
import { canBeElement, elementProperties } from './elementProps.ts'
import { imageStyle } from './images.ts'
import type { ShapeId, ShapePreset } from './shapes.ts'

/** A logo of a technology of simple-icons: its slug, its title, the color of its brand and its other names. */
export interface TechIcon {
  slug: string
  title: string
  /** `#rrggbb`. */
  hex: string
  names: string[]
}

/** The logos by slug and by the keys of their names (see {@link nameKey}). */
export interface TechIconCatalog {
  icons: readonly TechIcon[]
  bySlug: ReadonlyMap<string, TechIcon>
  byName: ReadonlyMap<string, TechIcon>
}

/**
 * Style key of the logo of a shape: the slug of a logo chosen for it, or {@link NO_ICON}; without it, the shape shows
 * the logo of its technology, if simple-icons has one. A key of the look of the cell, which copies and files carry.
 */
export const ICON_KEY = 'codrawIcon'
/** The value of {@link ICON_KEY} of a shape that shows no logo, whatever its technology. */
export const NO_ICON = 'none'

/**
 * The key a name is compared by, as simple-icons makes slugs: lower case, `+` is `plus`, `.` is `dot`, `#` is `sharp`,
 * `&` is `and`, letters without accents, and nothing else but letters and digits.
 */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\+/g, 'plus')
    .replace(/\./g, 'dot')
    .replace(/#/g, 'sharp')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9а-яё]/g, '')
}

/** Brands whose names start the titles of their products: `Apache Kafka` is found by `Kafka` too. */
const VENDORS = /^(apache|google|amazon|aws|microsoft|azure|ibm|oracle|eclipse|jetbrains|hashicorp|red hat)\s+/i

/** Names that people write for technologies whose logos simple-icons calls otherwise, by slug. */
const SYNONYMS: Readonly<Record<string, string>> = {
  java: 'openjdk',
  jdk: 'openjdk',
  k8s: 'kubernetes',
  postgres: 'postgresql',
  pg: 'postgresql',
  mongo: 'mongodb',
  elastic: 'elasticsearch',
  node: 'nodedotjs',
  nodejs: 'nodedotjs',
  js: 'javascript',
  ts: 'typescript',
  golang: 'go',
  springboot: 'springboot',
  rabbit: 'rabbitmq',
  ch: 'clickhouse',
}

/** The catalog of the logos out of the list of the module `virtual:tech-icons`. */
export function makeCatalog(list: readonly (readonly [string, string, string, readonly string[]])[]): TechIconCatalog {
  const icons = list.map(([slug, title, hex, names]): TechIcon => ({ slug, title, hex: `#${hex}`, names: [...names] }))
  const bySlug = new Map(icons.map((icon) => [icon.slug, icon]))
  const byName = new Map<string, TechIcon>()
  const add = (name: string, icon: TechIcon) => {
    const key = nameKey(name)
    if (key && !byName.has(key)) byName.set(key, icon)
  }
  // Titles first, then the other names, then the titles without their vendors: the first claim of a key wins.
  for (const icon of icons) add(icon.title, icon)
  for (const icon of icons) icon.names.forEach((name) => add(name, icon))
  for (const icon of icons) if (VENDORS.test(icon.title)) add(icon.title.replace(VENDORS, ''), icon)
  for (const [name, slug] of Object.entries(SYNONYMS)) {
    const icon = bySlug.get(slug)
    if (icon) add(name, icon)
  }
  return { icons, bySlug, byName }
}

let catalog: TechIconCatalog | null = null
let catalogLoading: Promise<TechIconCatalog> | null = null

/** The catalog of the logos, loaded once, when a board first needs it. */
export function loadTechIcons(): Promise<TechIconCatalog> {
  catalogLoading ??= import('virtual:tech-icons').then((module) => (catalog = makeCatalog(module.icons)))
  return catalogLoading
}

/** The catalog, when it is loaded already. */
export const techIconsNow = (): TechIconCatalog | null => catalog

const paths = new Map<string, Record<string, string>>()
const pathsLoading = new Map<string, Promise<Record<string, string>>>()
const groupOf = (slug: string) => (/^[a-z]/.test(slug) ? slug[0]! : '0')

/** The path of the logo `slug` in a box of 24 × 24, loaded with the paths of its group. */
export async function loadIconPath(slug: string): Promise<string | null> {
  const group = groupOf(slug)
  let loading = pathsLoading.get(group)
  if (!loading) {
    loading = import('virtual:tech-icons').then((module) => module.paths(group)).then(({ default: loaded }) => {
      paths.set(group, loaded)
      return loaded
    })
    pathsLoading.set(group, loading)
  }
  return (await loading)[slug] ?? null
}

/** The path of the logo `slug`, when its group is loaded already. */
export const iconPathNow = (slug: string): string | null => paths.get(groupOf(slug))?.[slug] ?? null

/** Versions, editions and the like that follow the name of a technology: `PostgreSQL 16`, `Node.js 20 LTS`. */
const VERSION = /\s+(v?\d[\w.-]*|lts|latest|ce|ee)(?=\s|$)/gi

/**
 * The logo of a technology as people write it: the whole name, without its version, or the first of the technologies
 * it lists (`Kotlin, Spring Boot`), or the first words of it (`Redis Cluster` is Redis); `null` when simple-icons has
 * none.
 */
export function iconOfTechnology(icons: TechIconCatalog, technology: string): TechIcon | null {
  const parts = technology
    .split(/\s*(?:[,;/|]|\s\+\s|\sи\s|\sand\s)\s*/i)
    .map((part) => part.replace(VERSION, '').trim())
    .filter(Boolean)
  for (const part of parts) {
    const words = part.split(/\s+/)
    for (let count = words.length; count > 0; count--) {
      const icon = icons.byName.get(nameKey(words.slice(0, count).join(' ')))
      if (icon) return icon
    }
  }
  return null
}

/** The shapes that show logos: those that may be elements, but not the frames of systems, containers and groups. */
export function mayShowIcon(style: Record<string, unknown>): boolean {
  return canBeElement(style) && !FRAME_SHAPES[String(style.codrawShape ?? '') as ShapeId]
}

/**
 * The logo a shape shows: the one chosen for it, none when it is told to show none, or that of its technology; `null`
 * when it shows none.
 */
export function iconOfShape(icons: TechIconCatalog, style: Record<string, unknown>, value: string): TechIcon | null {
  if (!mayShowIcon(style)) return null
  const chosen = style[ICON_KEY]
  if (chosen === NO_ICON) return null
  if (typeof chosen === 'string' && chosen !== '') return icons.bySlug.get(chosen) ?? null
  const { technology } = elementProperties(style, value)
  return technology ? iconOfTechnology(icons, technology) : null
}

/** Whether a shape may want a logo before the catalog is loaded: it has a logo of its own, or a technology. */
export function wantsIcon(style: Record<string, unknown>, value: string): boolean {
  if (!mayShowIcon(style) || style[ICON_KEY] === NO_ICON) return false
  return (typeof style[ICON_KEY] === 'string' && style[ICON_KEY] !== '') || elementProperties(style, value).technology !== ''
}

/**
 * The logos whose title or other names have all the words of the query, the best first: a name that is the query, a
 * title that starts with it, a word that does; at most `limit`.
 */
export function searchIcons(icons: TechIconCatalog, query: string, limit = 8): TechIcon[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const key = nameKey(query)
  const scored: { icon: TechIcon; score: number }[] = []
  for (const icon of icons.icons) {
    const names = [icon.title, ...icon.names].map((name) => name.toLowerCase())
    if (!words.every((word) => names.some((name) => name.includes(word)))) continue
    const title = icon.title.toLowerCase()
    const score =
      icons.byName.get(key) === icon ? 0
      : title.startsWith(words.join(' ')) ? 1
      : title.split(/[\s.-]+/).some((part) => part.startsWith(words[0]!)) ? 2
      : 3
    scored.push({ icon, score })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.icon.title.length - b.icon.title.length || a.icon.title.localeCompare(b.icon.title))
    .slice(0, limit)
    .map(({ icon }) => icon)
}

/** A color too light to see on white, e.g. a white logo: drawn dark gray instead. */
function visibleOnWhite(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255) as [number, number, number]
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.8 ? '#3f3f46' : hex
}

const svgUrl = (svg: string) =>
  `data:image/svg+xml;base64,${btoa(Array.from(new TextEncoder().encode(svg), (byte) => String.fromCharCode(byte)).join(''))}`

/** The type of data of a logo dragged from the palette onto the canvas: its slug. */
export const LOGO_DRAG_TYPE = 'application/x-codraw-logo'

/** The size of the badge of a logo on a shape, at 100%. */
export const BADGE_SIZE = 20

/**
 * The badge of a logo on a shape: the logo in the color of its brand on a white rounded square with a gray border, so
 * that it shows on any fill, in the light and the dark theme alike.
 */
export function badgeImage(icon: TechIcon, path: string): string {
  return svgUrl(
    // Four times larger than drawn, so that a picture made of it for a PDF stays sharp.
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_SIZE * 4}" height="${BADGE_SIZE * 4}" viewBox="0 0 20 20">` +
      '<rect x="0.5" y="0.5" width="19" height="19" rx="4" fill="#ffffff" stroke="#d4d4d8"/>' +
      `<g transform="translate(3 3) scale(0.5833)"><path fill="${visibleOnWhite(icon.hex)}" d="${path}"/></g></svg>`,
  )
}

/** The logo alone, in the color of its brand, as a picture of 96 × 96, sharp in a PDF. */
export function logoImage(icon: TechIcon, path: string): string {
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24"><title>${escapeXml(icon.title)}</title>` +
      `<path fill="${visibleOnWhite(icon.hex)}" d="${path}"/></svg>`,
  )
}

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A logo as a shape: a picture of 64 × 64 named by the logo, which files and images carry as SVG. */
export function logoShape(icon: TechIcon, path: string): Omit<ShapePreset, 'id'> {
  return {
    label: icon.title,
    value: icon.title,
    width: 64,
    height: 64,
    style: imageStyle(logoImage(icon, path)),
  }
}
