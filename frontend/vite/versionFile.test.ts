import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildInfo } from './versionFile.ts'

function packageJson(version: string) {
  const path = join(mkdtempSync(join(tmpdir(), 'codraw-version-')), 'package.json')
  writeFileSync(path, JSON.stringify({ name: 'app', version }))
  return path
}

describe('buildInfo', () => {
  it('takes the version of the package and names the build by its moment', () => {
    expect(buildInfo(packageJson('1.2.3'), {}, () => 36 ** 3)).toEqual({ version: '1.2.3', build: '1000' })
  })

  it('takes the id of the build from the environment when it is set', () => {
    expect(buildInfo(packageJson('1.2.3'), { CODRAW_BUILD_ID: ' abc123 ' }).build).toBe('abc123')
  })

  it('gives every build its own id', () => {
    const path = packageJson('1.2.3')
    expect(buildInfo(path, {}, () => 1000).build).not.toBe(buildInfo(path, {}, () => 2000).build)
  })
})
