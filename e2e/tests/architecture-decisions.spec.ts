import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, twoParticipants, userPage } from './helpers.ts'

const panel = (page: Page) => page.getByRole('complementary', { name: 'Решения' })
const decision = (page: Page, name: string) => panel(page).getByRole('article', { name })

/** Adds a shape with a label in the middle of the view and returns its id. */
async function labelledShape(page: Page, label: string): Promise<string> {
  const shape = await addShape(page, 'Прямоугольник')
  const box = await cellBox(page, shape)
  await page.mouse.dblclick(center(box).x, center(box).y)
  await expect(page.locator('[data-testid=diagram-canvas] [contenteditable="true"]')).toBeFocused()
  await page.keyboard.type(label)
  await page.mouse.click(5, 400)
  return shape
}

test('a decision about a shape reaches the other participant, who discusses and accepts it', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const queue = await labelledShape(alice, 'Очередь')
  const box = await cellBox(alice, queue)
  await alice.mouse.click(center(box).x, center(box).y)

  await alice.getByRole('button', { name: 'Решения', exact: true }).click()
  await panel(alice).getByRole('button', { name: 'Новое решение' }).click()
  const form = panel(alice).getByRole('form', { name: 'Новое решение' })
  await expect(form.getByRole('group', { name: 'Элементы решения' })).toContainText('«Очередь»')
  await form.getByLabel('Название').fill('Kafka для событий')
  await form.getByLabel('Контекст').fill('Нужна очередь событий заказов')
  await form.getByLabel('Рассмотренные варианты').fill('* Kafka\n* RabbitMQ')
  await form.getByRole('button', { name: 'Записать' }).click()
  await expect(decision(alice, 'ADR-0001 Kafka для событий')).toContainText('Предложено')

  // Боб sees the badge of the shape and the decision without reloading, and discusses it.
  await bob.getByRole('button', { name: 'Решения элемента: 1' }).click()
  await expect(panel(bob)).toContainText('Решения элемента «Очередь»')
  await decision(bob, 'ADR-0001 Kafka для событий').getByRole('button', { name: /Kafka для событий/ }).click()
  await expect(decision(bob, 'ADR-0001 Kafka для событий').getByRole('region', { name: 'Контекст', exact: true })).toContainText(
    'Нужна очередь событий заказов',
  )
  const comment = decision(bob, 'ADR-0001 Kafka для событий').getByRole('combobox', { name: 'Комментарий к решению' })
  await comment.fill('Почему не RabbitMQ?')
  await comment.press('Enter')

  // The decision Алиса wrote down stays open for her.
  await expect(decision(alice, 'ADR-0001 Kafka для событий').getByRole('region', { name: 'Обсуждение' })).toContainText(
    'Почему не RabbitMQ?',
  )
  // The discussion is not among the comments of the board.
  await expect(alice.getByRole('button', { name: 'Комментарии', exact: true })).toBeVisible()

  await decision(bob, 'ADR-0001 Kafka для событий').getByRole('button', { name: 'Изменить решение ADR-0001' }).click()
  const edit = panel(bob).getByRole('form', { name: 'Изменить решение ADR-0001' })
  await edit.getByLabel('Статус').selectOption('Принято')
  await edit.getByLabel('Решение', { exact: true }).fill('Kafka: она уже есть в компании')
  await edit.getByRole('button', { name: 'Сохранить' }).click()

  await expect(decision(alice, 'ADR-0001 Kafka для событий')).toContainText('Принято')
  await expect(decision(alice, 'ADR-0001 Kafka для событий').getByRole('region', { name: 'Решение', exact: true })).toContainText(
    'Kafka: она уже есть в компании',
  )

  const download = alice.waitForEvent('download')
  await decision(alice, 'ADR-0001 Kafka для событий').getByRole('button', { name: 'Скачать .md' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('0001-kafka-dlya-sobytiy.md')
  const text = await readFile((await file.path())!, 'utf8')
  expect(text).toContain('status: "accepted"')
  expect(text).toContain('# Kafka для событий')
  expect(text).toContain('## Considered Options\n\n* Kafka\n* RabbitMQ')

  await close()
})

test('records of MADR are imported with their numbers and statuses, and all of them are downloaded in a .zip', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  await alice.getByRole('button', { name: 'Решения', exact: true }).click()

  await panel(alice)
    .getByLabel('Файлы решений')
    .setInputFiles([
      {
        name: '0002-kafka.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('---\nstatus: "superseded by [ADR-0003](0003-pulsar.md)"\ndate: 2025-05-01\n---\n\n# Kafka\n'),
      },
      {
        name: '0003-pulsar.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('# Pulsar\n\n* Status: accepted\n* Date: 2026-01-10\n\n## Context and Problem Statement\n\nGeo.\n'),
      },
    ])

  await expect(panel(alice).getByRole('status')).toHaveText('Импортировано: 2.')
  await expect(decision(alice, 'ADR-0002 Kafka')).toContainText('Заменено решением ADR-0003')
  await expect(decision(alice, 'ADR-0003 Pulsar')).toContainText('Принято')

  // The same files again add nothing.
  await panel(alice)
    .getByLabel('Файлы решений')
    .setInputFiles([{ name: '0003-pulsar.md', mimeType: 'text/markdown', buffer: Buffer.from('# Pulsar\n') }])
  await expect(panel(alice).getByRole('status')).toHaveText('Импортировано: 0. Номер уже занят: 0003-pulsar.md.')

  const download = alice.waitForEvent('download')
  await panel(alice).getByRole('button', { name: 'Выгрузить .zip' }).click()
  const archive = await readFile((await (await download).path())!)
  expect(archive.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  expect(archive.toString('utf8')).toContain('0002-kafka.md')
  expect(archive.toString('utf8')).toContain('status: "superseded by [ADR-0003](0003-pulsar.md)"')

  await alice.context().close()
})
