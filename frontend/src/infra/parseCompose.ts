import { ApiSpecError, loadDocument, type ApiSource } from '../apiSpec/loadDocument.ts'
import { infraMessages } from './messages.tsx'

/** How a service is built from sources: the directory of the build and the Dockerfile in it, when it is not the default. */
export interface ComposeBuild {
  context: string
  dockerfile: string | null
}

/** A service of docker-compose, with what a diagram shows of it; values have their variables substituted. */
export interface ComposeService {
  name: string
  image: string | null
  build: ComposeBuild | null
  /** Services this one depends on: `depends_on`. */
  dependsOn: string[]
  /** Services of `links`, without their aliases. */
  links: string[]
  /** The service whose network this one shares: `network_mode: service:name`. */
  networkService: string | null
  /** The networks of the service in the order of the file; none is the network `default`. */
  networks: string[]
  /** Other names of the service in its networks: `aliases`. */
  aliases: string[]
  containerName: string | null
  hostname: string | null
  /** Published ports, e.g. `8080` or `8000-8010`; a port of the container alone is not published. */
  ports: string[]
  /** Environment variables with values; a variable without a value takes it from the host and is left out. */
  environment: [string, string][]
}

/** Services a project adds at most: more would not fit a page that people read. */
export const MAX_SERVICES = 300

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A scalar of YAML as text: ports and variables are often numbers or booleans. */
const scalar = (value: unknown): string | null =>
  typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : null

/** The value of `${...}` without its braces: a default for an unset variable, or the variable itself. */
function expand(inner: string): string {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)(:?[-?+])?([\s\S]*)$/.exec(inner)
  if (!match) return `\${${inner}}`
  const [, name, operator, rest] = match
  return operator === '-' || operator === ':-' ? interpolate(rest!) : `\${${name}}`
}

/**
 * Text with the variables of compose substituted as far as the file tells them: `${NAME:-x}` and `${NAME-x}` become
 * `x` (which may hold variables too), `${NAME}`, `$NAME`, `${NAME:?error}` and `${NAME:+x}` become `${NAME}`, `$$` is `$`.
 */
export function interpolate(text: string): string {
  let result = ''
  let index = 0
  while (index < text.length) {
    const char = text[index]!
    if (char !== '$') {
      result += char
      index += 1
      continue
    }
    const next = text[index + 1]
    if (next === '$') {
      result += '$'
      index += 2
    } else if (next === '{') {
      let depth = 1
      let end = index + 2
      for (; end < text.length && depth > 0; end++) {
        if (text[end] === '{') depth += 1
        else if (text[end] === '}') depth -= 1
      }
      // A brace that is never closed is not a variable.
      if (depth > 0) return result + text.slice(index)
      result += expand(text.slice(index + 2, end - 1))
      index = end
    } else {
      const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(index + 1))?.[0]
      result += name ? `\${${name}}` : '$'
      index += 1 + (name?.length ?? 0)
    }
  }
  return result
}

/** Names of a list, or keys of a map: the two forms of `depends_on` and `networks`. */
const names = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((item) => scalar(item) ?? []) : isObject(value) ? Object.keys(value) : []

/** The published port of an entry of `ports`, or `null` for a port of the container alone. */
export function publishedPort(entry: unknown): string | null {
  if (isObject(entry)) {
    const published = scalar(entry.published)
    return published ? interpolate(published) : null
  }
  const text = scalar(entry)
  // A number is a port of the container alone.
  if (text === null || typeof entry === 'number') return null
  // An address of IPv6 is in brackets; the protocol follows a slash.
  const parts = interpolate(text)
    .replace(/\/\w+$/, '')
    .replace(/^\[[^\]]*\]:/, '')
    .split(':')
  const published = parts.length === 2 ? parts[0] : parts.length === 3 ? parts[1] : undefined
  return published ? published : null
}

function environment(value: unknown): [string, string][] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const text = scalar(item)
      const equals = text?.indexOf('=') ?? -1
      return text && equals > 0 ? [[text.slice(0, equals), interpolate(text.slice(equals + 1))] as [string, string]] : []
    })
  }
  if (!isObject(value)) return []
  return Object.entries(value).flatMap(([key, item]) => {
    const text = scalar(item)
    return text === null ? [] : [[key, interpolate(text)] as [string, string]]
  })
}

function build(value: unknown): ComposeBuild | null {
  const text = scalar(value)
  if (text) return { context: interpolate(text), dockerfile: null }
  if (!isObject(value)) return null
  const dockerfile = scalar(value.dockerfile)
  return { context: interpolate(scalar(value.context) ?? '.'), dockerfile: dockerfile ? interpolate(dockerfile) : null }
}

function service(name: string, value: unknown): ComposeService {
  const fields = isObject(value) ? value : {}
  const image = scalar(fields.image)
  const networkMode = scalar(fields.network_mode)
  const containerName = scalar(fields.container_name)
  const hostname = scalar(fields.hostname)
  const networks = fields.networks
  return {
    name,
    image: image ? interpolate(image) : null,
    build: build(fields.build),
    dependsOn: names(fields.depends_on),
    links: names(fields.links).map((link) => link.split(':')[0]!),
    networkService: networkMode?.startsWith('service:') ? networkMode.slice('service:'.length) : null,
    networks: names(networks),
    aliases: isObject(networks) ? Object.values(networks).flatMap((network) => (isObject(network) ? names(network.aliases) : [])) : [],
    containerName: containerName ? interpolate(containerName) : null,
    hostname: hostname ? interpolate(hostname) : null,
    ports: Array.isArray(fields.ports) ? fields.ports.flatMap((port) => publishedPort(port) ?? []) : [],
    environment: environment(fields.environment),
  }
}

/**
 * The services of a docker-compose file in its order. Throws {@link ApiSpecError} for a file that does not parse or
 * has no section `services`.
 */
export async function parseCompose(source: ApiSource): Promise<ComposeService[]> {
  const root = await loadDocument(source)
  if (!isObject(root) || !isObject(root.services)) {
    throw new ApiSpecError(infraMessages.compose.notCompose(source.name))
  }
  return Object.entries(root.services).map(([name, value]) => service(name, value))
}

const union = (first: string[], second: string[]) => [...new Set([...first, ...second])]

/** A service of a later file over the same service of an earlier one, as `docker compose -f a.yml -f b.yml` merges them. */
function merge(base: ComposeService, over: ComposeService): ComposeService {
  const variables = new Map(base.environment)
  for (const [key, value] of over.environment) variables.set(key, value)
  return {
    name: base.name,
    image: over.image ?? base.image,
    build: over.build ?? base.build,
    dependsOn: union(base.dependsOn, over.dependsOn),
    links: union(base.links, over.links),
    networkService: over.networkService ?? base.networkService,
    networks: union(base.networks, over.networks),
    aliases: union(base.aliases, over.aliases),
    containerName: over.containerName ?? base.containerName,
    hostname: over.hostname ?? base.hostname,
    ports: union(base.ports, over.ports),
    environment: [...variables],
  }
}

/** The services of the files merged in their order: a service of a later file changes the service of the same name. */
export function mergeCompose(files: ComposeService[][]): ComposeService[] {
  const services = new Map<string, ComposeService>()
  for (const file of files) {
    for (const item of file) {
      const known = services.get(item.name)
      services.set(item.name, known ? merge(known, item) : item)
    }
  }
  return [...services.values()]
}

/** The services of the files merged in their order, and the errors of those that cannot be imported. */
export async function parseComposeFiles(sources: ApiSource[]): Promise<{ services: ComposeService[]; errors: string[] }> {
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        return { services: await parseCompose(source), error: null }
      } catch (error) {
        if (error instanceof ApiSpecError) return { services: null, error: error.message }
        throw error
      }
    }),
  )
  return {
    services: mergeCompose(results.flatMap((result) => (result.services ? [result.services] : []))),
    errors: results.flatMap((result) => (result.error !== null ? [result.error] : [])),
  }
}
