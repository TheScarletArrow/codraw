import type { Cardinality } from '../mermaid/parseMermaid.ts'
import { FIELD_WORDS } from '../sql/tableField.ts'
import { protocol } from '../infra/addresses.ts'
import { ApiSpecError, loadDocument, type ApiSource } from './loadDocument.ts'
import { apiSpecMessages } from './messages.ts'

/** A model that a field refers to, and how many of it the field holds. */
export interface ApiReference {
  model: string
  cardinality: Cardinality
}

/** A property of a model as a field of a table: `name type [NOT NULL]`. */
export interface ApiField {
  name: string
  type: string
  notNull: boolean
  references: ApiReference[]
}

/** A model that a model is made of (`allOf`) or may be (`oneOf`, `anyOf`). */
export interface ApiBase {
  model: string
  kind: Composition
}

/** A schema of data that becomes a table. */
export interface ApiModel {
  name: string
  fields: ApiField[]
  bases: ApiBase[]
}

/** An operation of OpenAPI on a path, with the models it takes and returns. */
export interface ApiEndpoint {
  /** In upper case, e.g. `GET`. */
  method: string
  path: string
  models: string[]
}

/** A channel of AsyncAPI, with the models of its messages. */
export interface ApiChannel {
  address: string
  models: string[]
}

/** What the application of an AsyncAPI document does with a channel: sends messages to it or receives them from it. */
export interface ApiOperation {
  /** The address of the channel. */
  channel: string
  action: 'send' | 'receive'
  /** The names of the messages, or the id of the operation without them. */
  label: string
}

/** What a document of OpenAPI, Swagger or AsyncAPI describes, as far as a diagram shows it. */
export interface ApiSpec {
  kind: 'openapi' | 'asyncapi'
  /** The name of the source, e.g. of its file. */
  source: string
  /** The service: the title of the API or of the application. */
  title: string
  /** The first paragraph of the description of the API or the application, 500 characters at most. */
  description?: string
  /** The protocols of the servers of a document of AsyncAPI, as people write them: `Kafka`, `AMQP`, `MQTT`. */
  protocols?: string[]
  endpoints: ApiEndpoint[]
  channels: ApiChannel[]
  operations: ApiOperation[]
  models: ApiModel[]
  /** Distinct `$ref` that lead out of the document (other files, addresses) or to nothing in it. */
  skippedRefs: number
}

type Composition = 'allOf' | 'oneOf' | 'anyOf'
type Json = Record<string, unknown>

const COMPOSITIONS: Composition[] = ['allOf', 'oneOf', 'anyOf']
/** Methods of a path item: those of OpenAPI 3.x (`query` since 3.2) and Swagger 2.0. */
const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'])
/** How deep references and nested schemas are followed. */
const MAX_DEPTH = 32
/** Schemas described per document, each once: a walk that would go on regardless stops. */
const MAX_STEPS = 1_000_000

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const refOf = (value: unknown): string | null => (isObject(value) && typeof value.$ref === 'string' ? value.$ref : null)
const entries = (value: unknown): [string, unknown][] => (isObject(value) ? Object.entries(value) : [])
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const unique = <T,>(values: T[]): T[] => [...new Set(values)]

/** A string or a number as text, `null` for anything else or blank text. */
function text(value: unknown): string | null {
  if (typeof value === 'number') return String(value)
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** The value a local reference `#/a/b` points to in the document; `undefined` for any other reference or a missing place. */
export function pointer(root: unknown, ref: string): unknown {
  if (!ref.startsWith('#')) return undefined
  const path = ref.slice(1)
  if (path === '') return root
  if (!path.startsWith('/')) return undefined
  let current = root
  for (const raw of path.slice(1).split('/')) {
    let segment = raw
    try {
      segment = decodeURIComponent(raw)
    } catch {
      // A `%` that encodes nothing stays as written.
    }
    segment = segment.replaceAll('~1', '/').replaceAll('~0', '~')
    if (Array.isArray(current) && /^\d+$/.test(segment)) current = current[Number(segment)]
    else if (isObject(current) && Object.hasOwn(current, segment)) current = current[segment]
    else return undefined
  }
  return current
}

/** The last name of a reference: `./pet.yaml` → `pet`, `#/components/schemas/Pet` → `Pet`. */
function lastName(ref: string): string {
  const name = ref.split(/[/#]/).filter(Boolean).pop() ?? ''
  return name.replace(/\.(ya?ml|json)$/i, '')
}

/** A word of a field that its parser reads as a whole: letters, digits, `_` and `$`. */
const WORD = /^[A-Za-z_\u0080-￿][\w$\u0080-￿]*$/

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`

/** The name of a property as the text of a field writes it: in double quotes only when the field would not parse. */
export function fieldName(name: string): string {
  return WORD.test(name) ? name : quote(name)
}

/** The name of a model as the type of a field: in double quotes when its words would end the type, e.g. `Default`. */
export function typeName(name: string): string {
  const plain =
    /^[A-Za-z_\u0080-￿][\w$.\u0080-￿-]*$/.test(name) &&
    !name.includes('--') &&
    name.split(/[^\w$\u0080-￿]+/).every((word) => !FIELD_WORDS.has(word.toUpperCase()))
  return plain ? name : quote(name)
}

/** A type made of others in parentheses, so that `[]` applies to all of it. */
const grouped = (type: string) => (type.includes(' ') ? `(${type})` : type)

/** A model that a schema refers to, as {@link describe} finds it. */
interface Target {
  model: string
  /** An array or a map holds it. */
  many: boolean
  /** An array with `minItems` of 1 or more holds it. */
  atLeastOne: boolean
  /** One of several models of `oneOf` or `anyOf`. */
  alternative: boolean
}

/** The type of a schema as a field shows it, and the models it refers to. */
interface Described {
  type: string
  targets: Target[]
  /** The schema allows `null`: `nullable` of OpenAPI 3.0, `null` among the types of OpenAPI 3.1. */
  nullable: boolean
}

const ANY: Described = { type: 'any', targets: [], nullable: false }

/** The type of a JSON value of `enum` or `const`. */
function valueType(value: unknown): string {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return 'any'
}

/** How many of a model a field holds: many for arrays and maps, one when the field is required and not one of several. */
function cardinality(target: Target, notNull: boolean): Cardinality {
  if (target.many) return target.atLeastOne ? 'one-or-more' : 'zero-or-more'
  return notNull && !target.alternative ? 'one' : 'zero-or-one'
}

/**
 * A document with the schemas of its models: follows its local references, describes schemas as types of fields and
 * finds the models that schemas refer to.
 */
class SpecDocument {
  readonly root: Json
  /** Schemas of `components.schemas` or `definitions`, by name. */
  readonly schemas: Map<string, unknown>
  /** Names of the schemas that become tables. */
  readonly modelNames = new Set<string>()
  /** Models of the document, by name, in the order of the schemas, then of the messages. */
  readonly models = new Map<string, ApiModel>()
  private readonly prefix: string
  private readonly described = new WeakMap<object, Described>()
  /** Schemas and aliases being described, against loops of references. */
  private readonly describing = new Set<unknown>()
  private steps = 0
  /** Models of inline payloads of messages, by the payload. */
  private readonly payloadModels = new WeakMap<object, string>()

  constructor(root: Json, schemasPath: string[]) {
    this.root = root
    let schemas: unknown = root
    for (const key of schemasPath) schemas = isObject(schemas) ? schemas[key] : undefined
    this.schemas = new Map(entries(schemas).map(([name, schema]) => [name, unwrapSchema(schema)]))
    this.prefix = `#/${schemasPath.join('/')}/`
    // A schema composed of a model is a model too, which takes another round when the model comes later.
    for (let grown = true; grown; ) {
      grown = false
      for (const [name, schema] of this.schemas) {
        if (this.modelNames.has(name) || !this.isModel(schema)) continue
        this.modelNames.add(name)
        grown = true
      }
    }
    for (const [name, schema] of this.schemas) if (this.modelNames.has(name)) this.models.set(name, this.model(name, schema as Json))
  }

  /** Whether a schema becomes a table: it has properties, or is composed of a model or of properties. */
  isModel(schema: unknown): boolean {
    if (!isObject(schema) || refOf(schema) !== null) return false
    const composed = (keyword: Composition) => list(schema[keyword]).some((part) => hasProperties(part) || this.namesModel(refOf(part)))
    return hasProperties(schema) || COMPOSITIONS.some(composed)
  }

  /** Whether a reference names a model, also through schemas that are only references to others. */
  private namesModel(ref: string | null): boolean {
    const seen = new Set<string>()
    for (let name = ref === null ? null : this.schemaName(ref); name !== null && !seen.has(name); ) {
      if (this.modelNames.has(name)) return true
      seen.add(name)
      const next = refOf(this.schemas.get(name))
      name = next === null ? null : this.schemaName(next)
    }
    return false
  }

  /** The value with its references followed within the document; `undefined` for a reference out of it, to nothing or in a loop. */
  deref(value: unknown): unknown {
    const seen = new Set<string>()
    let current = value
    for (let ref = refOf(current); ref !== null; ref = refOf(current)) {
      if (seen.has(ref) || seen.size >= MAX_DEPTH) return undefined
      seen.add(ref)
      current = pointer(this.root, ref)
    }
    return current
  }

  /** The schema a reference names among `components.schemas` or `definitions`, e.g. `Pet` of `#/components/schemas/Pet`. */
  schemaName(ref: string): string | null {
    if (!ref.startsWith(this.prefix)) return null
    const rest = ref.slice(this.prefix.length)
    if (rest.includes('/')) return null
    const name = decodeName(rest)
    return this.schemas.has(name) ? name : null
  }

  /** The type of a schema as a field shows it and the models it refers to; see {@link Described}. */
  describe(schema: unknown, depth = 0): Described {
    if (!isObject(schema) || depth > MAX_DEPTH || this.describing.has(schema)) return ANY
    const known = this.described.get(schema)
    if (known) return known
    if (++this.steps > MAX_STEPS) return ANY
    this.describing.add(schema)
    try {
      const described = this.describeSchema(schema, depth)
      this.described.set(schema, described)
      return described
    } finally {
      this.describing.delete(schema)
    }
  }

  /** The models a schema leads to, deep into its inline schemas up to the first model on each way. */
  referencedModels(schema: unknown, into = new Set<string>(), seen = new Set<object>(), depth = 0): Set<string> {
    if (!isObject(schema) || seen.has(schema) || depth > MAX_DEPTH) return into
    seen.add(schema)
    const ref = refOf(schema)
    if (ref !== null) {
      const name = this.schemaName(ref)
      if (name !== null && this.modelNames.has(name)) return into.add(name)
      return this.referencedModels(name !== null ? this.schemas.get(name) : pointer(this.root, ref), into, seen, depth + 1)
    }
    for (const nested of [schema.items, schema.additionalProperties, ...entries(schema.properties).map(([, value]) => value)]) {
      this.referencedModels(nested, into, seen, depth + 1)
    }
    for (const keyword of COMPOSITIONS) for (const part of list(schema[keyword])) this.referencedModels(part, into, seen, depth + 1)
    return into
  }

  /**
   * The models of the payload of a message: those it refers to, or, for a payload with properties of its own, a model
   * named after the message (with `Payload` when a schema has that name). A payload of another schema format, e.g. Avro,
   * has none.
   */
  messageModels(message: Json, name: string | null): string[] {
    let format = text(message.schemaFormat)
    let payload = message.payload
    if (isObject(payload) && 'schemaFormat' in payload && 'schema' in payload) {
      format = text(payload.schemaFormat)
      payload = payload.schema
    }
    if (format !== null && !/asyncapi|json|openapi/i.test(format)) return []
    if (this.isModel(payload) && name !== null) return [this.payloadModel(payload as Json, name)]
    return [...this.referencedModels(payload)]
  }

  private payloadModel(payload: Json, name: string): string {
    const known = this.payloadModels.get(payload)
    if (known !== undefined) return known
    let modelName = name
    for (let suffix = 1; this.schemas.has(modelName) || this.models.has(modelName); suffix++) {
      modelName = `${name}Payload${suffix > 1 ? suffix : ''}`
    }
    this.payloadModels.set(payload, modelName)
    this.models.set(modelName, this.model(modelName, payload))
    return modelName
  }

  private describeSchema(schema: Json, depth: number): Described {
    const ref = refOf(schema)
    if (ref !== null) return this.describeReference(ref, depth)
    for (const keyword of COMPOSITIONS) {
      const parts = list(schema[keyword]).map((part) => this.describe(part, depth + 1))
      if (parts.length === 0) continue
      const typed = parts.filter((part) => part.type !== 'null' && part.type !== 'any')
      const types = unique(typed.map((part) => part.type))
      const alternative = keyword !== 'allOf' && typed.length > 1
      // A value of allOf is null only when all its typed parts allow it; of oneOf and anyOf, when any part does.
      const nullable =
        keyword === 'allOf'
          ? typed.length > 0 && typed.every((part) => part.nullable)
          : parts.some((part) => part.type === 'null' || part.nullable)
      return {
        type: types.length === 0 ? 'any' : types.map(types.length > 1 ? grouped : (type) => type).join(keyword === 'allOf' ? ' & ' : ' | '),
        targets: typed.flatMap((part) => part.targets.map((target) => (alternative ? { ...target, alternative } : target))),
        nullable: schema.nullable === true || nullable,
      }
    }
    const declared = typeof schema.type === 'string' ? [schema.type] : list(schema.type).filter((type) => typeof type === 'string')
    const nullable = schema.nullable === true || declared.includes('null')
    const types = (declared as string[]).filter((type) => type !== 'null')
    if (declared.length > 0 && types.length === 0) return { type: 'null', targets: [], nullable: true }
    if (types.length > 1) return { type: types.join(' | '), targets: [], nullable }
    const type = types[0] ?? inferredType(schema)
    if (type === 'array') {
      const item = schema.items === undefined ? ANY : this.describe(schema.items, depth + 1)
      const atLeastOne = Number(schema.minItems) >= 1
      return {
        type: `${grouped(item.type)}[]`,
        targets: item.targets.map((target) => ({ ...target, many: true, atLeastOne: target.many ? target.atLeastOne : atLeastOne })),
        nullable,
      }
    }
    if (type === 'object') {
      if (isObject(schema.properties) || !isObject(schema.additionalProperties)) return { type: 'object', targets: [], nullable }
      const value = this.describe(schema.additionalProperties, depth + 1)
      const targets = value.targets.map((target) => ({ ...target, many: true, atLeastOne: false }))
      // Not `map<…>`: the text of a field drops what looks like a tag of HTML.
      return { type: `map[string, ${value.type}]`, targets, nullable }
    }
    const format = text(schema.format)
    const typed = format !== null && /^[\w.-]+$/.test(format) && !format.includes('--') && type !== 'any' ? `${type}(${format})` : type
    return { type: typed, targets: [], nullable }
  }

  /** A model by its name; an alias by its name, with the models it leads to; another place by what is there. */
  private describeReference(ref: string, depth: number): Described {
    const name = this.schemaName(ref)
    if (name !== null && this.modelNames.has(name)) {
      return { type: typeName(name), targets: [{ model: name, many: false, atLeastOne: false, alternative: false }], nullable: false }
    }
    if (name !== null) {
      const alias = this.describe(this.schemas.get(name), depth + 1)
      return { type: typeName(name), targets: alias.targets, nullable: alias.nullable }
    }
    const target = pointer(this.root, ref)
    if (target !== undefined) return this.describe(target, depth + 1)
    return { type: typeName(lastName(ref) || 'any'), targets: [], nullable: false }
  }

  /** The model a reference leads to: the model it names, or the only model of the alias it names. */
  private modelBehind(ref: string): string | null {
    const name = this.schemaName(ref)
    if (name === null) return null
    if (this.modelNames.has(name)) return name
    const targets = this.describe(this.schemas.get(name)).targets
    return targets.length === 1 ? targets[0]!.model : null
  }

  /**
   * A model: a field per property of the schema and of the inline parts of its `allOf`, in the order of the document;
   * models of `allOf`, `oneOf` and `anyOf` as its bases.
   */
  private model(name: string, schema: Json): ApiModel {
    const properties: [string, unknown][] = []
    const required = new Set<string>()
    const bases: ApiBase[] = []
    const seen = new Set<object>()
    const collect = (part: Json, depth: number) => {
      if (seen.has(part) || depth > MAX_DEPTH) return
      seen.add(part)
      for (const property of list(part.required)) if (typeof property === 'string') required.add(property)
      for (const [property, value] of entries(part.properties)) {
        if (!properties.some(([known]) => known === property)) properties.push([property, value])
      }
      for (const kind of COMPOSITIONS) {
        for (const item of list(part[kind])) {
          const ref = refOf(item)
          const base = ref === null ? null : this.modelBehind(ref)
          if (base !== null && !bases.some((known) => known.model === base && known.kind === kind)) bases.push({ model: base, kind })
          if (ref === null && kind === 'allOf' && isObject(item)) collect(item, depth + 1)
        }
      }
    }
    collect(schema, 0)
    const fields = properties.map(([property, value]): ApiField => {
      const described = this.describe(value)
      const notNull = required.has(property) && !described.nullable
      const references = described.targets.map((target) => ({ model: target.model, cardinality: cardinality(target, notNull) }))
      return {
        name: property,
        type: described.type,
        notNull,
        references: references.filter((reference, index) => references.findIndex((other) => other.model === reference.model) === index),
      }
    })
    return { name, fields, bases }
  }
}

/** A name of a JSON Pointer: `%`-decoded, then `~1` → `/` and `~0` → `~`. */
function decodeName(segment: string): string {
  let name = segment
  try {
    name = decodeURIComponent(segment)
  } catch {
    // Kept as written.
  }
  return name.replaceAll('~1', '/').replaceAll('~0', '~')
}

/** A schema of AsyncAPI 3 may come with its format, `{ schemaFormat, schema }`: the schema itself, if it is JSON Schema. */
function unwrapSchema(schema: unknown): unknown {
  if (!isObject(schema) || !('schemaFormat' in schema) || !('schema' in schema)) return schema
  return /asyncapi|json|openapi/i.test(String(schema.schemaFormat)) ? schema.schema : undefined
}

/** A schema with properties of its own. */
const hasProperties = (schema: unknown) => isObject(schema) && isObject(schema.properties) && Object.keys(schema.properties).length > 0

/** The type of a schema without `type`: from what it has. */
function inferredType(schema: Json): string {
  if (isObject(schema.properties) || isObject(schema.additionalProperties)) return 'object'
  if (schema.items !== undefined) return 'array'
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return valueType(schema.enum.find((value) => value !== null))
  if ('const' in schema) return valueType(schema.const)
  return 'any'
}

/** Distinct `$ref` of the document that lead out of it or to nothing in it. */
function skippedReferences(root: unknown): number {
  const skipped = new Set<string>()
  const seen = new Set<object>()
  const stack: unknown[] = [root]
  while (stack.length > 0) {
    const value = stack.pop()
    if (typeof value !== 'object' || value === null || seen.has(value)) continue
    seen.add(value)
    const children = Array.isArray(value) ? value : Object.values(value)
    for (const child of children) stack.push(child)
    const ref = refOf(value)
    if (ref !== null && pointer(root, ref) === undefined) skipped.add(ref)
  }
  return skipped.size
}

/** The models of the bodies of the requests and the responses of an operation of OpenAPI 3.x or Swagger 2.0. */
function operationModels(document: SpecDocument, operation: Json, pathItem: Json): string[] {
  const models = new Set<string>()
  const seen = new Set<object>()
  const add = (schema: unknown) => document.referencedModels(schema, models, seen)
  const fromContent = (holder: unknown) => {
    const resolved = document.deref(holder)
    if (!isObject(resolved)) return
    add(resolved.schema)
    for (const [, media] of entries(resolved.content)) if (isObject(media)) add(media.schema)
  }
  fromContent(operation.requestBody)
  for (const parameter of [...list(pathItem.parameters), ...list(operation.parameters)]) {
    const resolved = document.deref(parameter)
    if (isObject(resolved) && resolved.in === 'body') add(resolved.schema)
  }
  for (const [, response] of entries(operation.responses)) fromContent(response)
  return [...models]
}

function openApi(root: Json, source: string, swagger: boolean): ApiSpec {
  const document = new SpecDocument(root, swagger ? ['definitions'] : ['components', 'schemas'])
  const endpoints: ApiEndpoint[] = []
  for (const [path, item] of entries(root.paths)) {
    const pathItem = document.deref(item)
    if (!isObject(pathItem)) continue
    for (const [method, operation] of entries(pathItem)) {
      if (!METHODS.has(method)) continue
      const models = operationModels(document, isObject(operation) ? operation : {}, pathItem)
      endpoints.push({ method: method.toUpperCase(), path, models })
    }
  }
  return {
    kind: 'openapi',
    source,
    title: titleOf(root, source),
    description: descriptionOf(root),
    endpoints,
    channels: [],
    operations: [],
    models: [...document.models.values()],
    skippedRefs: skippedReferences(root),
  }
}

/** A message of AsyncAPI with its name: `name`, `messageId`, the key it is kept under, `title`. */
interface Message {
  name: string | null
  models: string[]
}

function message(document: SpecDocument, value: unknown, key: string | null): Message | null {
  const resolved = document.deref(value)
  if (!isObject(resolved)) return null
  const ref = refOf(value)
  const name = text(resolved.name) ?? text(resolved.messageId) ?? key ?? (ref !== null ? lastName(ref) : null) ?? text(resolved.title)
  return { name, models: document.messageModels(resolved, name) }
}

/** The label of an operation: the names of its messages, or its id. */
function operationLabel(messages: Message[], id: string | null): string {
  const names = unique(messages.map((item) => item.name).filter((name) => name !== null))
  return names.length > 0 ? names.join(', ') : (id ?? '')
}

/**
 * A document of AsyncAPI 2.x. Its operations are described from the side of a client: `subscribe` is what the
 * application sends to the channel, `publish` is what it receives from it.
 */
function asyncApi2(root: Json, source: string): ApiSpec {
  const document = new SpecDocument(root, ['components', 'schemas'])
  const channels: ApiChannel[] = []
  const operations: ApiOperation[] = []
  for (const [address, item] of entries(root.channels)) {
    const channel = document.deref(item)
    const models = new Set<string>()
    for (const [key, action] of [
      ['subscribe', 'send'],
      ['publish', 'receive'],
    ] as const) {
      const operation = isObject(channel) ? document.deref(channel[key]) : undefined
      if (!isObject(operation)) continue
      const resolved = document.deref(operation.message)
      const parts = isObject(resolved) && Array.isArray(resolved.oneOf) ? resolved.oneOf : [operation.message]
      const messages = parts.map((part) => message(document, part, null)).filter((item) => item !== null)
      for (const item of messages) item.models.forEach((model) => models.add(model))
      operations.push({ channel: address, action, label: operationLabel(messages, text(operation.operationId)) })
    }
    channels.push({ address, models: [...models] })
  }
  return asyncSpec(root, source, document, channels, operations)
}

/** A document of AsyncAPI with its channels and operations; the models of messages are among those of the document. */
function asyncSpec(root: Json, source: string, document: SpecDocument, channels: ApiChannel[], operations: ApiOperation[]): ApiSpec {
  const models = [...document.models.values()]
  const skippedRefs = skippedReferences(root)
  return {
    kind: 'asyncapi',
    source,
    title: titleOf(root, source),
    description: descriptionOf(root),
    protocols: protocolsOf(root),
    endpoints: [],
    channels,
    operations,
    models,
    skippedRefs,
  }
}

/** A document of AsyncAPI 3.x: channels with an address and messages, operations that `send` or `receive` on a channel. */
function asyncApi3(root: Json, source: string): ApiSpec {
  const document = new SpecDocument(root, ['components', 'schemas'])
  const channels: ApiChannel[] = []
  const known = new Map<object, { channel: ApiChannel; messages: Message[] }>()
  /** A channel by its object: its address, or the key it is kept under when it has none («unknown»). */
  const channelOf = (value: Json, key: string) => {
    const existing = known.get(value)
    if (existing) return existing
    const messages = entries(value.messages)
      .map(([name, item]) => message(document, item, name))
      .filter((item) => item !== null)
    const channel = { address: text(value.address) ?? key, models: unique(messages.flatMap((item) => item.models)) }
    channels.push(channel)
    const entry = { channel, messages }
    known.set(value, entry)
    return entry
  }
  for (const [key, item] of entries(root.channels)) {
    const value = document.deref(item)
    if (isObject(value)) channelOf(value, key)
  }
  const operations: ApiOperation[] = []
  for (const [id, item] of entries(root.operations)) {
    const operation = document.deref(item)
    if (!isObject(operation) || (operation.action !== 'send' && operation.action !== 'receive')) continue
    // The channel of an operation is always a reference, maybe to a reference to a channel among the components.
    const ref = refOf(operation.channel)
    const value = document.deref(operation.channel)
    if (ref === null || !isObject(value)) continue
    const { channel, messages: channelMessages } = channelOf(value, lastName(ref))
    const listed = list(operation.messages).map((part) => message(document, part, null))
    const messages = listed.length > 0 ? listed.filter((part) => part !== null) : channelMessages
    operations.push({ channel: channel.address, action: operation.action, label: operationLabel(messages, id) })
  }
  return asyncSpec(root, source, document, channels, operations)
}

/** The title of the API or the application, else the name of the file without its extension. */
function titleOf(root: Json, source: string): string {
  return text(isObject(root.info) ? root.info.title : undefined) ?? source.replace(/\.(ya?ml|json)$/i, '')
}

/** The longest description of a service that the import keeps. */
const MAX_DESCRIPTION = 500

/** The first paragraph of `info.description`, in one line, at most {@link MAX_DESCRIPTION} characters; `''` without one. */
function descriptionOf(root: Json): string {
  const description = text(isObject(root.info) ? root.info.description : undefined) ?? ''
  const paragraph = description.split(/\n\s*\n/)[0]!.replace(/\s+/g, ' ').trim()
  return paragraph.length > MAX_DESCRIPTION ? `${paragraph.slice(0, MAX_DESCRIPTION - 1)}…` : paragraph
}

/** The protocols of the servers of a document of AsyncAPI, each once: `kafka` and `kafka-secure` are Kafka. */
function protocolsOf(root: Json): string[] {
  return unique(
    entries(root.servers)
      .map(([, server]) => text(isObject(server) ? server.protocol : undefined))
      .filter((name): name is string => name !== null)
      .map((name) => protocol(name.replace(/-secure$/i, ''))),
  )
}

/** The version of a document as text: YAML reads `asyncapi: 2.6` without quotes as a number. */
const versionOf = (value: unknown) => text(value) ?? ''

/**
 * What a document of OpenAPI 3.x, Swagger 2.0 or AsyncAPI 2.x or 3.x describes. Throws {@link ApiSpecError} for a
 * document that does not parse, that is none of them, or of a version CoDraw does not read.
 */
export async function parseApiSpec(source: ApiSource): Promise<ApiSpec> {
  const root = await loadDocument(source)
  const { name } = source
  if (isObject(root)) {
    if ('openapi' in root) {
      const version = versionOf(root.openapi)
      if (/^3(\.|$)/.test(version)) return openApi(root, name, false)
      throw new ApiSpecError(apiSpecMessages.unsupportedVersion(name, 'OpenAPI', version))
    }
    if ('swagger' in root) {
      const version = versionOf(root.swagger)
      if (/^2(\.|$)/.test(version)) return openApi(root, name, true)
      throw new ApiSpecError(apiSpecMessages.unsupportedVersion(name, 'Swagger', version))
    }
    if ('asyncapi' in root) {
      const version = versionOf(root.asyncapi)
      if (/^2(\.|$)/.test(version)) return asyncApi2(root, name)
      if (/^3(\.|$)/.test(version)) return asyncApi3(root, name)
      throw new ApiSpecError(apiSpecMessages.unsupportedVersion(name, 'AsyncAPI', version))
    }
  }
  throw new ApiSpecError(apiSpecMessages.notApiSpec(name))
}

/** What the documents describe, in their order, and the errors of those that cannot be imported. */
export async function parseApiSpecs(sources: ApiSource[]): Promise<{ specs: ApiSpec[]; errors: string[] }> {
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        return { spec: await parseApiSpec(source), error: null }
      } catch (error) {
        if (error instanceof ApiSpecError) return { spec: null, error: error.message }
        throw error
      }
    }),
  )
  return {
    specs: results.flatMap((result) => (result.spec ? [result.spec] : [])),
    errors: results.flatMap((result) => (result.error !== null ? [result.error] : [])),
  }
}
