import { describe, expect, it } from 'vitest'
// The file of production of CoDraw itself: the import reads it as it is.
import codrawProduction from '../../../docker-compose.prod.yml?raw'
import { ApiSpecError, MAX_DOCUMENT_SIZE } from '../apiSpec/loadDocument.ts'
import { interpolate, mergeCompose, parseCompose, parseComposeFiles, publishedPort } from './parseCompose.ts'
import { CODRAW_COMPOSE, SHOP_COMPOSE } from './testCompose.ts'

const parse = (text: string, name = 'docker-compose.yml') => parseCompose({ name, text })

describe('interpolate', () => {
  it('takes the defaults the file gives and keeps the variables without them', () => {
    expect(interpolate('${CODRAW_HTTP_PORT:-8080}:8080')).toBe('8080:8080')
    expect(interpolate('${PORT-80}')).toBe('80')
    expect(interpolate('${PREFIX}frontend:${TAG:-latest}')).toBe('${PREFIX}frontend:latest')
    expect(interpolate('$HOST:${SECRET:?set the secret}')).toBe('${HOST}:${SECRET}')
    expect(interpolate('${FLAG:+on}')).toBe('${FLAG}')
  })

  it('reads defaults that hold variables, dollars written twice and braces that are never closed', () => {
    expect(interpolate('${A:-${B:-http://b:80}}')).toBe('http://b:80')
    expect(interpolate('cost $$5')).toBe('cost $5')
    expect(interpolate('${OPEN')).toBe('${OPEN')
    expect(interpolate('50$')).toBe('50$')
  })
})

describe('publishedPort', () => {
  it('reads the published port of each form of a port', () => {
    expect(publishedPort('8080:80')).toBe('8080')
    expect(publishedPort('127.0.0.1:9090:9090')).toBe('9090')
    expect(publishedPort('[::1]:6001:6001')).toBe('6001')
    expect(publishedPort('6060:6060/udp')).toBe('6060')
    expect(publishedPort('8000-8010:8000-8010')).toBe('8000-8010')
    expect(publishedPort('${HTTP_PORT:-8080}:8080')).toBe('8080')
    expect(publishedPort({ target: 80, published: 8443 })).toBe('8443')
  })

  it('finds no published port in a port of the container alone', () => {
    expect(publishedPort(3000)).toBeNull()
    expect(publishedPort('3000-3005')).toBeNull()
    expect(publishedPort('127.0.0.1::5000')).toBeNull()
    expect(publishedPort({ target: 80 })).toBeNull()
  })
})

describe('parseCompose', () => {
  it('reads the services with the short forms of their fields', async () => {
    const [postgres, backend, frontend] = await parse(SHOP_COMPOSE)

    expect(postgres).toMatchObject({ name: 'postgres', image: 'postgres:18-alpine', build: null, dependsOn: [], ports: [] })
    expect(backend).toMatchObject({ name: 'backend', image: null, build: { context: './backend', dockerfile: null }, dependsOn: ['postgres'] })
    expect(frontend).toMatchObject({ name: 'frontend', image: 'nginx:1.29', dependsOn: ['backend'], ports: ['8080'] })
  })

  it('reads the long forms of builds, dependencies, networks, ports and variables, links and network modes', async () => {
    const [app] = await parse(
      [
        'services:',
        '  app:',
        '    build: { context: ., dockerfile: app/Dockerfile }',
        '    depends_on: { db: { condition: service_started } }',
        '    links: ["cache:redis", queue]',
        '    network_mode: "service:vpn"',
        '    container_name: shop-app',
        '    hostname: app.local',
        '    networks: { back: { aliases: [api, gateway] }, front: }',
        '    ports: [{ target: 80, published: "${PORT:-8080}" }, 9000]',
        '    environment: ["DB_URL=jdbc:postgresql://db:5432/app", "FROM_HOST", "DEBUG=${DEBUG:-false}"]',
      ].join('\n'),
    )

    expect(app).toEqual({
      name: 'app',
      image: null,
      build: { context: '.', dockerfile: 'app/Dockerfile' },
      dependsOn: ['db'],
      links: ['cache', 'queue'],
      networkService: 'vpn',
      networks: ['back', 'front'],
      aliases: ['api', 'gateway'],
      containerName: 'shop-app',
      hostname: 'app.local',
      ports: ['8080'],
      environment: [
        ['DB_URL', 'jdbc:postgresql://db:5432/app'],
        ['DEBUG', 'false'],
      ],
    })
  })

  it('reads variables of a map with numbers and booleans, and leaves out those without a value', async () => {
    const [app] = await parse('services:\n  app:\n    environment:\n      PORT: 8080\n      DEBUG: true\n      TOKEN:\n')

    expect(app!.environment).toEqual([
      ['PORT', '8080'],
      ['DEBUG', 'true'],
    ])
  })

  it('reads a service without fields', async () => {
    expect(await parse('services:\n  worker:\n')).toEqual([expect.objectContaining({ name: 'worker', image: null, build: null })])
  })

  it('reads the docker-compose.prod.yml of CoDraw', async () => {
    const services = await parse(codrawProduction, 'docker-compose.prod.yml')

    expect(services.map((service) => service.name)).toEqual(['postgres', 's3', 'backend', 'collab', 'frontend', 'backup', 'prometheus'])
    const frontend = services.find((service) => service.name === 'frontend')!
    expect(frontend).toMatchObject({ ports: ['8080'], dependsOn: ['backend', 'collab'], image: 'ghcr.io/thescarletarrow/codraw-frontend:latest' })
  })

  it('refuses a document without services', async () => {
    await expect(parse('openapi: 3.0.3\ninfo:\n  title: Petstore\n', 'openapi.yaml')).rejects.toThrow(
      new ApiSpecError('openapi.yaml: это не docker-compose — нет раздела services'),
    )
    await expect(parse('- a\n- b\n')).rejects.toThrow('это не docker-compose')
  })

  it('names the line and the column of an error of YAML', async () => {
    await expect(parse('services:\n  app:\n   image: a\n    ports: []\n')).rejects.toThrow(/^docker-compose\.yml: строка 3, столбец \d+ — /)
  })
})

describe('mergeCompose', () => {
  it('lets a later file change the image and add dependencies, ports and variables of a service', async () => {
    const base = await parse('services:\n  backend:\n    image: app:1\n    ports: ["8080:8080"]\n    environment: { A: "1", B: "2" }\n')
    const prod = await parse(
      'services:\n  backend:\n    image: app:2\n    depends_on: [redis]\n    ports: ["8443:8443"]\n    environment: { B: "3" }\n  redis:\n    image: redis\n',
    )

    const [backend, redis] = mergeCompose([base, prod])

    expect(backend).toMatchObject({
      image: 'app:2',
      dependsOn: ['redis'],
      ports: ['8080', '8443'],
      environment: [
        ['A', '1'],
        ['B', '3'],
      ],
    })
    expect(redis!.name).toBe('redis')
  })
})

describe('parseComposeFiles', () => {
  it('merges the files in their order and names the errors of those it cannot read', async () => {
    const result = await parseComposeFiles([
      { name: 'docker-compose.yml', text: SHOP_COMPOSE },
      { name: 'openapi.yaml', text: 'openapi: 3.0.3\n' },
      { name: 'big.yml', text: '', size: MAX_DOCUMENT_SIZE + 1 },
      { name: 'Текст', text: CODRAW_COMPOSE },
    ])

    expect(result.services.map((service) => service.name)).toEqual(['postgres', 'backend', 'frontend', 's3', 'collab', 'prometheus'])
    expect(result.services.find((service) => service.name === 'frontend')!.build).toEqual({ context: '.', dockerfile: 'frontend/Dockerfile' })
    expect(result.errors).toEqual(['openapi.yaml: это не docker-compose — нет раздела services', 'big.yml: файл больше 5 МБ'])
  })
})
