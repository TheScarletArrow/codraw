import { describe, expect, it } from 'vitest'
import {
  badgeImage,
  iconOfShape,
  iconOfTechnology,
  loadIconPath,
  loadTechIcons,
  logoShape,
  makeCatalog,
  nameKey,
  NO_ICON,
  searchIcons,
  wantsIcon,
  type TechIcon,
} from './techIcons.ts'

const catalog = makeCatalog([
  ['redis', 'Redis', 'FF4438', []],
  ['postgresql', 'PostgreSQL', '4169E1', ['Postgres']],
  ['kotlin', 'Kotlin', '7F52FF', []],
  ['spring', 'Spring', '6DB33F', []],
  ['springboot', 'Spring Boot', '6DB33F', []],
  ['apachekafka', 'Apache Kafka', '231F20', []],
  ['openjdk', 'OpenJDK', 'FFFFFF', []],
  ['nodedotjs', 'Node.js', '5FA04E', []],
  ['csharp', 'C#', '512BD4', []],
  ['redisinsight', 'RedisInsight', 'DC382D', []],
])

const decode = (url: string) => new TextDecoder().decode(Uint8Array.from(atob(url.split(',')[1]!), (char) => char.charCodeAt(0)))

describe('logos of technologies', () => {
  it('compares names as simple-icons makes slugs', () => {
    expect(nameKey('Node.js')).toBe('nodedotjs')
    expect(nameKey('C#')).toBe('csharp')
    expect(nameKey('C++')).toBe('cplusplus')
    expect(nameKey('  Spring Boot ')).toBe('springboot')
    expect(nameKey('Ëlectron')).toBe('electron')
  })

  it('finds the logo of a technology as people write it', () => {
    const slug = (technology: string) => iconOfTechnology(catalog, technology)?.slug ?? null
    expect(slug('Redis')).toBe('redis')
    expect(slug('postgres')).toBe('postgresql')
    expect(slug('PostgreSQL 16')).toBe('postgresql')
    expect(slug('Kotlin, Spring Boot')).toBe('kotlin')
    expect(slug('Spring Boot 3.2')).toBe('springboot')
    expect(slug('Spring Boot WebFlux')).toBe('springboot')
    expect(slug('Kafka')).toBe('apachekafka')
    expect(slug('Java 21')).toBe('openjdk')
    expect(slug('Node.js 20 LTS')).toBe('nodedotjs')
    expect(slug('Redis Cluster')).toBe('redis')
    expect(slug('HTTPS / gRPC')).toBeNull()
    expect(slug('Самописный движок')).toBeNull()
  })

  it('finds logos by the words of a search, the best first', () => {
    expect(searchIcons(catalog, 'redis').map((icon) => icon.slug)).toEqual(['redis', 'redisinsight'])
    expect(searchIcons(catalog, 'spring').map((icon) => icon.slug)).toEqual(['spring', 'springboot'])
    expect(searchIcons(catalog, 'spring boot').map((icon) => icon.slug)).toEqual(['springboot'])
    expect(searchIcons(catalog, 'postgres').map((icon) => icon.slug)).toEqual(['postgresql'])
    expect(searchIcons(catalog, '   ')).toEqual([])
    expect(searchIcons(catalog, 's', 1)).toHaveLength(1)
  })

  it('takes the logo of a shape from the choice for it, or from its technology', () => {
    const cache = { codrawShape: 'cache' }
    expect(iconOfShape(catalog, cache, 'Кэш\n[Redis]')?.slug).toBe('redis')
    expect(iconOfShape(catalog, { ...cache, codrawIcon: 'kotlin' }, 'Кэш\n[Redis]')?.slug).toBe('kotlin')
    expect(iconOfShape(catalog, { ...cache, codrawIcon: NO_ICON }, 'Кэш\n[Redis]')).toBeNull()
    expect(iconOfShape(catalog, cache, 'Кэш')).toBeNull()
    expect(iconOfShape(catalog, { codrawShape: 'c4-container' }, 'API\n[Container: Spring Boot]\nЗаказы')?.slug).toBe('springboot')
    // Frames, stickies and pictures show none.
    expect(iconOfShape(catalog, { codrawShape: 'c4-boundary' }, 'Магазин\n[Software System: Redis]')).toBeNull()
    expect(iconOfShape(catalog, { codrawShape: 'sticky' }, 'Redis\n[Redis]')).toBeNull()
    expect([wantsIcon(cache, 'Кэш\n[Redis]'), wantsIcon(cache, 'Кэш'), wantsIcon({ ...cache, codrawIcon: 'kotlin' }, 'Кэш')]).toEqual([
      true,
      false,
      true,
    ])
  })

  it('draws a badge on white in the color of the brand, a white logo dark', () => {
    const redis = catalog.bySlug.get('redis')!
    const badge = decode(badgeImage(redis, 'M0 0h24v24H0z'))
    expect(badge).toContain('fill="#ffffff"')
    expect(badge).toContain('<path fill="#FF4438" d="M0 0h24v24H0z"/>')
    expect(decode(badgeImage(catalog.bySlug.get('openjdk') as TechIcon, 'M1 1'))).toContain('<path fill="#3f3f46"')
    expect(logoShape(redis, 'M1 1')).toMatchObject({ label: 'Redis', value: 'Redis', width: 64, height: 64, style: { shape: 'image' } })
  })

  it('loads the catalog of simple-icons and the paths of its logos lazily', async () => {
    const icons = await loadTechIcons()

    expect(icons.icons.length).toBeGreaterThan(3000)
    expect(iconOfTechnology(icons, 'PostgreSQL 16')?.title).toBe('PostgreSQL')
    expect(iconOfTechnology(icons, 'Kafka')?.title).toBe('Apache Kafka')
    expect(await loadIconPath('redis')).toMatch(/^M/)
    expect(await loadIconPath('no-such-logo')).toBeNull()
  })
})
