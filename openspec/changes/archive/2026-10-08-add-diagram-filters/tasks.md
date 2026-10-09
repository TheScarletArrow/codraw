# Tasks

## 1. Правила без maxGraph

- [x] 1.1 frontend: `diagram/pageFilter.ts` — фильтр, пустой фильтр, адрес туда и обратно, значения страницы с числом
  элементов, множество неподошедших (элементы, связи по виду и концам, подписи и потомки); проверка: unit-тесты

## 2. Холст

- [x] 2.1 frontend: `diagram/editor.ts` — `setFilter`, состояние `filter` (подходит N из M), приглушение хуком стиля,
  скрытие видимостью, пересчёт после правок, `filterStatus`, `filterChoices`, `exportSvg({onlyVisible})`;
  `diagram/renderPage.ts` — фильтр скрытого редактора; `test/fakeEditor.ts`; проверка: тесты редактора — приглушение,
  скрытие и выделение, чужая правка, тег проявляет элемент, документ не меняется, экспорт

## 3. Интерфейс

- [x] 3.1 frontend: `diagram/FilterPicker.tsx` на `EditorToolbar.tsx`; адрес в `pages/BoardPage.tsx` и
  `pages/ProposalPage.tsx`; проверка: компонентные тесты окна и адреса
- [x] 3.2 frontend: «Только видимое» в `image/ImageExportMenu.tsx` и `image/pdf.ts`; мини-карта (`diagram/minimap.ts`,
  `board/Minimap.tsx`); поиск (`board/CanvasSearch.tsx`); проверка: тесты экспорта, эскиза и счётчика

## 4. Документация и проверка

- [x] 4.1 docs: README (возможности, раздел «Фильтр»), «Что нового» 0.15.0 и `version`; проверка: тесты «Что нового»
- [x] 4.2 e2e: `diagram-filters.spec.ts` — фильтр по владельцу приглушает и скрывает, ссылка открывает срез, другой
  участник ничего не видит, экспорт «Только видимое»; проверка: `pnpm --filter @codraw/e2e typecheck` и прогон
- [x] 4.3 Проверка: `pnpm typecheck`, `pnpm lint`, `pnpm --filter @codraw/frontend test`, `pnpm --filter
  @codraw/frontend build`, `openspec validate --all --strict`

## Workflow follow-up

- Архивировать изменение после проверки.
