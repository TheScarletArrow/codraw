import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cells, createBoard, edges, twoParticipants, userPage, vertices, type CellInfo } from './helpers.ts'

/** What codraw.gradle printed for a build of a shop with Gradle 9.8. */
const GRAPH = JSON.stringify({
  format: 'codraw-gradle',
  version: 1,
  projects: [
    { path: ':', name: 'shop', plugins: [], dependencies: [] },
    {
      path: ':app',
      name: 'app',
      plugins: ['org.jetbrains.kotlin.jvm', 'org.springframework.boot', 'java'],
      dependencies: [
        { configuration: 'implementation', project: ':services:billing' },
        { configuration: 'implementation', project: ':services:orders' },
        { configuration: 'testImplementation', project: ':core' },
      ],
    },
    { path: ':core', name: 'core', plugins: ['java-library', 'java'], dependencies: [] },
    { path: ':services', name: 'services', plugins: [], dependencies: [] },
    { path: ':services:billing', name: 'billing', plugins: ['java-library', 'java'], dependencies: [{ configuration: 'api', project: ':core' }] },
    { path: ':services:orders', name: 'orders', plugins: ['java-library', 'java'], dependencies: [{ configuration: 'implementation', project: ':core' }] },
  ],
})

const APP = ':app\nKotlin, Spring Boot'
const CORE = ':core\nJava'
const BILLING = ':services:billing\nJava'
const ORDERS = ':services:orders\nJava'

const inside = (frame: CellInfo, shape: CellInfo) =>
  shape.x >= frame.x && shape.y >= frame.y && shape.x + shape.width <= frame.x + frame.width && shape.y + shape.height <= frame.y + frame.height

test('a graph of Gradle becomes modules, a group and dependencies for everybody, and is undone in one step', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт Gradle…' }).click()
  await expect(menu).toContainText('./gradlew -q -I codraw.gradle codrawGraph > modules.json')
  const download = alice.waitForEvent('download')
  await menu.getByRole('button', { name: 'Скачать codraw.gradle' }).click()
  expect((await download).suggestedFilename()).toBe('codraw.gradle')

  await menu.getByLabel('Файлы графа Gradle').setInputFiles({ name: 'modules.json', mimeType: 'application/json', buffer: Buffer.from(GRAPH) })
  await expect(menu.getByRole('status')).toHaveText('Модулей: 4, связей: 4, групп: 1, пропущено: 0')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  await expect
    .poll(async () => (await vertices(bob)).map((cell) => cell.value).sort())
    .toEqual([APP, CORE, BILLING, ORDERS, ':services'].sort())
  const shapes = await vertices(bob)
  const byValue = (value: string) => shapes.find((cell) => cell.value === value)!
  expect(byValue(APP).style.codrawShape).toBe('uml-component')
  expect(inside(byValue(':services'), byValue(BILLING))).toBe(true)
  expect(inside(byValue(':services'), byValue(ORDERS))).toBe(true)
  // From top to bottom along the dependencies.
  expect(byValue(APP).y).toBeLessThan(byValue(BILLING).y)
  expect(byValue(BILLING).y).toBeLessThan(byValue(CORE).y)
  const name = (id: string | null) => shapes.find((cell) => cell.id === id)!.value.split('\n')[0]
  expect((await edges(bob)).map((edge) => `${name(edge.source)} -> ${name(edge.target)}: ${edge.value}`).sort()).toEqual(
    [
      ':app -> :services:billing: implementation',
      ':app -> :services:orders: implementation',
      ':services:billing -> :core: api',
      ':services:orders -> :core: implementation',
    ].sort(),
  )

  await alice.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await alice.keyboard.press('Control+z')
  await expect.poll(async () => (await cells(bob)).length).toBe(0)

  await close()
})

test('a folder of a project becomes modules without Gradle', async ({ browser }) => {
  const folder = mkdtempSync(join(tmpdir(), 'codraw-gradle-'))
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  write('settings.gradle.kts', 'rootProject.name = "shop"\ninclude(":app", ":core")\n')
  write('app/build.gradle.kts', 'plugins { kotlin("jvm") }\ndependencies { implementation(projects.core) }\n')
  write('core/build.gradle', "plugins { id 'java-library' }\n")
  write('app/src/Main.kt', 'fun main() {}\n')
  write('app/build/generated/build.gradle.kts', 'dependencies { implementation(project(":missing")) }\n')

  try {
    const alice = await userPage(browser, 'Алиса')
    await createBoard(alice)
    await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
    const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
    await menu.getByRole('button', { name: 'Импорт Gradle…' }).click()
    await menu.getByLabel('Папка проекта Gradle').setInputFiles(folder)
    await expect(menu.getByRole('status')).toHaveText('Модулей: 2, связей: 1, групп: 0, пропущено: 0')
    await expect(menu).toContainText('файлов сборки 3')
    await menu.getByRole('button', { name: 'Добавить на страницу' }).click()

    await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value).sort()).toEqual([':app\nKotlin', CORE].sort())
    expect((await edges(alice)).map((edge) => edge.value)).toEqual(['implementation'])
    await alice.context().close()
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
