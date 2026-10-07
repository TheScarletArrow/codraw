import { InfraEdges, type InfraGraph, type InfraNode } from './infraGraph.ts'
import type { GradleBuild, GradleProject } from './parseGradle.ts'

/** Modules one import adds at most: more would not fit a page that people read. */
export const MAX_MODULES = 300

export interface GradleOptions {
  /** Dependencies of configurations of tests become links too. */
  tests: boolean
  /** Modules become Component of C4. */
  c4: boolean
}

/** Languages by the plugins that compile them, the first that applies; Kotlin applies `java` too. */
const LANGUAGES: [string, string][] = [
  ['org.jetbrains.kotlin.multiplatform', 'Kotlin Multiplatform'],
  ['org.jetbrains.kotlin.jvm', 'Kotlin'],
  ['org.jetbrains.kotlin.android', 'Kotlin'],
]
const JAVA = ['java', 'java-library', 'application', 'war']

/** Frameworks and kinds of modules by their plugins, in the order a label names them. */
const FRAMEWORKS: [string, string][] = [
  ['org.springframework.boot', 'Spring Boot'],
  ['io.quarkus', 'Quarkus'],
  ['io.micronaut.application', 'Micronaut'],
  ['io.micronaut.library', 'Micronaut'],
  ['io.ktor.plugin', 'Ktor'],
  ['com.android.application', 'Android'],
  ['com.android.library', 'Android'],
  ['org.jetbrains.compose', 'Compose'],
  ['com.google.protobuf', 'Protobuf'],
  ['java-platform', 'BOM'],
]

/** The technologies of a module by its plugins: its language, then its frameworks. */
export function technologies(plugins: string[]): string[] {
  const language = LANGUAGES.find(([id]) => plugins.includes(id))?.[1] ?? (plugins.some((id) => JAVA.includes(id)) ? 'Java' : null)
  const names = [language, ...FRAMEWORKS.filter(([id]) => plugins.includes(id)).map(([, name]) => name)]
  return [...new Set(names.filter((name): name is string => name !== null))]
}

/** Configurations that hold no dependencies of their own: Gradle resolves and publishes others through them. */
const DERIVED = /(Classpath|Elements|DependenciesMetadata)$/

/** A configuration of tests: `testImplementation`, `androidTestImplementation`, `testFixturesApi`. */
export const isTestConfiguration = (configuration: string) => /test/i.test(configuration)

/**
 * The graph of a build: a «Компонент» per module with its path and technologies, a frame per group — a project with
 * projects inside it and no plugins or dependencies of its own — around the modules inside it, and a link per
 * dependency between modules, named by its configurations. The root without plugins or dependencies is left out.
 */
export function gradleGraph(build: GradleBuild, { tests, c4 }: GradleOptions): InfraGraph {
  const depended = new Set(build.projects.flatMap((project) => project.dependencies.map((dependency) => dependency.project)))
  const plain = (project: GradleProject) => project.plugins.length === 0 && project.dependencies.length === 0 && !depended.has(project.path)
  const hasChildren = (project: GradleProject) =>
    build.projects.some((other) => other.path !== project.path && other.path.startsWith(project.path === ':' ? ':' : `${project.path}:`))
  const groups = new Set(build.projects.filter((project) => project.path !== ':' && plain(project) && hasChildren(project)).map((project) => project.path))
  const modules = build.projects.filter((project) => !groups.has(project.path) && !(project.path === ':' && plain(project)))

  const frames: string[] = []
  /** The frame of the nearest group a module is in. */
  const frameOf = (path: string) => {
    const parts = path.split(':')
    for (let length = parts.length - 1; length > 1; length--) {
      const parent = parts.slice(0, length).join(':')
      if (!groups.has(parent)) continue
      if (!frames.includes(parent)) frames.push(parent)
      return frames.indexOf(parent)
    }
    return null
  }
  const nodes = modules.map((project): InfraNode => {
    const name = project.path === ':' ? project.name : project.path
    const made = technologies(project.plugins).join(', ')
    const lines = c4 ? [name, made ? `[Component: ${made}]` : '[Component]'] : [name, ...(made ? [made] : [])]
    return { shape: c4 ? 'c4-component' : 'uml-component', lines, frame: frameOf(project.path) }
  })

  const index = new Map(modules.map((project, at) => [project.path, at]))
  const links = new InfraEdges()
  modules.forEach((project, at) => {
    for (const { configuration, project: target } of project.dependencies) {
      if (DERIVED.test(configuration) || (!tests && isTestConfiguration(configuration))) continue
      links.add(at, index.get(target), configuration)
    }
  })
  return { nodes, frames: frames.map((label) => ({ shape: 'boundary', label })), edges: links.list(), direction: 'down' }
}

/** What the import adds, for the summary before it. */
export function gradleSummary(build: GradleBuild, graph: InfraGraph): string {
  return `Модулей: ${graph.nodes.length}, связей: ${graph.edges.length}, групп: ${graph.frames.length}, пропущено: ${build.skipped}`
}

/** Why the graph is too large to add, or `null`. */
export function gradleGraphError(graph: InfraGraph): string | null {
  return graph.nodes.length > MAX_MODULES ? `Слишком много модулей: ${graph.nodes.length}, за раз можно добавить не больше ${MAX_MODULES}` : null
}
