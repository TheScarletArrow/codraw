import { describe, expect, it } from 'vitest'
import { fieldName, parseApiSpec, parseApiSpecs, pointer, typeName, type ApiModel, type ApiSpec } from './parseApiSpec.ts'
import {
  ACCOUNT_ASYNCAPI_YAML,
  BILLING_ASYNCAPI_YAML,
  ORDERS_ASYNCAPI_YAML,
  PETSTORE_JSON,
  PETSTORE_YAML,
  STORE_YAML,
  SWAGGER_YAML,
} from './testDocuments.ts'

const parse = (text: string, name = 'api.yaml') => parseApiSpec({ name, text })

const model = (spec: ApiSpec, name: string): ApiModel => {
  const found = spec.models.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`No model ${name}`)
  return found
}

/** The fields of a model as the text of the fields of its table writes them. */
const fields = (spec: ApiSpec, name: string) =>
  model(spec, name).fields.map((field) => [field.name, field.type, field.notNull ? 'NOT NULL' : ''].filter(Boolean).join(' '))

describe('parseApiSpec: OpenAPI', () => {
  it('reads the service, its endpoints in the order of the document and the models they take and return', async () => {
    const spec = await parse(PETSTORE_YAML, 'petstore.yaml')

    expect(spec).toMatchObject({ kind: 'openapi', source: 'petstore.yaml', title: 'Petstore', channels: [], operations: [], skippedRefs: 0 })
    expect(spec.endpoints).toEqual([
      { method: 'GET', path: '/pets', models: ['Pet', 'Error'] },
      { method: 'POST', path: '/pets', models: ['Pet', 'Error'] },
      { method: 'GET', path: '/pets/{petId}', models: ['Pet', 'Error'] },
    ])
    // `Pets` is an array: an alias, not a table.
    expect(spec.models.map((candidate) => candidate.name)).toEqual(['Pet', 'Error'])
    expect(fields(spec, 'Pet')).toEqual(['id integer(int64) NOT NULL', 'name string NOT NULL', 'tag string'])
    expect(fields(spec, 'Error')).toEqual(['code integer(int32) NOT NULL', 'message string NOT NULL'])
  })

  it('reads OpenAPI 3.1 in JSON with arrays of models, a model in a model and null among the types', async () => {
    const spec = await parse(PETSTORE_JSON, 'petstore.json')

    expect(spec.title).toBe('Pet Store')
    expect(spec.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`)).toEqual(['GET /pets/{petId}', 'DELETE /pets/{petId}'])
    expect(fields(spec, 'Pet')).toEqual([
      'id integer(int64) NOT NULL',
      'name string NOT NULL',
      'category Category NOT NULL',
      'tags Tag[]',
      'photoUrls string(uri)[]',
      'status string',
    ])
    const references = Object.fromEntries(model(spec, 'Pet').fields.map((field) => [field.name, field.references]))
    expect(references.category).toEqual([{ model: 'Category', cardinality: 'one' }])
    expect(references.tags).toEqual([{ model: 'Tag', cardinality: 'zero-or-more' }])
    expect(references.photoUrls).toEqual([])
    expect(model(spec, 'Category').fields.find((field) => field.name === 'parent')?.references).toEqual([
      { model: 'Category', cardinality: 'zero-or-one' },
    ])
  })

  it('reads the same models from YAML and from JSON', async () => {
    const json = JSON.stringify(await import('yaml').then(({ parse: parseYaml }) => parseYaml(PETSTORE_YAML)))

    const [fromYaml, fromJson] = await Promise.all([parse(PETSTORE_YAML, 'petstore.yaml'), parse(json, 'petstore.json')])

    expect({ ...fromJson, source: '' }).toEqual({ ...fromYaml, source: '' })
  })

  it('writes types of formats, arrays, maps, compositions and nulls, and refers to models through all of them', async () => {
    const spec = await parse(STORE_YAML)

    expect(fields(spec, 'Order')).toEqual([
      'id string(uuid) NOT NULL',
      'items LineItem[] NOT NULL',
      'customer Customer NOT NULL',
      'coupon Coupon',
      'status Status',
      'note string',
      'metadata map[string, string]',
      'price Money',
      'x-trace-id string',
    ])
    const references = Object.fromEntries(model(spec, 'Order').fields.map((field) => [field.name, field.references]))
    expect(references).toMatchObject({
      items: [{ model: 'LineItem', cardinality: 'one-or-more' }],
      customer: [{ model: 'Customer', cardinality: 'one' }],
      coupon: [{ model: 'Coupon', cardinality: 'zero-or-one' }],
      status: [],
      price: [],
    })
    expect(spec.endpoints).toEqual([{ method: 'POST', path: '/orders', models: ['Order'] }])
  })

  it('makes models of allOf, oneOf and anyOf with their bases, and does not loop on references in a loop', async () => {
    const spec = await parse(STORE_YAML)

    expect(model(spec, 'GiftOrder')).toEqual({
      name: 'GiftOrder',
      fields: [{ name: 'message', type: 'string', notNull: true, references: [] }],
      bases: [{ model: 'Order', kind: 'allOf' }],
    })
    expect(model(spec, 'Payment')).toEqual({
      name: 'Payment',
      fields: [],
      bases: [
        { model: 'Card', kind: 'oneOf' },
        { model: 'Transfer', kind: 'oneOf' },
      ],
    })
    // Aliases of each other are no models; a field that refers to them gets the name.
    expect(spec.models.map((candidate) => candidate.name)).not.toContain('Loop1')
    expect(fields(spec, 'Broken')).toEqual(['missing Nowhere', 'loop Loop1'])
  })

  it('makes a model of a composition of a model that comes later, and none of a composition of a string', async () => {
    const spec = await parse(
      [
        'openapi: 3.0.3',
        'components:',
        '  schemas:',
        "    Admin: {allOf: [{$ref: '#/components/schemas/UserRef'}]}",
        "    Id: {allOf: [{$ref: '#/components/schemas/Uuid'}]}",
        '    Uuid: {type: string, format: uuid}',
        "    UserRef: {$ref: '#/components/schemas/User'}",
        '    User:',
        '      required: [id, manager, deputy]',
        '      properties:',
        "        id: {$ref: '#/components/schemas/Id'}",
        "        manager: {allOf: [{$ref: '#/components/schemas/User'}], nullable: true}",
        "        deputy: {allOf: [{$ref: '#/components/schemas/User'}], description: Who stands in}",
      ].join('\n'),
    )

    expect(spec.models.map((candidate) => candidate.name)).toEqual(['Admin', 'User'])
    expect(model(spec, 'Admin').bases).toEqual([{ model: 'User', kind: 'allOf' }])
    // `allOf` of one reference with `nullable` is the way of OpenAPI 3.0 to let a reference be null.
    expect(fields(spec, 'User')).toEqual(['id Id NOT NULL', 'manager User', 'deputy User NOT NULL'])
  })

  it('counts the distinct references out of the document and to nothing in it as skipped', async () => {
    const spec = await parse(STORE_YAML)

    // `./common.yaml#/…` and `#/components/schemas/Nowhere`.
    expect(spec.skippedRefs).toBe(2)
  })

  it('reads Swagger 2.0: models of definitions, bodies of requests as parameters', async () => {
    const spec = await parse(SWAGGER_YAML)

    expect(spec.title).toBe('Users')
    expect(spec.endpoints).toEqual([
      { method: 'GET', path: '/users', models: ['User'] },
      { method: 'POST', path: '/users', models: ['NewUser'] },
    ])
    expect(fields(spec, 'User')).toEqual(['id integer(int64)', 'name string'])
  })

  it('takes the name of the file for a service without a title, and a version given as a number', async () => {
    const spec = await parse('openapi: 3.1\npaths:\n  /health:\n    get: {}\n', 'health.yaml')

    expect(spec.title).toBe('health')
    expect(spec.endpoints).toEqual([{ method: 'GET', path: '/health', models: [] }])
  })

  it('follows references of path items and stops at a loop of them', async () => {
    const spec = await parse(
      [
        'openapi: 3.1.0',
        'paths:',
        "  /a: {$ref: '#/components/pathItems/A'}",
        "  /b: {$ref: '#/paths/~1c'}",
        "  /c: {$ref: '#/paths/~1b'}",
        'components:',
        '  pathItems:',
        '    A: {get: {}, put: {}, summary: not a method}',
      ].join('\n'),
    )

    expect(spec.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`)).toEqual(['GET /a', 'PUT /a'])
  })

  it('does not loop on anchors of YAML that hold themselves', async () => {
    const spec = await parse(
      [
        'openapi: 3.0.0',
        'components:',
        '  schemas:',
        '    Node:',
        '      properties: &node',
        '        name: {type: string}',
        '        child:',
        '          type: object',
        '          properties: *node',
        '        children:',
        '          type: array',
        '          items:',
        '            properties: *node',
      ].join('\n'),
    )

    expect(fields(spec, 'Node')).toEqual(['name string', 'child object', 'children object[]'])
  })
})

describe('parseApiSpec: AsyncAPI', () => {
  it('reads subscribe of AsyncAPI 2 as sending and publish as receiving, with the names of the messages', async () => {
    const spec = await parse(ACCOUNT_ASYNCAPI_YAML)

    expect(spec).toMatchObject({ kind: 'asyncapi', title: 'Account Service', endpoints: [] })
    expect(spec.operations).toEqual([
      { channel: 'user/signedup', action: 'send', label: 'UserSignedUp' },
      { channel: 'user/deleted', action: 'receive', label: 'UserDeleted' },
      { channel: 'user/events', action: 'receive', label: 'UserSignedUp, userRenamed' },
    ])
    // The payload of Avro is no model; the inline payload of `UserDeleted` is one, named after its message.
    expect(spec.channels).toEqual([
      { address: 'user/signedup', models: ['User'] },
      { address: 'user/deleted', models: ['UserDeleted'] },
      { address: 'user/events', models: ['User'] },
    ])
    expect(fields(spec, 'UserDeleted')).toEqual(['userId string'])
    expect(spec.models.map((candidate) => candidate.name)).toEqual(['User', 'UserDeleted'])
  })

  it('reads operations of AsyncAPI 3 with their actions, channels by reference and addresses', async () => {
    const orders = await parse(ORDERS_ASYNCAPI_YAML)
    const billing = await parse(BILLING_ASYNCAPI_YAML)

    // A channel without an address is named by its key.
    expect(orders.channels).toEqual([
      { address: 'orders.created', models: ['OrderCreatedPayload'] },
      { address: 'orderEvents', models: [] },
    ])
    expect(orders.operations).toEqual([{ channel: 'orders.created', action: 'send', label: 'OrderCreated' }])
    // Without messages of its own the operation has those of the channel; a schema may come with its format.
    expect(billing.operations).toEqual([
      { channel: 'orders.created', action: 'receive', label: 'OrderCreated' },
      { channel: 'invoices.issued', action: 'send', label: 'InvoiceIssued' },
    ])
    expect(billing.channels[0]).toEqual({ address: 'orders.created', models: ['OrderCreatedPayload'] })
    expect(fields(billing, 'InvoiceIssued')).toEqual(['invoiceId string'])
  })

  it('finds a channel of AsyncAPI 3 kept among the components once, by its reference from the channels and the operation', async () => {
    const spec = await parse(
      [
        'asyncapi: 3.0.0',
        'info: {title: Audit}',
        'channels:',
        "  log: {$ref: '#/components/channels/log'}",
        'operations:',
        "  write: {action: send, channel: {$ref: '#/channels/log'}}",
        'components:',
        '  channels:',
        '    log: {address: audit.log, messages: {AuditEntry: {payload: {type: string}}}}',
      ].join('\n'),
    )

    expect(spec.channels).toEqual([{ address: 'audit.log', models: [] }])
    expect(spec.operations).toEqual([{ channel: 'audit.log', action: 'send', label: 'AuditEntry' }])
  })

  it('labels an operation of AsyncAPI 2 without named messages by its id, and skips channels by reference out of the file', async () => {
    const spec = await parse(
      [
        'asyncapi: "2.0.0"',
        'info: {title: Audit}',
        'channels:',
        '  audit.log:',
        '    subscribe:',
        '      operationId: writeAudit',
        '      message: {payload: {type: string}}',
        "  other: {$ref: 'other.yaml#/channels/other'}",
      ].join('\n'),
    )

    expect(spec.operations).toEqual([{ channel: 'audit.log', action: 'send', label: 'writeAudit' }])
    expect(spec.skippedRefs).toBe(1)
  })

  it('names a model of a payload apart from a schema of the same name', async () => {
    const spec = await parse(
      [
        'asyncapi: 3.0.0',
        'info: {title: A}',
        'channels:',
        '  c:',
        '    messages:',
        '      Event: {payload: {properties: {id: {type: string}}}}',
        'components:',
        '  schemas:',
        '    Event: {properties: {at: {type: string, format: date-time}}}',
      ].join('\n'),
    )

    expect(spec.models.map((candidate) => candidate.name)).toEqual(['Event', 'EventPayload'])
    expect(fields(spec, 'Event')).toEqual(['at string(date-time)'])
  })
})

describe('parseApiSpec: what is not imported', () => {
  it('tells what CoDraw reads for other documents and versions', async () => {
    await expect(parse('title: notes\n', 'notes.yaml')).rejects.toThrow(
      'notes.yaml: это не OpenAPI и не AsyncAPI — нет поля openapi, swagger или asyncapi',
    )
    await expect(parse('')).rejects.toThrow('это не OpenAPI и не AsyncAPI')
    await expect(parse('- a\n- b\n')).rejects.toThrow('это не OpenAPI и не AsyncAPI')
    await expect(parse('swagger: "1.2"\n')).rejects.toThrow('api.yaml: Swagger 1.2 не поддерживается — CoDraw читает OpenAPI 3, Swagger 2.0 и AsyncAPI 2 и 3')
    await expect(parse('openapi: 4.0.0\n')).rejects.toThrow('OpenAPI 4.0.0 не поддерживается')
    await expect(parse('asyncapi: 1.2.0\n')).rejects.toThrow('AsyncAPI 1.2.0 не поддерживается')
  })

  it('parses all documents and gives the errors of those that cannot be imported', async () => {
    const result = await parseApiSpecs([
      { name: 'petstore.yaml', text: PETSTORE_YAML },
      { name: 'broken.yaml', text: 'openapi: 3.0.0\ninfo:\n  title: A\n title: B\n' },
      { name: 'Текст', text: ACCOUNT_ASYNCAPI_YAML },
    ])

    expect(result.specs.map((spec) => spec.title)).toEqual(['Petstore', 'Account Service'])
    expect(result.errors).toEqual([expect.stringMatching(/^broken\.yaml: строка 4, столбец \d+ — /)])
  })
})

describe('names in fields', () => {
  it('quotes a name only when the text of the field would not parse', () => {
    expect(fieldName('petId')).toBe('petId')
    expect(fieldName('_links')).toBe('_links')
    expect(fieldName('x-trace-id')).toBe('"x-trace-id"')
    expect(fieldName('@type')).toBe('"@type"')
    expect(fieldName('say "hi"')).toBe('"say ""hi"""')
  })

  it('quotes a type whose words would end the type of a field', () => {
    expect(typeName('Pet')).toBe('Pet')
    expect(typeName('pet.Pet')).toBe('pet.Pet')
    expect(typeName('Pet-Response')).toBe('Pet-Response')
    expect(typeName('Default')).toBe('"Default"')
    expect(typeName('Not-Null')).toBe('"Not-Null"')
    expect(typeName('a--b')).toBe('"a--b"')
    expect(typeName('Pet Response')).toBe('"Pet Response"')
  })
})

describe('pointer', () => {
  it('follows a JSON Pointer with escapes and stops outside the document', () => {
    const root = { paths: { '/a/{id}': { get: 1 } }, 'x~y': [10, 20] }

    expect(pointer(root, '#/paths/~1a~1%7Bid%7D/get')).toBe(1)
    expect(pointer(root, '#/x~0y/1')).toBe(20)
    expect(pointer(root, '#')).toBe(root)
    expect(pointer(root, '#/missing')).toBeUndefined()
    expect(pointer(root, 'other.yaml#/paths')).toBeUndefined()
    expect(pointer(root, '#/paths/%E0%A4%A')).toBeUndefined()
  })
})
