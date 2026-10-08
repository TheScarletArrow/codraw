# Tasks

## 1. Backend

- [x] 1.1 backend: миграции `V20`/`U20` — `shape_libraries` и `library_components` с проверками названий и каскадным
  удалением; проверка: `MigrationsTest`
- [x] 1.2 backend: пакет `library` — репозиторий, `LibraryService` (блокировка пользователя, пределы числа и места),
  `LibraryController` (API и problem details), проверка компонента (`ComponentContents`: XML без DTD, картинки по
  сигнатуре, размеры, адреса, образец) и SVG (`SvgIcons`); пределы `LimitProperties`, метки `Limit`; проверка:
  `LibraryApiTest` (создание, список, содержимое, правка, удаление, 404 чужому, пределы), `ComponentContentsTest`,
  `SvgIconsTest`
- [x] 1.3 backend: перенос библиотек гостя при входе (`UserService`), удаление с пользователем; проверка: тесты переноса
  и уборки гостей
- [x] 1.4 deploy: новые пределы в `docker-compose.prod.yml` и `docs/deploy.md`; проверка: `docker compose -f
  docker-compose.prod.yml config`

## 2. Компонент без интерфейса

- [x] 2.1 frontend: `api/libraries.ts` — типы, запросы и разбор ошибок пределов; `libraries/useLibraries.ts` — список,
  изменения, сообщения и содержимое по `updatedAt`; проверка: unit-тесты сообщений об ошибках и хука с подменённым API
- [x] 2.2 frontend: `libraries/svgIcon.ts` (очистка и размер SVG), `libraries/pictureSize.ts` (размер PNG, JPEG, GIF и
  WebP из заголовка), компоненты из файлов; проверка: unit-тесты очистки, размеров и отказов
- [x] 2.3 frontend: редактор — `selectionComponent`, `insertComponent`, `applyComponentStyle`, `cellsXml` в
  `clipboardFormat.ts`; проверка: тесты редактора — состав компонента, новые идентификаторы и элементы, середина в
  точке, шаг отмены, стиль одним шагом, закреплённое, только чтение
- [x] 2.4 frontend: `libraries/component.ts` — компонент из выделения с вложенными картинками доски и образцом;
  проверка: unit-тесты вложения картинок и отказа без картинки

## 3. Интерфейс

- [x] 3.1 frontend: раздел «Мои библиотеки» панели фигур (`libraries/LibrarySections.tsx`, `ShapePalette.tsx`), меню
  библиотеки и компонента, поиск компонентов; проверка: компонентные тесты — список, вставка щелчком, перетаскивание,
  поиск и Enter, меню, подтверждения, ошибки
- [x] 3.2 frontend: «Сохранить в библиотеку…» — `canvasMenu.ts`, `CanvasMenu.tsx`, окно `SaveToLibraryDialog.tsx`;
  проверка: тесты меню и окна — пункт по целям, название по умолчанию, новая библиотека, ошибки
- [x] 3.3 frontend: `DiagramCanvas.tsx` — бросок компонента; страницы доски и черновика; проверка: тест броска

## 4. Документация и проверка

- [x] 4.1 frontend: политика конфиденциальности — библиотеки фигур; проверка: тест страницы политики
- [x] 4.2 docs: README (возможности, раздел «Библиотеки фигур», пределы, персональные данные), «Что нового» 0.13.0 и
  `version` в `frontend/package.json`; проверка: тесты «Что нового»
- [ ] 4.3 e2e: `shape-libraries.spec.ts` — сохранение группы со связью, вставка двумя участниками, независимые копии,
  замена и удаление без изменения копий, свой SVG в `.drawio`, чужая библиотека недоступна; проверка: `pnpm --filter
  @codraw/e2e typecheck` и прогон спецификации
- [ ] 4.4 Проверка: `./gradlew build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `openspec validate
  --all --strict`

## Workflow follow-up

- Архивировать изменение после проверки.
