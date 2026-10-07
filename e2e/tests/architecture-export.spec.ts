import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { createBoard, userPage, vertices } from './helpers.ts'

test('the template «C4: контейнеры» is exported as Structurizr DSL, C4-PlantUML and Mermaid C4', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await alice.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await createBoard(alice)
  await alice.getByRole('region', { name: 'Начните с шаблона' }).getByRole('button', { name: /C4: контейнеры/ }).click()
  await expect.poll(async () => (await vertices(alice)).length).toBe(6)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Архитектура как код…' }).click()
  const text = menu.getByLabel('Текст выгрузки')
  await expect(menu.getByRole('status')).toHaveText('Элементов: 5, границ: 1, связей: 4, пропущено фигур: 0')
  await expect(text).toContainText('internet_magazin = softwareSystem "Интернет-магазин" {')
  await expect(text).toContainText('api = container "API" "Заказы, оплата и каталог" "Spring Boot"')
  await expect(text).toContainText('veb_prilozhenie -> api "Вызывает" "JSON/HTTPS"')

  await menu.getByRole('button', { name: 'Скопировать' }).click()
  await expect(menu.getByText('Скопировано')).toBeVisible()
  expect(await alice.evaluate(() => navigator.clipboard.readText())).toMatch(/^workspace "Новая доска" \{/)

  await menu.getByRole('button', { name: 'C4-PlantUML' }).click()
  await expect(text).toContainText('System_Boundary(internet_magazin, "Интернет-магазин") {')
  await expect(text).toContainText('ContainerDb(baza_dannykh, "База данных", "PostgreSQL", "Товары, заказы и покупатели")')
  const download = alice.waitForEvent('download')
  await menu.getByRole('button', { name: 'Скачать .puml' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('Новая доска.puml')
  expect(readFileSync(await file.path(), 'utf8')).toContain('Rel(pokupatel, veb_prilozhenie, "Использует", "HTTPS")')

  await menu.getByRole('button', { name: 'Mermaid C4' }).click()
  await expect(text).toContainText('C4Container')
  await expect(text).toContainText('System_Ext(platezhnyy_shlyuz, "Платёжный шлюз", "Принимает оплату картой")')

  await alice.context().close()
})
