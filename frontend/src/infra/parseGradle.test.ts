import { describe, expect, it } from 'vitest'
import {
  buildDependencies,
  buildPlugins,
  isGradleFile,
  parseGradleFolder,
  parseGradleGraph,
  parseGradleGraphs,
  settingsIncludes,
  withoutComments,
} from './parseGradle.ts'
import { SHOP_FOLDER, SHOP_GRAPH } from './testGradle.ts'

const graph = (text: string, name = 'modules.json') => parseGradleGraph({ name, text })
const paths = (name: string) => (name === 'core' ? ':core' : name === 'services.orders' ? ':services:orders' : null)

describe('parseGradleGraph', () => {
  it('reads what codraw.gradle printed', () => {
    const projects = graph(SHOP_GRAPH)

    expect(projects.map((project) => project.path)).toEqual([':', ':app', ':core', ':services', ':services:billing', ':services:orders'])
    expect(projects[1]).toEqual({
      path: ':app',
      name: 'app',
      plugins: ['application', 'java'],
      dependencies: [
        { configuration: 'implementation', project: ':services:billing' },
        { configuration: 'implementation', project: ':services:orders' },
        { configuration: 'testImplementation', project: ':core' },
      ],
    })
  })

  it('reads the graph after other lines that Gradle printed', () => {
    expect(graph(`Warning: something\n${SHOP_GRAPH}\n`)).toHaveLength(6)
  })

  it('refuses what is not a graph of the script', () => {
    const refusal = 'package.json: это не граф модулей из codraw.gradle — выполните ./gradlew -q -I codraw.gradle codrawGraph'
    expect(() => graph('{"name": "shop", "version": "1.0.0"}', 'package.json')).toThrow(refusal)
    expect(() => graph('not json', 'package.json')).toThrow(refusal)
  })

  it('merges graphs by the paths of their projects and names the errors of the others', () => {
    const second = JSON.stringify({
      format: 'codraw-gradle',
      version: 1,
      projects: [{ path: ':app', name: 'app', plugins: ['org.jetbrains.kotlin.jvm'], dependencies: [{ configuration: 'implementation', project: ':core' }] }],
    })
    const { build, errors } = parseGradleGraphs([
      { name: 'a.json', text: SHOP_GRAPH },
      { name: 'b.json', text: second },
      { name: 'c.json', text: '[]' },
    ])

    const app = build.projects.find((project) => project.path === ':app')!
    expect(app.plugins).toEqual(['application', 'java', 'org.jetbrains.kotlin.jvm'])
    expect(app.dependencies).toHaveLength(4)
    expect(build.skipped).toBe(0)
    expect(errors).toEqual(['c.json: это не граф модулей из codraw.gradle — выполните ./gradlew -q -I codraw.gradle codrawGraph'])
  })
})

describe('the files of a build', () => {
  it('reads only the files of settings and builds outside the folders of outputs and tools', () => {
    expect(isGradleFile('shop/settings.gradle.kts')).toBe(true)
    expect(isGradleFile('shop/app/build.gradle')).toBe(true)
    expect(isGradleFile('shop/app/build/generated/build.gradle.kts')).toBe(false)
    expect(isGradleFile('shop/buildSrc/build.gradle.kts')).toBe(false)
    expect(isGradleFile('shop/node_modules/x/build.gradle')).toBe(false)
    expect(isGradleFile('shop/app/src/Main.kt')).toBe(false)
  })

  it('drops comments but keeps strings with slashes', () => {
    expect(withoutComments('a // b\nc /* d */ e "http://x" \'//y\' """//z"""')).toBe('a \nc   e "http://x" \'//y\' """//z"""')
  })

  it('reads the includes of Kotlin DSL and Groovy and counts those it cannot read', () => {
    expect(settingsIncludes('include(":app", "core")\ninclude(\n  ":services:billing",\n)')).toEqual({
      paths: [':app', ':core', ':services:billing'],
      skipped: 0,
    })
    expect(settingsIncludes("include 'app', ':core',\n  'web'\nincludeBuild('plugins')")).toEqual({ paths: [':app', ':core', ':web'], skipped: 0 })
    expect(settingsIncludes('include(":app")\nfile("services").listFiles()!!.forEach { include(":services:${it.name}") }\ninclude(names)')).toEqual({
      paths: [':app'],
      skipped: 2,
    })
  })

  it('reads plugins of Kotlin DSL, Groovy, catalogs of versions and apply', () => {
    expect(buildPlugins('plugins {\n  kotlin("jvm") version "2.2.0"\n  id("org.springframework.boot")\n  `java-library`\n  application\n}')).toEqual([
      'org.jetbrains.kotlin.jvm',
      'org.springframework.boot',
      'java-library',
      'application',
    ])
    expect(buildPlugins("plugins { id 'com.android.application' version '8.6.0' }\napply plugin: 'java'")).toEqual(['com.android.application', 'java'])
    expect(buildPlugins('plugins {\n  alias(libs.plugins.spring.boot)\n  alias(libs.plugins.kotlinJvm)\n  alias(libs.plugins.detekt)\n}')).toEqual([
      'org.springframework.boot',
      'org.jetbrains.kotlin.jvm',
    ])
  })

  it('reads the dependencies on projects in blocks of dependencies only', () => {
    const script = [
      'dependencies {',
      '  implementation(project(":core"))',
      '  api(platform(project(path = ":bom")))',
      "  testImplementation testFixtures(project(':core'))",
      '  "kapt"(project(":processor"))',
      '  implementation(projects.services.orders) { because("orders") }',
      "  runtimeOnly project(path: ':db', configuration: 'default')",
      '}',
      'tasks.named("run") { dependsOn(project(":other").tasks.named("jar")) }',
    ].join('\n')

    expect(buildDependencies(script, paths)).toEqual([
      { configuration: 'implementation', project: ':core' },
      { configuration: 'api', project: ':bom' },
      { configuration: 'testImplementation', project: ':core' },
      { configuration: 'kapt', project: ':processor' },
      { configuration: 'implementation', project: ':services:orders' },
      { configuration: 'runtimeOnly', project: ':db' },
    ])
  })
})

describe('parseGradleFolder', () => {
  it('reads the build of a folder as Gradle sees it, with the parents of nested projects', () => {
    const build = parseGradleFolder(SHOP_FOLDER)

    expect(build.skipped).toBe(0)
    expect(build.projects).toEqual([
      { path: ':', name: 'shop', plugins: [], dependencies: [] },
      {
        path: ':app',
        name: 'app',
        plugins: ['org.jetbrains.kotlin.jvm', 'org.springframework.boot', 'application'],
        dependencies: [
          { configuration: 'implementation', project: ':services:billing' },
          { configuration: 'implementation', project: ':services:orders' },
          { configuration: 'testImplementation', project: ':core' },
        ],
      },
      { path: ':core', name: 'core', plugins: ['java-library'], dependencies: [] },
      { path: ':services', name: 'services', plugins: [], dependencies: [] },
      { path: ':services:billing', name: 'billing', plugins: ['java-library'], dependencies: [{ configuration: 'api', project: ':core' }] },
      { path: ':services:orders', name: 'orders', plugins: ['java-library'], dependencies: [{ configuration: 'implementation', project: ':core' }] },
    ])
  })

  it('takes the folders of projects that settings move, the settings nearest to the chosen folder and kebab names of accessors', () => {
    const build = parseGradleFolder([
      { path: 'repo/tools/settings.gradle', text: "include ':nested'" },
      {
        path: 'repo/settings.gradle.kts',
        text: 'include(":my-app", ":lib")\nproject(":lib").projectDir = file("libraries/lib")\n',
      },
      { path: 'repo/my-app/build.gradle.kts', text: 'dependencies { implementation(projects.lib) }' },
      { path: 'repo/libraries/lib/build.gradle.kts', text: 'plugins { kotlin("multiplatform") }\ndependencies { api(projects.myApp) }' },
    ])

    expect(build.projects.map((project) => [project.path, project.name, project.plugins, project.dependencies.map((item) => item.project)])).toEqual([
      [':', 'repo', [], []],
      [':my-app', 'my-app', [], [':lib']],
      [':lib', 'lib', ['org.jetbrains.kotlin.multiplatform'], [':my-app']],
    ])
  })

  it('needs the settings of a build', () => {
    expect(() => parseGradleFolder([{ path: 'app/build.gradle.kts', text: '' }])).toThrow(
      'В папке нет settings.gradle или settings.gradle.kts — выберите корень сборки или откройте граф из скрипта codraw.gradle',
    )
  })
})
