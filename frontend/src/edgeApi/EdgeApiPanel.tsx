import { Copy, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DiagramEditor } from '../diagram/editor.ts'
import {
  emptyEdgeApi,
  emptyParameter,
  HTTP_METHODS,
  LOCATION_LABELS,
  MAX_PARAMETERS,
  MAX_RESPONSES,
  PARAMETER_LOCATIONS,
  pathParameterNames,
  statusClass,
  toOpenApi,
  type ApiParameter,
  type ApiResponse,
  type EdgeApi,
  type HttpMethod,
  type ParameterLocation,
} from '../diagram/edgeApi.ts'
import { useEditorState } from '../diagram/useEditorState.ts'

/** Colors of methods as Swagger UI paints them, which people who read APIs know. */
const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: '#2f80c9',
  POST: '#2e9e6b',
  PUT: '#d9822b',
  PATCH: '#1f9d8f',
  DELETE: '#d64545',
  HEAD: '#7d3fc4',
  OPTIONS: '#0d5aa7',
}

const STATUS_COLORS: Record<ReturnType<typeof statusClass>, string> = {
  '1xx': '#6b7280',
  '2xx': '#2e9e6b',
  '3xx': '#2f80c9',
  '4xx': '#d9822b',
  '5xx': '#d64545',
  other: '#6b7280',
}

/** A request of the page to edit the description of an edge, e.g. from its menu; a new object for every request. */
export interface EdgeApiRequest {
  cellId: string
}

/**
 * The description of the HTTP call of the selected edge, at the right of the canvas as Swagger UI shows an operation:
 * shown while a single edge with a description is selected, or one whose description `request` asked to edit. Who edits
 * the board and the edge is not locked changes and removes it; everyone copies it as OpenAPI.
 */
export function EdgeApiPanel({ editor, request }: { editor: DiagramEditor | null; request?: EdgeApiRequest | null }) {
  const { edgeApi } = useEditorState(editor)
  if (!editor || !edgeApi) return null
  // A panel of its own for each edge: selecting another one drops an unsaved form.
  return (
    <EdgePanel
      key={edgeApi.cellId}
      editor={editor}
      api={edgeApi.api}
      canChange={edgeApi.canChange}
      request={request?.cellId === edgeApi.cellId ? request : null}
    />
  )
}

function EdgePanel({
  editor,
  api,
  canChange,
  request,
}: {
  editor: DiagramEditor
  api: EdgeApi | null
  canChange: boolean
  request: EdgeApiRequest | null
}) {
  const [draft, setDraft] = useState<EdgeApi | null>(null)
  const [hidden, setHidden] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Only a new request opens the form, not a change of the description by someone else.
  const [handled, setHandled] = useState<EdgeApiRequest | null>(null)
  if (request !== handled) {
    setHandled(request)
    if (request && canChange) {
      setDraft(api ?? emptyEdgeApi())
      setHidden(false)
    }
  }

  if (hidden || (!api && !draft)) return null
  const editable = canChange && draft !== null

  const save = (next: EdgeApi) => {
    editor.setEdgeApi(next)
    setDraft(null)
  }
  const remove = () => {
    editor.setEdgeApi(null)
    setDraft(null)
  }
  const copy = async () => {
    if (!api) return
    try {
      const { stringify } = await import('yaml')
      await navigator.clipboard.writeText(stringify(toOpenApi(api)))
      setMessage('Скопировано как OpenAPI')
    } catch {
      setMessage('Не удалось скопировать')
    }
  }

  return (
    <aside
      aria-label="Описание API"
      className="pointer-events-auto absolute top-2 right-2 z-20 flex max-h-[calc(100%-1rem)] w-[400px] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-md border bg-background text-foreground shadow-lg"
    >
      <header className="flex items-center gap-1 border-b px-3 py-2">
        <h2 className="mr-auto text-sm font-semibold">Описание API</h2>
        {!editable && api && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Копировать как OpenAPI" title="Копировать как OpenAPI" onClick={() => void copy()}>
            <Copy />
          </Button>
        )}
        {!editable && api && canChange && (
          <>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Изменить" title="Изменить" onClick={() => setDraft(api)}>
              <Pencil />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Удалить описание" title="Удалить описание" onClick={remove}>
              <Trash2 />
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Закрыть"
          title="Закрыть"
          onClick={() => {
            setDraft(null)
            setHidden(true)
            editor.focus()
          }}
        >
          <X />
        </Button>
      </header>
      {message && !editable && (
        <p role="status" className="border-b px-3 py-1.5 text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {editable ? (
        <EdgeApiForm
          initial={draft}
          onSave={save}
          onCancel={() => {
            setDraft(null)
            if (!api) editor.focus()
          }}
        />
      ) : (
        api && <EdgeApiView api={api} />
      )}
    </aside>
  )
}

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className="inline-flex min-w-16 justify-center rounded px-2 py-1 font-mono text-xs font-bold text-white"
      style={{ backgroundColor: METHOD_COLORS[method] }}
    >
      {method}
    </span>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Code({ children }: { children: string }) {
  return <pre className="max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-words">{children}</pre>
}

function ParameterTable({ parameters, caption }: { parameters: ApiParameter[]; caption: string }) {
  return (
    <table className="w-full table-fixed border-collapse text-xs">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="w-2/5 py-1 pr-2 font-medium">Имя</th>
          <th className="py-1 font-medium">Описание</th>
        </tr>
      </thead>
      <tbody>
        {parameters.map((parameter, index) => (
          <tr key={index} className="border-b align-top last:border-b-0">
            <td className="py-1.5 pr-2">
              <div className="font-mono font-semibold break-all">
                {parameter.name}
                {parameter.required && (
                  <span className="text-destructive" title="Обязательный">
                    {' '}
                    *
                  </span>
                )}
              </div>
              <div className="text-muted-foreground">
                {parameter.type || 'string'}
                {parameter.in !== 'header' && ` · ${LOCATION_LABELS[parameter.in]}`}
              </div>
            </td>
            <td className="py-1.5 break-words">
              {parameter.description}
              {parameter.example && (
                <div className="text-muted-foreground">
                  Пример: <code className="font-mono">{parameter.example}</code>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The description as Swagger UI shows an operation: the method and the path, parameters, headers, body and responses. */
export function EdgeApiView({ api }: { api: EdgeApi }) {
  const headers = api.parameters.filter((parameter) => parameter.in === 'header')
  const parameters = api.parameters.filter((parameter) => parameter.in !== 'header')
  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <MethodBadge method={api.method} />
          <code className="min-w-0 font-mono text-sm font-semibold break-all">{api.path}</code>
        </div>
        {api.summary && <p className="text-sm">{api.summary}</p>}
        {api.description && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{api.description}</p>}
      </div>
      {parameters.length > 0 && (
        <Section title="Параметры">
          <ParameterTable parameters={parameters} caption="Параметры" />
        </Section>
      )}
      {headers.length > 0 && (
        <Section title="Заголовки">
          <ParameterTable parameters={headers} caption="Заголовки" />
        </Section>
      )}
      {api.requestBody && (
        <Section title="Тело запроса">
          {api.requestBody.contentType && <code className="font-mono text-xs text-muted-foreground">{api.requestBody.contentType}</code>}
          {api.requestBody.body && <Code>{api.requestBody.body}</Code>}
        </Section>
      )}
      {api.responses.length > 0 && (
        <Section title="Ответы">
          <ul className="flex flex-col gap-3">
            {api.responses.map((response, index) => (
              <li key={index} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-sm font-bold" style={{ color: STATUS_COLORS[statusClass(response.status)] }}>
                    {response.status}
                  </span>
                  <span className="text-sm">{response.description}</span>
                </div>
                {response.contentType && <code className="font-mono text-xs text-muted-foreground">{response.contentType}</code>}
                {response.body && <Code>{response.body}</Code>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

const fieldClass = 'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground'
const areaClass = 'w-full min-w-0 rounded-md border bg-background px-2 py-1 font-mono text-xs text-foreground'

const emptyResponse = (status = '200'): ApiResponse => ({
  status,
  description: status === '200' ? 'OK' : '',
  contentType: 'application/json',
  body: '',
})

/**
 * The form of a description with the sections of the view; rows without a name or a code are dropped on saving.
 * Ctrl+Enter, or Cmd+Enter, saves and Escape cancels.
 */
export function EdgeApiForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: EdgeApi
  onSave: (api: EdgeApi) => void
  onCancel: () => void
}) {
  const [api, setApi] = useState(initial)
  const update = (change: Partial<EdgeApi>) => setApi((current) => ({ ...current, ...change }))
  const updateParameter = (index: number, change: Partial<ApiParameter>) =>
    update({ parameters: api.parameters.map((parameter, at) => (at === index ? { ...parameter, ...change } : parameter)) })
  const updateResponse = (index: number, change: Partial<ApiResponse>) =>
    update({ responses: api.responses.map((response, at) => (at === index ? { ...response, ...change } : response)) })
  const addParameter = (location: ParameterLocation) => update({ parameters: [...api.parameters, emptyParameter(location)] })
  const missingPathParameters = pathParameterNames(api.path).filter(
    (name) => !api.parameters.some((parameter) => parameter.in === 'path' && parameter.name === name),
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave(api)
  }
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onSave(api)
    }
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit} onKeyDown={keys}>
      <div className="flex flex-col gap-4 overflow-y-auto p-3">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <select
              aria-label="Метод"
              className={cn(fieldClass, 'w-28 shrink-0 font-mono font-bold text-white')}
              style={{ backgroundColor: METHOD_COLORS[api.method] }}
              value={api.method}
              onChange={(event) => update({ method: event.target.value as HttpMethod })}
            >
              {HTTP_METHODS.map((method) => (
                <option key={method} value={method} className="bg-background text-foreground">
                  {method}
                </option>
              ))}
            </select>
            <input
              // The form opens for the path.
              autoFocus
              aria-label="Путь"
              placeholder="/orders/{id}"
              className={cn(fieldClass, 'font-mono')}
              value={api.path}
              onChange={(event) => update({ path: event.target.value })}
            />
          </div>
          <input
            aria-label="Кратко"
            placeholder="Кратко: что делает вызов"
            className={fieldClass}
            value={api.summary}
            onChange={(event) => update({ summary: event.target.value })}
          />
          <textarea
            aria-label="Описание"
            placeholder="Подробности: когда вызывается, идемпотентность, авторизация…"
            rows={2}
            className={cn(areaClass, 'font-sans text-sm')}
            value={api.description}
            onChange={(event) => update({ description: event.target.value })}
          />
        </div>

        <Section title="Параметры и заголовки">
          {api.parameters.map((parameter, index) => (
            <fieldset key={index} className="flex flex-col gap-1.5 rounded-md border p-2">
              <legend className="sr-only">Параметр {index + 1}</legend>
              <div className="flex gap-1.5">
                <input
                  aria-label="Имя"
                  placeholder={parameter.in === 'header' ? 'X-Request-Id' : 'id'}
                  className={cn(fieldClass, 'font-mono')}
                  value={parameter.name}
                  onChange={(event) => updateParameter(index, { name: event.target.value })}
                />
                <select
                  aria-label="Где"
                  className={cn(fieldClass, 'w-32 shrink-0')}
                  value={parameter.in}
                  onChange={(event) => updateParameter(index, { in: event.target.value as ParameterLocation })}
                >
                  {PARAMETER_LOCATIONS.map((location) => (
                    <option key={location} value={location}>
                      {LOCATION_LABELS[location]}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Удалить параметр"
                  title="Удалить параметр"
                  onClick={() => update({ parameters: api.parameters.filter((_, at) => at !== index) })}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  aria-label="Тип"
                  placeholder="string"
                  className={cn(fieldClass, 'w-28 shrink-0 font-mono')}
                  value={parameter.type}
                  onChange={(event) => updateParameter(index, { type: event.target.value })}
                />
                <input
                  aria-label="Пример"
                  placeholder="Пример"
                  className={fieldClass}
                  value={parameter.example}
                  onChange={(event) => updateParameter(index, { example: event.target.value })}
                />
                <label className="flex shrink-0 items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={parameter.required}
                    onChange={(event) => updateParameter(index, { required: event.target.checked })}
                  />
                  Обязательный
                </label>
              </div>
              <input
                aria-label="Описание параметра"
                placeholder="Описание"
                className={fieldClass}
                value={parameter.description}
                onChange={(event) => updateParameter(index, { description: event.target.value })}
              />
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" disabled={api.parameters.length >= MAX_PARAMETERS} onClick={() => addParameter('query')}>
              <Plus /> Параметр
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={api.parameters.length >= MAX_PARAMETERS} onClick={() => addParameter('header')}>
              <Plus /> Заголовок
            </Button>
            {missingPathParameters.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                title={`Добавить параметры пути: ${missingPathParameters.join(', ')}`}
                onClick={() =>
                  update({
                    parameters: [
                      ...api.parameters,
                      ...missingPathParameters.map((name) => ({ ...emptyParameter('path'), name })),
                    ].slice(0, MAX_PARAMETERS),
                  })
                }
              >
                <Plus /> Из пути
              </Button>
            )}
          </div>
        </Section>

        <Section title="Тело запроса">
          <input
            aria-label="Тип тела запроса"
            placeholder="application/json"
            className={cn(fieldClass, 'font-mono')}
            value={api.requestBody?.contentType ?? ''}
            onChange={(event) => update({ requestBody: { contentType: event.target.value, body: api.requestBody?.body ?? '' } })}
          />
          <textarea
            aria-label="Тело запроса"
            placeholder={'{\n  "amount": 100\n}'}
            rows={4}
            className={areaClass}
            value={api.requestBody?.body ?? ''}
            onChange={(event) =>
              update({ requestBody: { contentType: api.requestBody?.contentType ?? '', body: event.target.value } })
            }
          />
        </Section>

        <Section title="Ответы">
          {api.responses.map((response, index) => (
            <fieldset key={index} className="flex flex-col gap-1.5 rounded-md border p-2">
              <legend className="sr-only">Ответ {index + 1}</legend>
              <div className="flex gap-1.5">
                <input
                  aria-label="Код"
                  placeholder="200"
                  className={cn(fieldClass, 'w-20 shrink-0 font-mono font-bold')}
                  style={{ color: STATUS_COLORS[statusClass(response.status)] }}
                  value={response.status}
                  onChange={(event) => updateResponse(index, { status: event.target.value })}
                />
                <input
                  aria-label="Описание ответа"
                  placeholder="OK"
                  className={fieldClass}
                  value={response.description}
                  onChange={(event) => updateResponse(index, { description: event.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Удалить ответ"
                  title="Удалить ответ"
                  onClick={() => update({ responses: api.responses.filter((_, at) => at !== index) })}
                >
                  <Trash2 />
                </Button>
              </div>
              <input
                aria-label="Тип ответа"
                placeholder="application/json"
                className={cn(fieldClass, 'font-mono')}
                value={response.contentType}
                onChange={(event) => updateResponse(index, { contentType: event.target.value })}
              />
              <textarea
                aria-label="Тело ответа"
                rows={3}
                className={areaClass}
                value={response.body}
                onChange={(event) => updateResponse(index, { body: event.target.value })}
              />
            </fieldset>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={api.responses.length >= MAX_RESPONSES}
              onClick={() => update({ responses: [...api.responses, emptyResponse(api.responses.length === 0 ? '200' : '')] })}
            >
              <Plus /> Ответ
            </Button>
          </div>
        </Section>
      </div>
      <footer className="flex justify-end gap-2 border-t px-3 py-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" size="sm">
          Сохранить
        </Button>
      </footer>
    </form>
  )
}
