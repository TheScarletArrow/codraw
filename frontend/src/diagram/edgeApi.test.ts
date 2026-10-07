import { describe, expect, it } from 'vitest'
import {
  apiLabel,
  edgeApiOf,
  EDGE_API_KEY,
  emptyEdgeApi,
  MAX_PARAMETERS,
  MAX_STORED,
  parseEdgeApi,
  pathParameterNames,
  statusClass,
  toOpenApi,
  writeEdgeApi,
  type EdgeApi,
} from './edgeApi.ts'

const PAYMENT: EdgeApi = {
  method: 'POST',
  path: '/payments',
  summary: 'Создать платёж',
  description: 'Идемпотентно по ключу',
  parameters: [
    { name: 'Idempotency-Key', in: 'header', type: 'string', required: true, example: 'a1b2', description: 'Ключ' },
    { name: 'dryRun', in: 'query', type: 'boolean', required: false, example: '', description: '' },
  ],
  requestBody: { contentType: 'application/json', body: '{"amount": 100}' },
  responses: [
    { status: '201', description: 'Создан', contentType: 'application/json', body: '{"id": "p1"}' },
    { status: '409', description: 'Повтор', contentType: '', body: '' },
  ],
}

describe('descriptions of calls of edges', () => {
  it('reads back what it writes', () => {
    expect(parseEdgeApi(writeEdgeApi(PAYMENT))).toEqual(PAYMENT)
    expect(edgeApiOf({ [EDGE_API_KEY]: writeEdgeApi(PAYMENT) })).toEqual(PAYMENT)
  })

  it('stores no empty rows and a path from /', () => {
    const api: EdgeApi = {
      ...emptyEdgeApi(),
      path: ' orders/{id} ',
      parameters: [{ name: ' ', in: 'path', type: '', required: true, example: '', description: '' }],
      requestBody: { contentType: ' ', body: '' },
      responses: [{ status: '', description: 'x', contentType: '', body: '' }],
    }
    expect(parseEdgeApi(writeEdgeApi(api))).toEqual({ ...emptyEdgeApi(), path: '/orders/{id}' })
    expect(apiLabel(api)).toBe('GET /orders/{id}')
  })

  it('reads nothing but a description of its version with a known method', () => {
    for (const value of [
      undefined,
      42,
      'not json',
      '[]',
      'null',
      JSON.stringify({ ...PAYMENT, v: 2 }),
      JSON.stringify({ ...PAYMENT }),
      JSON.stringify({ ...PAYMENT, v: 1, method: 'TRACE' }),
      JSON.stringify({ v: 1, method: 'GET', path: 'x'.repeat(MAX_STORED) }),
    ]) {
      expect(parseEdgeApi(value)).toBeNull()
    }
  })

  it('drops what it does not know and cuts lists to their limits', () => {
    const value = JSON.stringify({
      v: 1,
      method: 'GET',
      path: '/a\n/b',
      script: '<img onerror>',
      parameters: [
        ...Array.from({ length: MAX_PARAMETERS + 5 }, (_, index) => ({ name: `p${index}`, in: 'body', required: 'yes' })),
      ],
      requestBody: 'text',
      responses: [null, 7, { status: 200 }],
    })
    const api = parseEdgeApi(value)!
    expect(api).not.toHaveProperty('script')
    expect(api.path).toBe('/a /b')
    expect(api.parameters).toHaveLength(MAX_PARAMETERS)
    expect(api.parameters[0]).toEqual({ name: 'p0', in: 'query', type: '', required: false, example: '', description: '' })
    expect(api.requestBody).toBeNull()
    expect(api.responses).toEqual([{ status: '', description: '', contentType: '', body: '' }])
  })

  it('names the parameters of a path once each', () => {
    expect(pathParameterNames('/orders/{orderId}/items/{ id }/{orderId}')).toEqual(['orderId', 'id'])
    expect(pathParameterNames('/orders')).toEqual([])
  })

  it('tells the class of a status code', () => {
    expect(['200', '201', '302', '404', '4XX', '503', 'default', '20'].map(statusClass)).toEqual([
      '2xx',
      '2xx',
      '3xx',
      '4xx',
      '4xx',
      '5xx',
      'other',
      'other',
    ])
  })

  it('makes a fragment of OpenAPI 3 of the call', () => {
    expect(toOpenApi(PAYMENT)).toEqual({
      paths: {
        '/payments': {
          post: {
            summary: 'Создать платёж',
            description: 'Идемпотентно по ключу',
            parameters: [
              { name: 'Idempotency-Key', in: 'header', required: true, description: 'Ключ', schema: { type: 'string' }, example: 'a1b2' },
              { name: 'dryRun', in: 'query', schema: { type: 'boolean' } },
            ],
            requestBody: { content: { 'application/json': { example: { amount: 100 } } } },
            responses: {
              201: { description: 'Создан', content: { 'application/json': { example: { id: 'p1' } } } },
              409: { description: 'Повтор' },
            },
          },
        },
      },
    })
    const bare = toOpenApi({ ...emptyEdgeApi(), path: '/orders/{id}', parameters: [{ name: 'id', in: 'path', type: '', required: false, example: '', description: '' }] })
    expect(bare).toEqual({
      paths: {
        '/orders/{id}': {
          get: {
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { default: { description: 'Ответ' } },
          },
        },
      },
    })
  })
})
