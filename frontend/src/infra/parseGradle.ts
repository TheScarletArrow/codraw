import { ApiSpecError, MAX_DOCUMENT_SIZE, type ApiSource } from '../apiSpec/loadDocument.ts'
import { documentMessages } from '../apiSpec/messages.ts'
import { infraMessages } from './messages.tsx'

/** A dependency of a project on another, in a configuration such as `implementation`. */
export interface GradleDependency {
  configuration: string
  /** The path of the project depended on, e.g. `:core`. */
  project: string
}

/** A project of a build: `:` is the root, `:services:billing` a module in the folder `services/billing`. */
export interface GradleProject {
  path: string
  name: string
  /** Identifiers of plugins, e.g. `org.jetbrains.kotlin.jvm`. */
  plugins: string[]
  dependencies: GradleDependency[]
}

/** The projects of a build, and how many parts of its files could not be read without Gradle. */
export interface GradleBuild {
  projects: GradleProject[]
  skipped: number
}

/** The command that prints the graph of a build, as the window and the errors name it. */
export const GRADLE_COMMAND = './gradlew -q -I codraw.gradle codrawGraph'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const merge = (projects: GradleProject[]): GradleProject[] => {
  const byPath = new Map<string, GradleProject>()
  for (const project of projects) {
    const known = byPath.get(project.path)
    if (!known) {
      byPath.set(project.path, { ...project, plugins: [...project.plugins], dependencies: [...project.dependencies] })
      continue
    }
    for (const plugin of project.plugins) if (!known.plugins.includes(plugin)) known.plugins.push(plugin)
    for (const dependency of project.dependencies) {
      if (!known.dependencies.some((item) => item.configuration === dependency.configuration && item.project === dependency.project)) {
        known.dependencies.push(dependency)
      }
    }
  }
  return [...byPath.values()]
}

/** The projects of a graph printed by `codraw.gradle`. Throws {@link ApiSpecError} for anything else. */
export function parseGradleGraph({ name, text, size }: ApiSource): GradleProject[] {
  if ((size ?? text.length) > MAX_DOCUMENT_SIZE) throw new ApiSpecError(documentMessages.tooLarge(name, MAX_DOCUMENT_SIZE / 1024 / 1024))
  const refuse = () => new ApiSpecError(infraMessages.gradle.notGraph(name, GRADLE_COMMAND))
  let value: unknown
  try {
    // Gradle may print a line of its own before the graph, e.g. a warning: the graph is the last line that is JSON.
    const line = text.split('\n').reverse().find((candidate) => candidate.trim().startsWith('{'))
    value = JSON.parse(line ?? text) as unknown
  } catch {
    throw refuse()
  }
  if (!isObject(value) || value.format !== 'codraw-gradle' || !Array.isArray(value.projects)) throw refuse()
  return value.projects.filter(isObject).flatMap((project): GradleProject[] => {
    if (typeof project.path !== 'string') return []
    const strings = (items: unknown) => (Array.isArray(items) ? items.filter((item): item is string => typeof item === 'string') : [])
    return [
      {
        path: project.path,
        name: typeof project.name === 'string' ? project.name : (project.path.split(':').pop() ?? project.path),
        plugins: strings(project.plugins),
        dependencies: (Array.isArray(project.dependencies) ? project.dependencies : []).filter(isObject).flatMap((dependency) =>
          typeof dependency.configuration === 'string' && typeof dependency.project === 'string'
            ? [{ configuration: dependency.configuration, project: dependency.project }]
            : [],
        ),
      },
    ]
  })
}

/** The projects of the graphs in their order, merged by path, and the errors of those that are not graphs. */
export function parseGradleGraphs(sources: ApiSource[]): { build: GradleBuild; errors: string[] } {
  const projects: GradleProject[] = []
  const errors: string[] = []
  for (const source of sources) {
    try {
      projects.push(...parseGradleGraph(source))
    } catch (error) {
      if (!(error instanceof ApiSpecError)) throw error
      errors.push(error.message)
    }
  }
  return { build: { projects: merge(projects), skipped: 0 }, errors }
}

/** Folders the files of a build are never in: outputs of builds, caches and dependencies of other tools. */
const SKIPPED_FOLDERS = ['build', '.gradle', '.git', 'node_modules', 'buildSrc', 'out', '.idea']
const SETTINGS_FILES = ['settings.gradle.kts', 'settings.gradle']
const BUILD_FILES = ['build.gradle.kts', 'build.gradle']

/** A file of a chosen folder that the import reads: a file of settings or of a build outside the folders skipped. */
export function isGradleFile(path: string): boolean {
  const parts = path.split('/')
  const name = parts[parts.length - 1]!
  return [...SETTINGS_FILES, ...BUILD_FILES].includes(name) && !parts.slice(0, -1).some((part) => SKIPPED_FOLDERS.includes(part))
}

/** The text without the comments of Kotlin and Groovy; strings, which may hold `//`, stay as they are. */
export function withoutComments(text: string): string {
  let result = ''
  let index = 0
  while (index < text.length) {
    const char = text[index]!
    const next = text[index + 1]
    if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
    } else if (char === '/' && next === '*') {
      const end = text.indexOf('*/', index + 2)
      index = end === -1 ? text.length : end + 2
      result += ' '
    } else if (char === '"' || char === "'") {
      const quote = text.startsWith('"""', index) ? '"""' : char
      let end = index + quote.length
      while (end < text.length && !text.startsWith(quote, end)) end += text[end] === '\\' && quote !== '"""' ? 2 : 1
      result += text.slice(index, end + quote.length)
      index = end + quote.length
    } else {
      result += char
      index += 1
    }
  }
  return result
}

/** The text between the bracket at `open` and its pair, or the rest of the text when the pair is missing. */
function enclosed(text: string, open: number): string {
  const [left, right] = text[open] === '(' ? ['(', ')'] : ['{', '}']
  let depth = 0
  for (let index = open; index < text.length; index++) {
    if (text[index] === left) depth += 1
    else if (text[index] === right && --depth === 0) return text.slice(open + 1, index)
  }
  return text.slice(open + 1)
}

/** The bodies of the blocks `name { … }` of a script. */
function blocks(text: string, name: string): string[] {
  return [...text.matchAll(new RegExp(`\\b${name}\\s*\\{`, 'g'))].map((match) => enclosed(text, match.index + match[0].length - 1))
}

const STRING = /"([^"\\]*)"|'([^'\\]*)'/g

const projectPath = (path: string) => (path.startsWith(':') ? path : `:${path}`)

/** The paths of the projects `include` names in settings, and how many `include` name them otherwise than by strings. */
export function settingsIncludes(settings: string): { paths: string[]; skipped: number } {
  const paths: string[] = []
  let skipped = 0
  for (const match of settings.matchAll(/\binclude\b\s*(\()?/g)) {
    let args: string
    if (match[1]) {
      args = enclosed(settings, match.index + match[0].length - 1)
    } else {
      // Groovy without brackets: to the end of the line, and of the next ones after a trailing comma.
      const lines = settings.slice(match.index + match[0].length).split('\n')
      args = lines[0]!
      for (let line = 1; args.trim().endsWith(',') && line < lines.length; line++) args += `\n${lines[line]}`
    }
    const literals = [...args.matchAll(STRING)].map((literal) => literal[1] ?? literal[2]!)
    const rest = args.replace(STRING, '').replace(/[\s,]/g, '')
    if (rest !== '' || literals.length === 0 || literals.some((literal) => literal.includes('$'))) {
      skipped += 1
      continue
    }
    for (const literal of literals) if (!paths.includes(projectPath(literal))) paths.push(projectPath(literal))
  }
  return { paths, skipped }
}

/** Folders of projects that settings move: `project(":x").projectDir = file("path")`. */
function projectFolders(settings: string): Map<string, string> {
  const pattern =
    /project\s*\(\s*["']([^"']+)["']\s*\)\s*\.projectDir\s*=\s*(?:file\s*\(\s*["']([^"']+)["']\s*\)|(?:new\s+)?File\s*\(\s*(?:rootDir|settingsDir)\s*,\s*["']([^"']+)["']\s*\))/g
  return new Map([...settings.matchAll(pattern)].map((match) => [projectPath(match[1]!), (match[2] ?? match[3]!).replace(/^\.\//, '').replace(/\/$/, '')]))
}

/** Identifiers of plugins by the words of the names of aliases of a catalog of versions, e.g. `libs.plugins.spring.boot`. */
const ALIASES: [string, string][] = [
  ['springboot', 'org.springframework.boot'],
  ['kotlinmultiplatform', 'org.jetbrains.kotlin.multiplatform'],
  ['kotlinjvm', 'org.jetbrains.kotlin.jvm'],
  ['kotlinandroid', 'org.jetbrains.kotlin.android'],
  ['androidapplication', 'com.android.application'],
  ['androidlibrary', 'com.android.library'],
  ['quarkus', 'io.quarkus'],
  ['micronaut', 'io.micronaut.application'],
  ['ktor', 'io.ktor.plugin'],
  ['compose', 'org.jetbrains.compose'],
  ['protobuf', 'com.google.protobuf'],
]

const normalized = (name: string) => name.toLowerCase().replace(/[-_.]/g, '')

/** Identifiers of the plugins a build script applies in `plugins { … }` and by `apply plugin:`. */
export function buildPlugins(script: string): string[] {
  const plugins: string[] = []
  const add = (id: string) => !plugins.includes(id) && plugins.push(id)
  for (const body of blocks(script, 'plugins')) {
    for (const match of body.matchAll(/\bkotlin\s*\(\s*["']([\w.-]+)["']\s*\)/g)) add(`org.jetbrains.kotlin.${match[1]}`)
    for (const match of body.matchAll(/\bid\s*\(?\s*["']([\w.-]+)["']/g)) add(match[1]!)
    for (const match of body.matchAll(/`([\w-]+)`/g)) add(match[1]!)
    for (const match of body.matchAll(/(?:^|[\s;{])(java|application|war)(?=\s*(?:$|[;}\n]))/gm)) add(match[1]!)
    for (const match of body.matchAll(/\balias\s*\(\s*libs\.plugins\.([\w.]+)\s*\)/g)) {
      const words = normalized(match[1]!)
      const known = ALIASES.find(([key]) => words.includes(key))
      if (known) add(known[1])
    }
  }
  for (const match of script.matchAll(/\bapply\s*\(?\s*plugin\s*[:=]\s*["']([\w.-]+)["']/g)) add(match[1]!)
  return plugins
}

/** Words that wrap a project in a dependency rather than name its configuration. */
const WRAPPERS = ['platform', 'enforcedPlatform', 'testFixtures', 'project', 'projects']

/**
 * The dependencies on projects in the blocks `dependencies { … }` of a build script: `configuration(project(":x"))`,
 * `configuration project(':x')`, `project(path: ":x")`, with `platform` or `testFixtures` around them, and typesafe
 * accessors `configuration(projects.x)`, which `accessor` turns into paths.
 */
export function buildDependencies(script: string, accessor: (name: string) => string | null): GradleDependency[] {
  const found: GradleDependency[] = []
  const pattern =
    /(?:"(\w+)"|\b(\w+))\s*\(?\s*(?:(?:platform|enforcedPlatform|testFixtures)\s*\(\s*)*(?:project\s*\(\s*(?:path\s*[:=]\s*)?["']([^"']+)["']|projects\.([A-Za-z_][\w.]*\w))/g
  for (const body of blocks(script, 'dependencies')) {
    for (const match of body.matchAll(pattern)) {
      const configuration = match[1] ?? match[2]!
      if (WRAPPERS.includes(configuration)) continue
      const project = match[3] !== undefined ? projectPath(match[3]) : accessor(match[4]!)
      if (project && !found.some((item) => item.configuration === configuration && item.project === project)) found.push({ configuration, project })
    }
  }
  return found
}

/** A file of a chosen folder: its path from the folder, the folder included, and its text. */
export interface FolderFile {
  path: string
  text: string
}

const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)

/**
 * The build in a chosen folder: the projects that its settings include, with the plugins and the dependencies of their
 * build scripts, and the parents of nested projects, which Gradle adds. Throws {@link ApiSpecError} without settings.
 */
export function parseGradleFolder(files: FolderFile[]): GradleBuild {
  const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
  // The settings nearest to the chosen folder; Kotlin DSL wins over Groovy in one folder, as Gradle picks it.
  const settings = files
    .filter((file) => SETTINGS_FILES.includes(nameOf(file.path)))
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length || SETTINGS_FILES.indexOf(nameOf(a.path)) - SETTINGS_FILES.indexOf(nameOf(b.path)))[0]
  if (!settings) {
    throw new ApiSpecError(infraMessages.gradle.noSettings)
  }
  const root = folderOf(settings.path)
  const text = withoutComments(settings.text)
  const { paths, skipped } = settingsIncludes(text)
  const folders = projectFolders(text)
  const rootName = /rootProject\.name\s*=\s*["']([^"']+)["']/.exec(text)?.[1] ?? root.split('/').filter(Boolean).pop() ?? 'root'

  // Gradle adds the parents of nested projects: `:services` of `:services:billing`.
  const all = [':', ...paths]
  for (const path of paths) {
    const parts = path.split(':').slice(1)
    for (let length = 1; length < parts.length; length++) {
      const parent = `:${parts.slice(0, length).join(':')}`
      if (!all.includes(parent)) all.splice(all.indexOf(path), 0, parent)
    }
  }
  const scripts = new Map(
    files
      .filter((file) => file.path.startsWith(root) && BUILD_FILES.includes(nameOf(file.path)))
      // The script of Kotlin DSL goes last in a folder, so that it wins over the one of Groovy.
      .sort((a, b) => Number(a.path.endsWith('.kts')) - Number(b.path.endsWith('.kts')))
      .map((file) => [folderOf(file.path).slice(root.length), withoutComments(file.text)]),
  )
  const accessor = (name: string) =>
    all.find((path) => normalized(path.split(':').slice(1).join('.')) === normalized(name) && path.split(':').length - 1 === name.split('.').length) ?? null
  const projects = all.map((path): GradleProject => {
    const folder = path === ':' ? '' : `${folders.get(path) ?? path.slice(1).replace(/:/g, '/')}/`
    const script = scripts.get(folder) ?? ''
    return {
      path,
      name: path === ':' ? rootName : path.split(':').pop()!,
      plugins: buildPlugins(script),
      dependencies: buildDependencies(script, accessor).filter((dependency) => all.includes(dependency.project)),
    }
  })
  return { projects, skipped }
}
