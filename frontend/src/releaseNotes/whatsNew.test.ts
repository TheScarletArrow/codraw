import { describe, expect, it } from 'vitest'
import { version } from '../../package.json'
import { releases, type Release } from './releases.ts'
import { compareVersions, releaseDate, unseenReleases } from './whatsNew.ts'

const release = (version: string): Release => ({ version, date: '2026-10-06', items: [] })
const all = [release('0.10.0'), release('0.9.1'), release('0.9.0')]

describe('release notes', () => {
  it('describe the current version of the app first', () => {
    expect(releases[0].version).toBe(version)
  })

  it('go from the newest release to the oldest, each with its novelties', () => {
    for (const [newer, older] of releases.slice(0, -1).map((r, i) => [r, releases[i + 1]] as const)) {
      expect(compareVersions(newer.version, older.version)).toBeGreaterThan(0)
      expect(newer.date >= older.date).toBe(true)
    }
    for (const { version, date, items } of releases) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(items.length).toBeGreaterThan(0)
    }
  })
})

describe('compareVersions', () => {
  it('compares the parts as numbers', () => {
    expect(compareVersions('0.10.0', '0.9.1')).toBeGreaterThan(0)
    expect(compareVersions('0.9.1', '0.10.0')).toBeLessThan(0)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })
})

describe('unseenReleases', () => {
  it('gives the releases newer than the one last seen', () => {
    expect(unseenReleases('0.9.0', true, all).map((r) => r.version)).toEqual(['0.10.0', '0.9.1'])
    expect(unseenReleases('0.10.0', true, all)).toEqual([])
  })

  it('gives nothing to a browser new to CoDraw', () => {
    expect(unseenReleases(null, false, all)).toEqual([])
  })

  it('gives the newest release to a browser that used CoDraw before the novelties were shown', () => {
    expect(unseenReleases(null, true, all).map((r) => r.version)).toEqual(['0.10.0'])
  })
})

describe('releaseDate', () => {
  it('names the day in Russian', () => {
    expect(releaseDate('2026-10-06')).toBe('6 октября 2026')
  })
})
