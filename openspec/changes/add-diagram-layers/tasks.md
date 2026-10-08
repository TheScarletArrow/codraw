# Tasks

## 1. Модель и привязка

- [x] 1.1 frontend: `diagram/model.ts` — ключ общей скрытости слоя, слои страницы, имена по умолчанию, `layerIds`;
  `diagram/pages.ts` — пустая страница без элементов при любых слоях, копия страницы с основным слоем; проверка:
  unit-тесты модели и страниц
- [x] 1.2 frontend: `diagram/binding.ts` — слои как ячейки (`kind: 'layer'`), основной слой не удаляется, функция
  видимости слоя, элементы удалённого родителя остаются в модели; проверка: тесты привязки — слой туда и обратно,
  чужой слой, отмена, личная видимость не пишется
- [x] 1.3 frontend: `diagram/layerViews.ts` — личная видимость и активный слой по страницам, память браузера; проверка:
  unit-тесты

## 2. Редактор

- [x] 2.1 frontend: `diagram/editor.ts` — слой новых элементов (`getDefaultParent`), перебор элементов по всем слоям,
  выделение (`isCellSelectable`, `getEventState`, Ctrl+A, рамка), связи в своём слое (`updateEdgeParent`), фигура из
  группы в слой группы, направляющие, маршруты связей, мини-карта, базовые таблицы; проверка: тесты редактора на
  несколько слоёв
- [x] 2.2 frontend: `diagram/editor.ts` — команды `addLayer`, `renameLayer`, `moveLayer`, `setLayerLocked`,
  `setLayerHidden`, `setLayerVisible`, `setActiveLayer`, `moveSelectionToLayer`, `deleteLayer`, состояние `layers`,
  `revealCell` в скрытом слое, изображения по видимым слоям; `test/fakeEditor.ts`; проверка: тесты команд — шаг отмены,
  чужая правка, просмотр, блокировка, удаление с переносом и с содержимым

## 3. Интерфейс

- [x] 3.1 frontend: `diagram/LayersPanel.tsx` — кнопка и панель «Слои», строка слоя, окно удаления; `pages/BoardPage.tsx`,
  `diagram/DiagramCanvas.tsx` — `LayerViews` доски; `image/pdf.ts` — видимость участника на других страницах; проверка:
  компонентные тесты панели

## 4. Файлы и остальное

- [x] 4.1 frontend: `drawio/parse.ts`, `drawio/serialize.ts`, `drawio/importPages.ts` — слои туда и обратно с
  `visible="0"` и `locked=1`, выгрузка только нарисованного; проверка: тесты обмена
- [x] 4.2 frontend: `diagram/diff.ts` — без ячеек слоёв; верхний уровень по слоям в `sql/erDiagram.ts`,
  `apiSpec/apiSpecCells.ts`, `architecture/model.ts`, `proposals/schemaImportUpdate.ts`, `diagram/clipboardFormat.ts`;
  проверка: тесты сравнения и выгрузки архитектуры

## 5. Документация и проверка

- [x] 5.1 docs: README (возможности, раздел «Слои»), «Что нового» 0.13.0 и `version` в `frontend/package.json`;
  проверка: тесты «Что нового»
- [x] 5.2 e2e: `diagram-layers.spec.ts` — два участника: слой, перенос, скрытие у себя и для всех, блокировка, отмена,
  `.drawio` туда и обратно; проверка: `pnpm --filter @codraw/e2e typecheck` и прогон спецификации
- [x] 5.3 Проверка: `pnpm typecheck`, `pnpm lint`, `pnpm --filter @codraw/frontend test`, `pnpm --filter
  @codraw/frontend build`, `openspec validate --all --strict`

## Workflow follow-up

- Архивировать изменение после проверки.
