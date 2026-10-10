import { TECHNOLOGIES } from './elementProps.ts'
import { SHAPE_TEXTS } from './shapes.messages.ts'
import { SHAPE_SECTIONS, type ShapeId, type ShapePreset } from './shapes.ts'

/**
 * Words people search shapes by besides their names: the technologies they stand for and their names in English and
 * Russian. The words of a shape are its label and its section in both languages of the interface, its id, these and the
 * technologies that the properties of an element suggest for it (see `elementProps.ts`). These words are data of the
 * search, the same in any language of the interface.
 */
export const SHAPE_KEYWORDS: Record<ShapeId, string[]> = {
  'provider-postgresql': ['postgres', 'pg', 'постгрес', 'sql', 'database', 'бд'],
  'provider-oracle': ['оракл', 'sql', 'database', 'db', 'бд'],
  'provider-elasticsearch': ['elastic', 'эластик', 'search', 'поиск'],
  'provider-kafka': ['apache kafka', 'кафка', 'broker', 'брокер', 'stream'],
  'provider-mysql': ['sql', 'database', 'бд'],
  'provider-mongodb': ['mongo', 'монго', 'nosql', 'database', 'бд'],
  'provider-redis': ['редис', 'cache', 'кэш', 'кеш'],
  'provider-rabbitmq': ['rabbit', 'rabbit mq', 'queue', 'очередь', 'broker', 'брокер'],
  'provider-docker': ['докер', 'container', 'контейнер'],
  'provider-kubernetes': ['k8s', 'кубернетес', 'cluster', 'кластер'],
  rectangle: ['rectangle', 'box', 'block', 'square', 'блок', 'квадрат'],
  rounded: ['rounded', 'box', 'block', 'скруглённый', 'блок'],
  ellipse: ['ellipse', 'circle', 'oval', 'круг', 'овал'],
  rhombus: ['rhombus', 'diamond', 'decision', 'condition', 'условие', 'решение'],
  triangle: ['triangle', 'geometry', 'треугольник', 'геометрия'],
  hexagon: ['hexagon', 'geometry', 'шестиугольник', 'геометрия'],
  pentagon: ['pentagon', 'geometry', 'пятиугольник', 'геометрия'],
  star: ['star', 'geometry', 'звезда', 'геометрия'],
  text: ['text', 'label', 'caption', 'надпись'],
  sticky: ['sticky', 'note', 'post-it', 'retro', 'brainstorm', 'idea', 'заметка', 'ретро', 'брейншторм', 'идея'],
  'grid-table': ['table', 'grid', 'spreadsheet', 'rows', 'columns', 'таблица', 'сетка', 'строки', 'столбцы'],
  list: ['list', 'bullet', 'bullets', 'checklist', 'items', 'список', 'пункты'],
  'numbered-list': ['list', 'ordered', 'numbered', 'numbers', 'items', 'список', 'номера', 'пункты'],
  table: ['table', 'entity', 'сущность', 'sql', 'er'],
  'flow-process': ['flowchart', 'process', 'step', 'процесс', 'шаг', 'блок-схема'],
  'flow-terminator': ['flowchart', 'terminator', 'start', 'stop', 'begin', 'end', 'finish', 'начало', 'конец', 'старт', 'финиш', 'блок-схема'],
  'flow-decision': ['flowchart', 'decision', 'diamond', 'condition', 'branch', 'решение', 'условие', 'ветвление', 'блок-схема'],
  'flow-data': ['flowchart', 'data', 'input', 'output', 'данные', 'ввод', 'вывод', 'блок-схема'],
  'flow-document': ['flowchart', 'document', 'file', 'документ', 'файл', 'блок-схема'],
  'flow-predefined-process': ['flowchart', 'subprocess', 'predefined process', 'procedure', 'подпроцесс', 'процедура', 'блок-схема'],
  'bpmn-task': ['bpmn', 'task', 'activity', 'задача', 'активность'],
  'bpmn-event': ['bpmn', 'event', 'start', 'end', 'событие', 'начало', 'конец'],
  'bpmn-gateway': ['bpmn', 'gateway', 'decision', 'exclusive', 'fork', 'condition', 'шлюз', 'развилка', 'условие'],
  'bpmn-data-object': ['bpmn', 'data object', 'document', 'данные', 'объект данных', 'документ'],
  'bpmn-pool': ['bpmn', 'pool', 'lane', 'swimlane', 'пул', 'дорожка', 'дорожки'],
  service: ['service', 'microservice', 'микросервис', 'backend', 'бэкенд', 'api', 'app', 'application', 'приложение'],
  database: ['database', 'db', 'бд', 'postgres', 'postgresql', 'mysql', 'oracle', 'mongodb', 'sql', 'storage', 'хранилище'],
  queue: ['queue', 'mq', 'rabbitmq', 'sqs', 'activemq', 'broker', 'брокер'],
  cache: ['cache', 'redis', 'memcached', 'кеш'],
  user: ['user', 'actor', 'person', 'client', 'человек', 'клиент'],
  'external-system': ['external', 'cloud', 'облако', 'saas', 'third-party', 'внешний'],
  document: ['document', 'file', 'файл'],
  boundary: ['boundary', 'frame', 'рамка', 'zone', 'зона', 'perimeter', 'контур'],
  'load-balancer': ['load balancer', 'balancer', 'lb', 'nginx', 'haproxy', 'elb', 'alb', 'балансировщик'],
  'api-gateway': ['api gateway', 'gateway', 'kong', 'шлюз', 'ingress'],
  cdn: ['cdn', 'cloudflare', 'cloudfront', 'akamai'],
  server: ['server', 'vm', 'host', 'machine', 'машина', 'хост', 'ec2'],
  container: ['container', 'docker', 'pod', 'под'],
  'kubernetes-cluster': ['kubernetes', 'k8s', 'cluster', 'кластер', 'openshift'],
  firewall: ['firewall', 'waf', 'брандмауэр', 'межсетевой экран'],
  dns: ['dns', 'route53', 'domain', 'домен'],
  'object-storage': ['object storage', 's3', 'minio', 'blob', 'gcs', 'bucket', 'бакет'],
  'search-index': ['search', 'index', 'elasticsearch', 'opensearch', 'solr', 'поиск', 'индекс'],
  'data-warehouse': ['data warehouse', 'dwh', 'clickhouse', 'bigquery', 'snowflake', 'redshift', 'analytics', 'аналитика'],
  'event-topic': ['topic', 'kafka', 'pulsar', 'kinesis', 'event bus', 'events', 'stream', 'события', 'стрим'],
  scheduler: ['scheduler', 'cron', 'quartz', 'airflow', 'job', 'task', 'задача'],
  function: ['function', 'lambda', 'serverless', 'faas', 'функция'],
  browser: ['browser', 'web', 'spa', 'frontend', 'site', 'website', 'фронтенд', 'сайт'],
  'mobile-app': ['mobile', 'ios', 'android', 'phone', 'smartphone', 'телефон', 'смартфон'],
  'desktop-app': ['desktop', 'electron', 'windows', 'macos', 'десктоп'],
  'iot-device': ['iot', 'device', 'sensor', 'датчик', 'устройство'],
  'uml-component': ['uml', 'component', 'компонент'],
  'uml-interface': ['uml', 'interface', 'интерфейс', 'lollipop'],
  'uml-package': ['uml', 'package', 'пакет', 'module', 'модуль'],
  'uml-note': ['uml', 'note', 'comment', 'заметка', 'комментарий'],
  sequence: ['uml', 'sequence', 'diagram', 'lifeline', 'saga', 'oauth', 'scenario', 'messages', 'последовательность', 'сценарий', 'сага', 'линия жизни', 'сообщения'],
  'uml-actor': ['uml', 'use case', 'actor', 'role', 'актер', 'пользователь', 'роль', 'человек'],
  'uml-use-case': ['uml', 'use case', 'usecase', 'прецедент', 'сценарий'],
  'uml-system-boundary': ['uml', 'use case', 'subject', 'boundary', 'system', 'frame', 'граница', 'система', 'рамка'],
  'c4-person': ['c4', 'person', 'user', 'пользователь', 'человек'],
  'c4-system': ['c4', 'software system', 'system', 'система'],
  'c4-container': ['c4', 'container', 'контейнер', 'app'],
  'c4-component': ['c4', 'component', 'компонент'],
  'c4-database': ['c4', 'database', 'db', 'бд'],
  'c4-external-system': ['c4', 'external', 'внешняя'],
  'c4-boundary': ['c4', 'boundary', 'frame', 'граница', 'рамка'],
  'c4-deployment-node': ['c4', 'deployment', 'node', 'environment', 'frame', 'узел', 'развёртывание', 'развертывание', 'окружение', 'рамка'],
  legend: ['legend', 'key', 'notation', 'легенда', 'условные обозначения', 'обозначения', 'нотация'],
}

/** Lower case, «ё» as «е», words split by anything that is not a letter or a digit. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

interface Entry {
  shape: ShapePreset
  all: string[]
}

/** The names of a shape in every language of the interface: a shape is found by any of them. */
const namesOf = (shape: ShapePreset): string[] => [
  shape.label,
  ...SHAPE_TEXTS.map((texts) => (texts.labels as Partial<Record<ShapeId, string>>)[shape.id] ?? ''),
]

/** A shape of two sections, the legend, is found once, with the words of both. */
const ENTRIES: Entry[] = SHAPE_SECTIONS.flatMap((section) => {
  const titles = [section.title, ...SHAPE_TEXTS.map((texts) => texts.sections[section.id])]
  return section.shapes.map((shape) => ({
    shape,
    all: [...namesOf(shape), shape.id, ...titles, ...SHAPE_KEYWORDS[shape.id], ...(TECHNOLOGIES[shape.id] ?? [])].flatMap(words),
  }))
}).reduce<Entry[]>((entries, entry) => {
  const found = entries.find((other) => other.shape.id === entry.shape.id)
  if (found) found.all.push(...entry.all)
  else entries.push(entry)
  return entries
}, [])

/** Every word of the query starts one of the words. */
export const matches = (query: string[], candidates: string[]) =>
  query.every((part) => candidates.some((word) => word.startsWith(part)))

/**
 * Shapes of the palette for a query: those where every word of the query starts one of their words, the ones whose
 * label in the language of the interface matches first, each part in the order of the palette. Empty for an empty query.
 */
export function searchShapes(query: string): ShapePreset[] {
  const parts = words(query)
  if (parts.length === 0) return []
  const found = ENTRIES.filter((entry) => matches(parts, entry.all))
  const named = (entry: Entry) => matches(parts, words(entry.shape.label))
  return [...found.filter(named), ...found.filter((entry) => !named(entry))].map((entry) => entry.shape)
}
