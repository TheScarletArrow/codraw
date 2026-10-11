# Tasks

## 1. frontend: версия сборки

- [x] 1.1 frontend: плагин `vite/versionFile.ts` — идентификатор сборки, `define` версии и сборки, `version.json` в сборке и на dev-сервере; проверить юнит-тестом плагина и `pnpm build`
- [x] 1.2 frontend: `location = /version.json` в `nginx/default.conf.template` с `no-cache`; проверить стековой проверкой заголовков

## 2. frontend: новая версия и восстановление

- [x] 2.1 frontend: `update/version.ts` — чтение и проверка `version.json`, сравнение со своей сборкой; проверить юнит-тестами
- [x] 2.2 frontend: `update/updates.ts` — состояние «новая версия», проверки по таймеру, `visibilitychange`, `online`, `vite:preloadError`; проверить юнит-тестами с подменой таймеров и `fetch`
- [x] 2.3 frontend: `update/reload.ts` — `reloadOnce` с отметкой в `sessionStorage`, `registerUnsavedWork` и `prepareReload`; проверить юнит-тестами
- [x] 2.4 frontend: `lazyPage` в `routes.tsx` для всех ленивых маршрутов, `AppError` показывает `StaleClient` для `ChunkLoadError`; проверить компонентными тестами
- [x] 2.5 frontend: `UpdateBanner` в `App`, тексты ru/en в `update/messages.ts`; проверить компонентными тестами и тестом словарей
- [x] 2.6 frontend: `BoardPage` и `ProposalPage` регистрируют незавершённую подпись и неотправленные правки, `useNewerDocument` переводит документ новее схемы в чтение; проверить юнит-тестами

## 3. Документация и проверки

- [x] 3.1 frontend: новинка в `releaseNotes/releases.ts` на ru/en, версия 0.41.0 в `package.json`, тема справки в `help/topics.messages.ts`; проверить тестами заметок о выпуске, словарей и справки
- [x] 3.2 README: возможность в списке, раздел «Обновление открытых вкладок», пункт 112 «Плана работ»; проверить чтением
- [x] 3.3 e2e: подмена `version.json` и 404 на файл сборки через `page.route` для списка досок, доски, `/view/:boardId` и `/help`; проверить прогоном Playwright в Chromium
- [x] 3.4 Прогнать проверки как в CI: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `openspec validate --all --strict`, e2e затронутых сценариев
