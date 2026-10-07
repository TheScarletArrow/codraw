import { describe, expect, it } from 'vitest'
import { gradleGraph, gradleGraphError, gradleSummary, MAX_MODULES, technologies } from './gradleGraph.ts'
import { infraCells } from './infraCells.ts'
import type { InfraGraph } from './infraGraph.ts'
import { parseGradleFolder, parseGradleGraph, type GradleBuild } from './parseGradle.ts'
import { SHOP_FOLDER, SHOP_GRAPH } from './testGradle.ts'

const shop: GradleBuild = { projects: parseGradleGraph({ name: 'modules.json', text: SHOP_GRAPH }), skipped: 0 }
const OFF = { tests: false, c4: false }

/** The links of the graph as `source -> target: label` by the first lines of their nodes. */
const links = (graph: InfraGraph) =>
  graph.edges.map((edge) => `${graph.nodes[edge.source]!.lines[0]} -> ${graph.nodes[edge.target]!.lines[0]}: ${edge.label}`)

describe('technologies', () => {
  it('names the language, then the frameworks', () => {
    expect(technologies(['org.jetbrains.kotlin.jvm', 'java', 'org.springframework.boot'])).toEqual(['Kotlin', 'Spring Boot'])
    expect(technologies(['java-library'])).toEqual(['Java'])
    expect(technologies(['com.android.application', 'org.jetbrains.kotlin.android', 'org.jetbrains.compose'])).toEqual(['Kotlin', 'Android', 'Compose'])
    expect(technologies(['java-platform'])).toEqual(['BOM'])
    expect(technologies([])).toEqual([])
  })
})

describe('gradleGraph', () => {
  it('draws the modules with their paths and technologies, a frame of their group and links of their configurations', () => {
    const graph = gradleGraph(shop, OFF)

    expect(graph.nodes).toEqual([
      { shape: 'uml-component', lines: [':app', 'Java'], frame: null },
      { shape: 'uml-component', lines: [':core', 'Java'], frame: null },
      { shape: 'uml-component', lines: [':services:billing', 'Java'], frame: 0 },
      { shape: 'uml-component', lines: [':services:orders', 'Java'], frame: 0 },
    ])
    expect(graph.frames).toEqual([{ shape: 'boundary', label: ':services' }])
    expect(links(graph)).toEqual([
      ':app -> :services:billing: implementation',
      ':app -> :services:orders: implementation',
      ':services:billing -> :core: api',
      ':services:orders -> :core: implementation',
    ])
    expect(graph.direction).toBe('down')
    expect(gradleSummary(shop, graph)).toBe('Модулей: 4, связей: 4, групп: 1, пропущено: 0')
  })

  it('links the dependencies of tests when asked', () => {
    expect(links(gradleGraph(shop, { tests: true, c4: false }))).toContain(':app -> :core: testImplementation')
  })

  it('joins the configurations between two modules and skips the derived ones', () => {
    const build: GradleBuild = {
      projects: [
        {
          path: ':app',
          name: 'app',
          plugins: [],
          dependencies: [
            { configuration: 'api', project: ':core' },
            { configuration: 'runtimeOnly', project: ':core' },
            { configuration: 'compileClasspath', project: ':core' },
            { configuration: 'implementation', project: ':missing' },
          ],
        },
        { path: ':core', name: 'core', plugins: [], dependencies: [] },
      ],
      skipped: 3,
    }
    const graph = gradleGraph(build, OFF)

    expect(links(graph)).toEqual([':app -> :core: api, runtimeOnly'])
    expect(gradleSummary(build, graph)).toBe('Модулей: 2, связей: 1, групп: 0, пропущено: 3')
  })

  it('draws the root as a module when it has plugins or dependencies, with the name of the build', () => {
    const graph = gradleGraph(
      { projects: [{ path: ':', name: 'codraw-backend', plugins: ['org.jetbrains.kotlin.jvm', 'org.springframework.boot', 'java'], dependencies: [] }], skipped: 0 },
      OFF,
    )

    expect(graph.nodes).toEqual([{ shape: 'uml-component', lines: ['codraw-backend', 'Kotlin, Spring Boot'], frame: null }])
  })

  it('reads the same modules from a folder, with the technologies of their plugins', () => {
    const graph = gradleGraph(parseGradleFolder(SHOP_FOLDER), OFF)

    expect(graph.nodes[0]).toEqual({ shape: 'uml-component', lines: [':app', 'Kotlin, Spring Boot'], frame: null })
    expect(links(graph)).toHaveLength(4)
  })

  it('makes Component of C4', () => {
    expect(gradleGraph(shop, { tests: false, c4: true }).nodes[0]).toEqual({ shape: 'c4-component', lines: [':app', '[Component: Java]'], frame: null })
  })

  it('lays the modules out from top to bottom', async () => {
    const cells = await infraCells(gradleGraph(shop, OFF), { x: 0, y: 0 })

    const y = (value: string) => cells.find((cell) => cell.value.startsWith(`${value}\n`))!.geometry!.y
    expect(y(':app')).toBeLessThan(y(':services:billing'))
    expect(y(':services:billing')).toBeLessThan(y(':core'))
  })

  it('is too large beyond the limit of modules', () => {
    const build: GradleBuild = {
      projects: Array.from({ length: MAX_MODULES + 1 }, (_, index) => ({ path: `:m${index}`, name: `m${index}`, plugins: [], dependencies: [] })),
      skipped: 0,
    }

    expect(gradleGraphError(gradleGraph(build, OFF))).toBe('Слишком много модулей: 301, за раз можно добавить не больше 300')
  })
})
