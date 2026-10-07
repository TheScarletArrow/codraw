import type { StyleValue } from './model.ts'

/**
 * The style key of the description of the HTTP call an edge stands for: a string of JSON (see {@link writeEdgeApi}). Like
 * the link, files of draw.io carry it as an attribute of the `<object>` around the cell rather than in its style, whose
 * `;` and `=` the JSON would break.
 */
export const EDGE_API_KEY = 'codrawApi'

/** The version of the stored description; another one, e.g. of a later CoDraw, is not read. */
const VERSION = 1

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

/** Where a parameter goes, as OpenAPI 3 names it. */
export const PARAMETER_LOCATIONS = ['path', 'query', 'header', 'cookie'] as const
export type ParameterLocation = (typeof PARAMETER_LOCATIONS)[number]

export const LOCATION_LABELS: Record<ParameterLocation, string> = {
  path: 'путь',
  query: 'запрос',
  header: 'заголовок',
  cookie: 'cookie',
}

/** A parameter of the call, as `parameters` of an operation of OpenAPI 3 has it. */
export interface ApiParameter {
  name: string
  in: ParameterLocation
  type: string
  required: boolean
  example: string
  description: string
}

/** A request or response body: its media type and an example or a schema of it, as text. */
export interface ApiBody {
  contentType: string
  body: string
}

/** A response by its status code, e.g. `200`, `4XX` or `default`. */
export interface ApiResponse extends ApiBody {
  status: string
  description: string
}

/** The HTTP call an edge stands for, in the terms of an operation of OpenAPI 3. */
export interface EdgeApi {
  method: HttpMethod
  path: string
  summary: string
  description: string
  parameters: ApiParameter[]
  /** `null` without a body. */
  requestBody: ApiBody | null
  responses: ApiResponse[]
}

/** Limits of what a description keeps: more is cut, an edge is not a whole API. */
export const MAX_PARAMETERS = 100
export const MAX_RESPONSES = 50
const MAX_TEXT = 2_000
const MAX_BODY = 20_000
/** A stored value longer than this is not read at all. */
export const MAX_STORED = 64 * 1024

export const emptyEdgeApi = (): EdgeApi => ({
  method: 'GET',
  path: '/',
  summary: '',
  description: '',
  parameters: [],
  requestBody: null,
  responses: [],
})

export const emptyParameter = (location: ParameterLocation = 'query'): ApiParameter => ({
  name: '',
  in: location,
  type: 'string',
  required: location === 'path',
  example: '',
  description: '',
})

export const isHttpMethod = (value: unknown): value is HttpMethod => (HTTP_METHODS as readonly unknown[]).includes(value)

const text = (value: unknown, limit = MAX_TEXT): string => (typeof value === 'string' ? value.slice(0, limit) : '')
const line = (value: unknown, limit = MAX_TEXT): string => text(value, limit).replace(/[\r\n]+/g, ' ').trim()
const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : []

function readBody(value: unknown): ApiBody | null {
  if (typeof value !== 'object' || value === null) return null
  const body = value as Record<string, unknown>
  return { contentType: line(body.contentType, 200), body: text(body.body, MAX_BODY) }
}

/**
 * Reads the description of an edge from its stored value, which may come from anyone who writes the document or a file:
 * `null` for anything that is not a description of this version with a known method. Unknown fields are dropped, texts
 * and lists are cut to their limits.
 */
export function parseEdgeApi(value: unknown): EdgeApi | null {
  if (typeof value !== 'string' || value.length > MAX_STORED) return null
  let data: unknown
  try {
    data = JSON.parse(value)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const raw = data as Record<string, unknown>
  if (raw.v !== VERSION || !isHttpMethod(raw.method)) return null
  return {
    method: raw.method,
    path: line(raw.path),
    summary: line(raw.summary),
    description: text(raw.description),
    parameters: records(raw.parameters)
      .slice(0, MAX_PARAMETERS)
      .map((parameter) => ({
        name: line(parameter.name, 200),
        in: (PARAMETER_LOCATIONS as readonly unknown[]).includes(parameter.in) ? (parameter.in as ParameterLocation) : 'query',
        type: line(parameter.type, 200),
        required: parameter.required === true,
        example: line(parameter.example),
        description: line(parameter.description),
      })),
    requestBody: readBody(raw.requestBody),
    responses: records(raw.responses)
      .slice(0, MAX_RESPONSES)
      .map((response) => ({
        status: line(response.status, 20),
        description: line(response.description),
        contentType: line(response.contentType, 200),
        body: text(response.body, MAX_BODY),
      })),
  }
}

/** The description of an edge with this style, or `null`; see {@link parseEdgeApi}. */
export const edgeApiOf = (style: Record<string, unknown> | null | undefined): EdgeApi | null => parseEdgeApi(style?.[EDGE_API_KEY])

/**
 * The value to store: the description without the rows left empty in the form, i.e. parameters without a name and
 * responses without a code, and with a path that starts with `/`.
 */
export function writeEdgeApi(api: EdgeApi): StyleValue {
  const clean = normalizeEdgeApi(api)
  return JSON.stringify({ v: VERSION, ...clean })
}

/** The description as it is stored: trimmed, without empty rows, with a path from `/`. */
export function normalizeEdgeApi(api: EdgeApi): EdgeApi {
  const path = api.path.trim()
  return {
    method: api.method,
    path: path.startsWith('/') ? path : `/${path}`,
    summary: api.summary.trim(),
    description: api.description.trim(),
    parameters: api.parameters
      .map((parameter) => ({ ...parameter, name: parameter.name.trim(), type: parameter.type.trim() }))
      .filter((parameter) => parameter.name !== '')
      .slice(0, MAX_PARAMETERS),
    requestBody: api.requestBody && (api.requestBody.contentType.trim() || api.requestBody.body.trim()) ? api.requestBody : null,
    responses: api.responses
      .map((response) => ({ ...response, status: response.status.trim() }))
      .filter((response) => response.status !== '')
      .slice(0, MAX_RESPONSES),
  }
}

/** The label of an edge that tells its call, e.g. `POST /payments`. */
export const apiLabel = (api: EdgeApi): string => `${api.method} ${normalizeEdgeApi(api).path}`

/** Names of the parameters of a path, e.g. `id` of `/orders/{id}`, in their order and once each. */
export function pathParameterNames(path: string): string[] {
  return [...new Set(Array.from(path.matchAll(/\{([^{}/]+)\}/g), (match) => match[1]!.trim()).filter(Boolean))]
}

/** The class of a status code for its color: `2xx`, `3xx`, `4xx`, `5xx` or `other`, e.g. for `default`. */
export function statusClass(status: string): '1xx' | '2xx' | '3xx' | '4xx' | '5xx' | 'other' {
  const first = /^([1-5])(\d\d|XX)$/i.exec(status.trim())?.[1]
  return first ? (`${first}xx` as '1xx' | '2xx' | '3xx' | '4xx' | '5xx') : 'other'
}

/** A body as OpenAPI keeps it: an example of its media type, parsed when it is JSON. */
function openApiContent({ contentType, body }: ApiBody): Record<string, unknown> {
  const type = contentType || 'application/json'
  let example: unknown = body
  if (/json/i.test(type)) {
    try {
      example = JSON.parse(body)
    } catch {
      // Not JSON after all, e.g. a schema in words: kept as text.
    }
  }
  return { [type]: body.trim() ? { example } : {} }
}

/**
 * The description as a fragment of an OpenAPI 3 document: `paths` with this one operation, its parameters, the body of
 * its request and its responses, which a document of the API can take as it is.
 */
export function toOpenApi(api: EdgeApi): Record<string, unknown> {
  const clean = normalizeEdgeApi(api)
  const operation: Record<string, unknown> = {}
  if (clean.summary) operation.summary = clean.summary
  if (clean.description) operation.description = clean.description
  if (clean.parameters.length > 0) {
    operation.parameters = clean.parameters.map((parameter) => ({
      name: parameter.name,
      in: parameter.in,
      // OpenAPI requires every parameter of the path.
      ...((parameter.required || parameter.in === 'path') && { required: true }),
      ...(parameter.description && { description: parameter.description }),
      schema: { type: parameter.type || 'string' },
      ...(parameter.example && { example: parameter.example }),
    }))
  }
  if (clean.requestBody) operation.requestBody = { content: openApiContent(clean.requestBody) }
  operation.responses =
    clean.responses.length > 0
      ? Object.fromEntries(
          clean.responses.map((response) => [
            response.status,
            {
              description: response.description || response.status,
              ...((response.contentType || response.body.trim()) && { content: openApiContent(response) }),
            },
          ]),
        )
      : { default: { description: 'Ответ' } }
  return { paths: { [clean.path]: { [clean.method.toLowerCase()]: operation } } }
}
