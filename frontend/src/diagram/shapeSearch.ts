import { TECHNOLOGIES } from './elementProps.ts'
import { SHAPE_SECTIONS, type ShapeId, type ShapePreset } from './shapes.ts'

/**
 * Words people search shapes by besides their names: the technologies they stand for and their names in English and
 * Russian. The words of a shape are its label, its id, its section, these and the technologies that the properties of
 * an element suggest for it (see `elementProps.ts`).
 */
export const SHAPE_KEYWORDS: Record<ShapeId, string[]> = {
  'provider-postgresql': ['postgres', 'pg', 'постгрес', 'sql', 'database', 'бд'],
  'provider-oracle': ['оракл', 'sql', 'database', 'бд'],
  'provider-elasticsearch': ['elastic', 'эластик', 'search', 'поиск'],
  'provider-kafka': ['apache kafka', 'кафка', 'broker', 'брокер', 'stream'],
  'provider-mysql': ['sql', 'database', 'бд'],
  'provider-mongodb': ['mongo', 'монго', 'nosql', 'database', 'бд'],
  'provider-redis': ['редис', 'cache', 'кэш', 'кеш'],
  'provider-rabbitmq': ['rabbit', 'rabbit mq', 'queue', 'очередь', 'broker', 'брокер'],
  'provider-docker': ['докер', 'container', 'контейнер'],
  'provider-kubernetes': ['k8s', 'кубернетес', 'cluster', 'кластер'],
  rectangle: ['rectangle', 'box', 'блок', 'квадрат'],
  rounded: ['rounded', 'скруглённый', 'блок'],
  ellipse: ['ellipse', 'circle', 'круг', 'овал'],
  rhombus: ['rhombus', 'diamond', 'decision', 'условие', 'решение'],
  triangle: ['triangle', 'треугольник', 'геометрия'],
  hexagon: ['hexagon', 'шестиугольник', 'геометрия'],
  pentagon: ['pentagon', 'пятиугольник', 'геометрия'],
  star: ['star', 'звезда', 'геометрия'],
  text: ['text', 'label', 'надпись'],
  sticky: ['sticky', 'note', 'post-it', 'заметка', 'ретро', 'брейншторм', 'идея'],
  'grid-table': ['table', 'grid', 'spreadsheet', 'rows', 'columns', 'таблица', 'сетка', 'строки', 'столбцы'],
  list: ['list', 'bullet', 'bullets', 'checklist', 'список', 'пункты'],
  'numbered-list': ['list', 'ordered', 'numbered', 'список', 'номера', 'пункты'],
  table: ['table', 'entity', 'сущность', 'sql', 'er'],
  'flow-process': ['flowchart', 'process', 'step', 'процесс', 'шаг', 'блок-схема'],
  'flow-terminator': ['flowchart', 'terminator', 'start', 'stop', 'начало', 'конец', 'старт', 'финиш', 'блок-схема'],
  'flow-decision': ['flowchart', 'decision', 'diamond', 'condition', 'решение', 'условие', 'ветвление', 'блок-схема'],
  'flow-data': ['flowchart', 'data', 'input', 'output', 'данные', 'ввод', 'вывод', 'блок-схема'],
  'flow-document': ['flowchart', 'document', 'file', 'документ', 'файл', 'блок-схема'],
  'flow-predefined-process': ['flowchart', 'subprocess', 'predefined process', 'подпроцесс', 'процедура', 'блок-схема'],
  'bpmn-task': ['bpmn', 'task', 'activity', 'задача', 'активность'],
  'bpmn-event': ['bpmn', 'event', 'start', 'end', 'событие', 'начало', 'конец'],
  'bpmn-gateway': ['bpmn', 'gateway', 'decision', 'exclusive', 'шлюз', 'развилка', 'условие'],
  'bpmn-data-object': ['bpmn', 'data object', 'document', 'данные', 'объект данных', 'документ'],
  'bpmn-pool': ['bpmn', 'pool', 'lane', 'swimlane', 'пул', 'дорожка', 'дорожки'],
  service: ['service', 'microservice', 'микросервис', 'backend', 'бэкенд', 'api', 'app', 'приложение'],
  database: ['database', 'db', 'бд', 'postgres', 'postgresql', 'mysql', 'oracle', 'mongodb', 'sql', 'хранилище'],
  queue: ['queue', 'mq', 'rabbitmq', 'sqs', 'activemq', 'брокер'],
  cache: ['cache', 'redis', 'memcached', 'кеш'],
  user: ['user', 'actor', 'человек', 'клиент'],
  'external-system': ['external', 'cloud', 'облако', 'saas', 'third-party', 'внешний'],
  document: ['document', 'file', 'файл'],
  boundary: ['boundary', 'frame', 'рамка', 'zone', 'зона', 'контур'],
  'load-balancer': ['load balancer', 'lb', 'nginx', 'haproxy', 'elb', 'alb', 'балансировщик'],
  'api-gateway': ['api gateway', 'gateway', 'kong', 'шлюз', 'ingress'],
  cdn: ['cdn', 'cloudflare', 'cloudfront', 'akamai'],
  server: ['server', 'vm', 'host', 'машина', 'хост', 'ec2'],
  container: ['container', 'docker', 'pod', 'под'],
  'kubernetes-cluster': ['kubernetes', 'k8s', 'cluster', 'кластер', 'openshift'],
  firewall: ['firewall', 'waf', 'брандмауэр', 'межсетевой экран'],
  dns: ['dns', 'route53', 'domain', 'домен'],
  'object-storage': ['object storage', 's3', 'minio', 'blob', 'gcs', 'бакет'],
  'search-index': ['search', 'elasticsearch', 'opensearch', 'solr', 'поиск', 'индекс'],
  'data-warehouse': ['data warehouse', 'dwh', 'clickhouse', 'bigquery', 'snowflake', 'redshift', 'аналитика'],
  'event-topic': ['topic', 'kafka', 'pulsar', 'kinesis', 'event bus', 'события', 'стрим'],
  scheduler: ['scheduler', 'cron', 'quartz', 'airflow', 'job', 'задача'],
  function: ['function', 'lambda', 'serverless', 'faas', 'функция'],
  browser: ['browser', 'web', 'spa', 'frontend', 'фронтенд', 'сайт'],
  'mobile-app': ['mobile', 'ios', 'android', 'phone', 'телефон', 'смартфон'],
  'desktop-app': ['desktop', 'electron', 'windows', 'macos', 'десктоп'],
  'iot-device': ['iot', 'device', 'sensor', 'датчик', 'устройство'],
  'uml-component': ['uml', 'component', 'компонент'],
  'uml-interface': ['uml', 'interface', 'интерфейс', 'lollipop'],
  'uml-package': ['uml', 'package', 'пакет', 'module', 'модуль'],
  'uml-note': ['uml', 'note', 'comment', 'заметка', 'комментарий'],
  sequence: ['uml', 'sequence', 'diagram', 'lifeline', 'saga', 'oauth', 'последовательность', 'сценарий', 'сага', 'линия жизни', 'сообщения'],
  'uml-actor': ['uml', 'use case', 'actor', 'актер', 'пользователь', 'роль', 'человек'],
  'uml-use-case': ['uml', 'use case', 'usecase', 'прецедент', 'сценарий'],
  'uml-system-boundary': ['uml', 'use case', 'subject', 'boundary', 'граница', 'система', 'рамка'],
  'c4-person': ['c4', 'person', 'user', 'пользователь', 'человек'],
  'c4-system': ['c4', 'software system', 'system', 'система'],
  'c4-container': ['c4', 'container', 'контейнер', 'app'],
  'c4-component': ['c4', 'component', 'компонент'],
  'c4-database': ['c4', 'database', 'db', 'бд'],
  'c4-external-system': ['c4', 'external', 'внешняя'],
  'c4-boundary': ['c4', 'boundary', 'граница', 'рамка'],
  'c4-deployment-node': ['c4', 'deployment', 'node', 'узел', 'развёртывание', 'развертывание', 'окружение', 'рамка'],
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
  label: string[]
  all: string[]
}

/** A shape of two sections, the legend, is found once, with the words of both. */
const ENTRIES: Entry[] = SHAPE_SECTIONS.flatMap((section) =>
  section.shapes.map((shape) => ({
    shape,
    label: words(shape.label),
    all: [shape.label, shape.id, section.title, ...SHAPE_KEYWORDS[shape.id], ...(TECHNOLOGIES[shape.id] ?? [])].flatMap(words),
  })),
).reduce<Entry[]>((entries, entry) => {
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
 * label matches first, each part in the order of the palette. Empty for an empty query.
 */
export function searchShapes(query: string): ShapePreset[] {
  const parts = words(query)
  if (parts.length === 0) return []
  const found = ENTRIES.filter((entry) => matches(parts, entry.all))
  return [
    ...found.filter((entry) => matches(parts, entry.label)),
    ...found.filter((entry) => !matches(parts, entry.label)),
  ].map((entry) => entry.shape)
}
