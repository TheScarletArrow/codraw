import { ApiSpecError, loadDocument, MAX_DOCUMENT_SIZE, type ApiSource } from '../apiSpec/loadDocument.ts'

/** The largest file read: a plan holds every resource four times — before, after, in the state and in the configuration. */
export const MAX_TERRAFORM_SIZE = 4 * MAX_DOCUMENT_SIZE

/**
 * Attributes of resources that a diagram shows and that are no secrets, in the order the description lists them.
 * Nothing else is read: the names of the secrets of providers cannot be foreseen, the names a diagram needs can.
 */
export const SAFE_ATTRIBUTES = [
  'name',
  'bucket',
  'identifier',
  'function_name',
  'cluster_name',
  'domain_name',
  'engine',
  'engine_version',
  'database_version',
  'runtime',
  'image',
  'kubernetes_version',
  'version',
  'instance_type',
  'instance_class',
  'node_type',
  'machine_type',
  'vm_size',
  'size',
  'sku_name',
  'tier',
  'platform_id',
  'load_balancer_type',
  'internal',
  'cidr_block',
  'ip_cidr_range',
  'port',
  'protocol',
  'region',
  'location',
  'availability_zone',
  'zone',
  'allocated_storage',
  'multi_az',
  'desired_count',
  'min_size',
  'max_size',
] as const

/** The longest value read: longer ones are documents, keys and certificates rather than what a diagram shows. */
const MAX_VALUE_LENGTH = 120

/** A managed resource of the configuration, with all its instances. */
export interface TerraformResource {
  /** Its address in the configuration, without keys of instances: `module.app.aws_instance.web`. */
  address: string
  /** The names of the module calls it is in, from the root: `['app']`. */
  module: string[]
  type: string
  name: string
  /** The provider without its registry: `hashicorp/aws`. */
  provider: string | null
  /** Instances of `count` and `for_each`, in all the instances of its modules. */
  instances: number
  /** The safe attributes of its first instance that are not marked sensitive, as `[name, value]`. */
  attributes: [string, string][]
  /** The addresses of the resources of the file it depends on, through data sources. */
  dependsOn: string[]
}

/** What one output of `terraform show -json` holds for a diagram. */
export interface TerraformStack {
  /** The name of its file, or «Текст». */
  name: string
  resources: TerraformResource[]
  /** Dependencies on addresses the file does not have, as `[resource, dependency]`. */
  missing: [string, string][]
  /** New resources of a plan with references to `local.*`, which the plan does not show. */
  locals: string[]
  /** Resources the plan deletes, which are not drawn. */
  deleted: string[]
  /** The plan ended with an error, and may lack resources. */
  errored: boolean
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const record = (value: unknown): Record<string, unknown> => (isObject(value) ? value : {})
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const texts = (value: unknown): string[] => list(value).flatMap((item) => text(item) ?? [])

/** The names of a traversal without its keys: `module.app["eu"].aws_instance.web[0].id` is module, app, aws_instance, web, id. */
export function traversal(address: string): string[] {
  return Array.from(address.matchAll(/\[(?:"(?:[^"\\]|\\.)*"|[^\]]*)\]|([^.[\]]+)/g), (match) => match[1]).filter(
    (name): name is string => name !== undefined,
  )
}

/** The module calls the names of an address start with, and the rest: `module.a.module.b.aws_x.y` is [a, b] and [aws_x, y]. */
function splitModule(names: string[]): { module: string[]; rest: string[] } {
  const module: string[] = []
  let at = 0
  while (names[at] === 'module' && names[at + 1] !== undefined) {
    module.push(names[at + 1]!)
    at += 2
  }
  return { module, rest: names.slice(at) }
}

/** The address of a module: `module.app.module.db`. */
export const moduleAddress = (module: string[]) => module.map((name) => `module.${name}`).join('.')

/** The address of a resource in the configuration: `module.app.aws_instance.web`, `data.aws_ami.ubuntu`. */
const addressOf = (module: string[], data: boolean, type: string, name: string) =>
  [moduleAddress(module), data ? 'data' : '', type, name].filter(Boolean).join('.')

/** The address in the configuration of the resource that an address of a resource or an instance names, from `from`. */
function resourceOf(address: string, from: string[] = []): string | null {
  const { module, rest } = splitModule(traversal(address))
  const path = [...from, ...module]
  if (rest[0] === 'data') return rest.length >= 3 ? addressOf(path, true, rest[1]!, rest[2]!) : null
  return rest.length >= 2 ? addressOf(path, false, rest[0]!, rest[1]!) : null
}

const isData = (address: string) => splitModule(traversal(address)).rest[0] === 'data'

/** The provider without its registry: `registry.terraform.io/hashicorp/aws` is `hashicorp/aws`. */
function shortProvider(provider: string | null): string | null {
  if (!provider) return null
  const parts = provider.split('/')
  return parts.length === 3 && parts[0]!.includes('.') ? parts.slice(1).join('/') : provider
}

/** An instance of a resource in the values of a state or of a plan. */
interface Instance {
  /** The address of the instance: `module.app["eu"].aws_instance.web[0]`. */
  instance: string
  address: string
  module: string[]
  data: boolean
  type: string
  name: string
  provider: string | null
  values: Record<string, unknown>
  /** `sensitive_values`: `true` where a value is sensitive. */
  sensitive: unknown
  dependsOn: string[]
}

/** The instances of the resources of a module of values and of its child modules, in their order. */
function instancesOf(module: unknown, found: Instance[] = []): Instance[] {
  const fields = record(module)
  const path = splitModule(traversal(text(fields.address) ?? '')).module
  for (const item of list(fields.resources)) {
    const resource = record(item)
    const type = text(resource.type)
    const name = text(resource.name)
    if (!type || !name) continue
    const data = resource.mode === 'data'
    const address = addressOf(path, data, type, name)
    found.push({
      instance: text(resource.address) ?? address,
      address,
      module: path,
      data,
      type,
      name,
      provider: shortProvider(text(resource.provider_name)),
      values: record(resource.values),
      sensitive: resource.sensitive_values,
      dependsOn: texts(resource.depends_on).flatMap((dependency) => resourceOf(dependency) ?? []),
    })
  }
  for (const child of list(fields.child_modules)) instancesOf(child, found)
  return found
}

/** A value is marked sensitive, or holds one that is. */
const marked = (value: unknown): boolean =>
  value === true || (Array.isArray(value) ? value.some(marked) : isObject(value) && Object.values(value).some(marked))

/** The safe attributes of values that no marker of sensitive values marks. */
function safeAttributes(values: Record<string, unknown>, markers: unknown[]): [string, string][] {
  return SAFE_ATTRIBUTES.flatMap((attribute): [string, string][] => {
    if (markers.some((marker) => marker === true || marked(record(marker)[attribute]))) return []
    const value = values[attribute]
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return []
    const shown = String(value)
    return shown === '' || shown.length > MAX_VALUE_LENGTH || /[\r\n]/.test(shown) ? [] : [[attribute, shown]]
  })
}

/** A module of the configuration of a plan: what its resources, module calls and outputs refer to. */
interface ConfigModule {
  /** By `type.name` or `data.type.name`. */
  resources: Map<string, { expressions: unknown; dependsOn: string[] }>
  calls: Map<string, { inputs: Record<string, unknown>; dependsOn: string[]; module: ConfigModule }>
  outputs: Map<string, { expression: unknown; dependsOn: string[] }>
}

function configModule(value: unknown): ConfigModule {
  const fields = record(value)
  const resources: ConfigModule['resources'] = new Map()
  for (const item of list(fields.resources)) {
    const resource = record(item)
    const type = text(resource.type)
    const name = text(resource.name)
    if (!type || !name) continue
    resources.set(`${resource.mode === 'data' ? 'data.' : ''}${type}.${name}`, {
      expressions: [resource.expressions, resource.count_expression, resource.for_each_expression],
      dependsOn: texts(resource.depends_on),
    })
  }
  const calls: ConfigModule['calls'] = new Map(
    Object.entries(record(fields.module_calls)).map(([name, item]) => {
      const call = record(item)
      return [name, { inputs: record(call.expressions), dependsOn: texts(call.depends_on), module: configModule(call.module) }]
    }),
  )
  const outputs: ConfigModule['outputs'] = new Map(
    Object.entries(record(fields.outputs)).map(([name, item]) => [name, { expression: record(item).expression, dependsOn: texts(record(item).depends_on) }]),
  )
  return { resources, calls, outputs }
}

/** The references of expressions: every list of `references`, but none in a constant value, which is not read at all. */
function referencesOf(expression: unknown, found: string[] = []): string[] {
  if (Array.isArray(expression)) for (const item of expression) referencesOf(item, found)
  else if (isObject(expression)) {
    for (const [key, value] of Object.entries(expression)) {
      if (key === 'constant_value') continue
      if (key === 'references') found.push(...texts(value))
      else referencesOf(value, found)
    }
  }
  return found
}

/** Roots of references that name no resource: ephemeral resources live only while Terraform runs, and are in no state. */
const NO_RESOURCE = ['each', 'count', 'path', 'self', 'terraform', 'ephemeral', 'action']

/** What the expressions of a resource lead to: resources and data sources, and whether one went through `local.*`. */
interface Found {
  addresses: Set<string>
  local: boolean
  seen: Set<string>
}

/** The dependencies the configuration of a plan gives its resources and data sources, through modules. */
class ConfigDependencies {
  private readonly root: ConfigModule

  constructor(root: ConfigModule) {
    this.root = root
  }

  private moduleAt(path: string[]): ConfigModule | null {
    let module: ConfigModule | null = this.root
    for (const name of path) module = module?.calls.get(name)?.module ?? null
    return module
  }

  /** The managed resources of a module and of its child modules. */
  private resourcesIn(path: string[], found: Found) {
    const module = this.moduleAt(path)
    if (!module) return
    for (const key of module.resources.keys()) if (!key.startsWith('data.')) found.addresses.add(`${moduleAddress(path)}${path.length > 0 ? '.' : ''}${key}`)
    for (const name of module.calls.keys()) this.resourcesIn([...path, name], found)
  }

  /** Follows references of the module at `path`: to resources, through variables of the module and outputs of its calls. */
  private follow(path: string[], references: string[], found: Found) {
    for (const reference of references) {
      const seen = `${moduleAddress(path)}\n${reference}`
      if (found.seen.has(seen)) continue
      found.seen.add(seen)
      const names = traversal(reference)
      const [first, second, third] = names
      if (first === 'var') {
        const call = path.length > 0 && second ? this.moduleAt(path.slice(0, -1))?.calls.get(path.at(-1)!) : undefined
        if (call) this.follow(path.slice(0, -1), referencesOf(call.inputs[second!]), found)
      } else if (first === 'local') {
        found.local = true
      } else if (first === 'module' && second) {
        const call = this.moduleAt(path)?.calls.get(second)
        if (!call) continue
        const outputs = third !== undefined ? [call.module.outputs.get(third)] : [...call.module.outputs.values()]
        for (const output of outputs) {
          if (!output) continue
          this.follow([...path, second], referencesOf(output.expression), found)
          this.dependOn([...path, second], output.dependsOn, found)
        }
      } else if (first === 'data') {
        if (second && third) found.addresses.add(addressOf(path, true, second, third))
      } else if (first && second && !NO_RESOURCE.includes(first)) {
        found.addresses.add(addressOf(path, false, first, second))
      }
    }
  }

  /** Follows `depends_on` of the module at `path`: `module.x` there is every resource of the module. */
  private dependOn(path: string[], items: string[], found: Found) {
    for (const item of items) {
      const names = traversal(item)
      if (names[0] === 'module' && names.length === 2) this.resourcesIn([...path, names[1]!], found)
      else this.follow(path, [item], found)
    }
  }

  /** The dependencies of every resource and data source of the configuration, by address. */
  all(): Map<string, { addresses: Set<string>; local: boolean }> {
    const result = new Map<string, { addresses: Set<string>; local: boolean }>()
    const visit = (path: string[], module: ConfigModule, inherited: { path: string[]; dependsOn: string[] }[]) => {
      for (const [key, resource] of module.resources) {
        const found: Found = { addresses: new Set(), local: false, seen: new Set() }
        this.follow(path, referencesOf(resource.expressions), found)
        this.dependOn(path, resource.dependsOn, found)
        // `depends_on` of a module call holds back everything inside the module.
        for (const call of inherited) this.dependOn(call.path, call.dependsOn, found)
        result.set(`${moduleAddress(path)}${path.length > 0 ? '.' : ''}${key}`, { addresses: found.addresses, local: found.local })
      }
      for (const [name, call] of module.calls) visit([...path, name], call.module, [...inherited, { path, dependsOn: call.dependsOn }])
    }
    visit([], this.root, [])
    return result
  }
}

/** Configuration of Terraform in HCL: a block of the top level. */
const HCL = /^\s*(resource|data|module|provider|terraform|variable|output|locals)\b[^\n]*\{\s*$/m
/** Keys of the top level of configuration of Terraform in JSON, `*.tf.json`. */
const CONFIG_KEYS = ['resource', 'data', 'module', 'provider', 'terraform', 'variable', 'output', 'locals']

function fail(source: ApiSource, message: string): never {
  throw new ApiSpecError(`${source.name}: ${message}`)
}

/**
 * What the output of `terraform show -json` of a state or a saved plan holds for a diagram. Throws
 * {@link ApiSpecError} for configuration, a file of state, a binary plan, a file that does not parse, JSON that is no
 * output of `terraform show -json` and an output without managed resources.
 */
export async function parseTerraform(source: ApiSource): Promise<TerraformStack> {
  const content = source.text.replace(/^﻿/, '')
  const json = /^\s*[{[]/.test(content)
  if (content.startsWith('PK')) fail(source, 'это двоичный файл плана — выполните terraform show -json для него и откройте результат')
  if (!json && (/\.tf$/i.test(source.name) || HCL.test(content))) {
    fail(source, 'это конфигурация Terraform — сохраните план или состояние командой terraform show -json')
  }
  const document = record(await loadDocument(source, MAX_TERRAFORM_SIZE))
  if (typeof document.format_version !== 'string') {
    if (typeof document.version === 'number' && Array.isArray(document.resources)) {
      fail(source, 'это файл состояния — выполните terraform show -json и откройте результат')
    }
    if (CONFIG_KEYS.some((key) => key in document)) fail(source, 'это конфигурация Terraform — сохраните план или состояние командой terraform show -json')
    fail(source, 'это не вывод terraform show -json — нет format_version')
  }

  const plan = 'planned_values' in document || 'resource_changes' in document || 'configuration' in document
  const current = instancesOf(record(plan ? document.planned_values : document.values).root_module)
  const prior = plan ? instancesOf(record(record(document.prior_state).values).root_module) : []
  const changes = list(document.resource_changes).map(record)
  const afterSensitive = new Map(
    changes.flatMap((change): [string, unknown][] => (text(change.address) ? [[text(change.address)!, record(change.change).after_sensitive]] : [])),
  )

  const managed = new Map<string, Instance[]>()
  for (const instance of current) {
    if (instance.data) continue
    managed.set(instance.address, [...(managed.get(instance.address) ?? []), instance])
  }
  if (managed.size === 0) fail(source, 'в файле нет ресурсов')

  const known = new Set([...current, ...prior].map((instance) => instance.address))
  const direct = new Map<string, Set<string>>()
  const depend = (address: string, dependencies: Iterable<string>) => {
    const set = direct.get(address) ?? new Set()
    for (const dependency of dependencies) set.add(dependency)
    direct.set(address, set)
  }
  for (const instance of [...current, ...prior]) depend(instance.address, instance.dependsOn)
  const withLocals = new Set<string>()
  if (isObject(document.configuration)) {
    const configured = new ConfigDependencies(configModule(document.configuration.root_module)).all()
    for (const [address, { addresses, local }] of configured) {
      known.add(address)
      depend(address, addresses)
      if (local) withLocals.add(address)
    }
  }

  /** The resources a resource depends on, through data sources, which are not drawn. */
  const dependencies = (address: string): string[] => {
    const result = new Set<string>()
    const visited = new Set([address])
    const walk = (from: string) => {
      for (const dependency of direct.get(from) ?? []) {
        if (visited.has(dependency)) continue
        visited.add(dependency)
        if (isData(dependency)) walk(dependency)
        else result.add(dependency)
      }
    }
    walk(address)
    return [...result]
  }

  const missing: [string, string][] = []
  const priorAddresses = new Set(prior.map((instance) => instance.address))
  const resources = [...managed].map(([address, instances]): TerraformResource => {
    const first = instances[0]!
    const resolved = dependencies(address)
    for (const dependency of resolved) if (!known.has(dependency)) missing.push([address, dependency])
    return {
      address,
      module: first.module,
      type: first.type,
      name: first.name,
      provider: first.provider,
      instances: instances.length,
      attributes: safeAttributes(first.values, [first.sensitive, afterSensitive.get(first.instance)]),
      dependsOn: resolved.filter((dependency) => managed.has(dependency)),
    }
  })
  const deleted = [
    ...new Set(
      changes.flatMap((change) => {
        const actions = texts(record(change.change).actions)
        const address = change.mode === 'data' ? null : resourceOf(text(change.address) ?? '')
        return actions.length === 1 && actions[0] === 'delete' && address && !managed.has(address) ? [address] : []
      }),
    ),
  ]
  return {
    name: source.name,
    resources,
    missing,
    locals: resources.filter((resource) => withLocals.has(resource.address) && !priorAddresses.has(resource.address)).map((resource) => resource.address),
    deleted,
    errored: document.errored === true,
  }
}

/**
 * An error of the parse without its message, which may quote the file, for the log of errors: its name and the frames of
 * its stack.
 */
function withoutMessage(error: unknown): Error {
  const safe = new Error('Terraform output could not be parsed')
  if (!(error instanceof Error)) return safe
  safe.name = error.name
  const frames = (error.stack ?? '').split('\n').filter((line) => /^\s+at\s/.test(line) || /^[^\s@]*@\S+:\d+:\d+$/.test(line))
  safe.stack = [`${safe.name}: ${safe.message}`, ...frames].join('\n')
  return safe
}

/** The stacks of the files in their order, and the errors of those that cannot be imported. */
export async function parseTerraformFiles(sources: ApiSource[]): Promise<{ stacks: TerraformStack[]; errors: string[] }> {
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        return { stack: await parseTerraform(source), error: null }
      } catch (error) {
        if (error instanceof ApiSpecError) return { stack: null, error: error.message }
        throw withoutMessage(error)
      }
    }),
  )
  return {
    stacks: results.flatMap((result) => (result.stack ? [result.stack] : [])),
    errors: results.flatMap((result) => (result.error !== null ? [result.error] : [])),
  }
}
